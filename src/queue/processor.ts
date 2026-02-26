import { and, eq, lte, or, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { syncJobs, syncErrors } from "../db/schema.ts";
import { logger } from "../lib/logger.ts";

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 30_000; // 30s, 60s, 2m, 4m, 8m

/**
 * Fetches pending jobs that are eligible for processing.
 * Jobs with status 'pending' or 'failed' with nextRetryAt <= now.
 */
export async function dequeueJobs(batchSize: number = 10) {
  const now = new Date();

  const jobs = await db
    .select()
    .from(syncJobs)
    .where(
      or(
        eq(syncJobs.status, "pending"),
        and(
          eq(syncJobs.status, "failed"),
          or(lte(syncJobs.nextRetryAt, now), isNull(syncJobs.nextRetryAt)),
        ),
      ),
    )
    .orderBy(syncJobs.createdAt)
    .limit(batchSize);

  if (jobs.length === 0) return [];

  // Mark as processing
  const jobIds = jobs.map((j) => j.id);
  await db
    .update(syncJobs)
    .set({ status: "processing", updatedAt: now })
    .where(
      sql`${syncJobs.id} = ANY(ARRAY[${sql.raw(jobIds.join(","))}]::int[])`,
    );

  return jobs;
}

/**
 * Marks jobs as completed.
 */
export async function markCompleted(jobIds: number[]): Promise<void> {
  if (jobIds.length === 0) return;

  await db
    .update(syncJobs)
    .set({ status: "completed", updatedAt: new Date() })
    .where(
      sql`${syncJobs.id} = ANY(ARRAY[${sql.raw(jobIds.join(","))}]::int[])`,
    );
}

/**
 * Marks a job as failed with exponential backoff.
 * After MAX_ATTEMPTS, moves to dead_letter.
 */
export async function markFailed(
  jobId: number,
  attempts: number,
  error: Error,
  requestPayload?: unknown,
  responsePayload?: unknown,
): Promise<void> {
  const newAttempts = attempts + 1;

  if (newAttempts >= MAX_ATTEMPTS) {
    // Move to dead letter
    await db
      .update(syncJobs)
      .set({
        status: "dead_letter",
        attempts: newAttempts,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, jobId));

    logger.error("Job moved to dead letter", {
      jobId,
      attempts: newAttempts,
      error: error.message,
    });
  } else {
    // Exponential backoff
    const backoffMs = BACKOFF_BASE_MS * Math.pow(2, newAttempts - 1);
    const nextRetryAt = new Date(Date.now() + backoffMs);

    await db
      .update(syncJobs)
      .set({
        status: "failed",
        attempts: newAttempts,
        nextRetryAt,
        updatedAt: new Date(),
      })
      .where(eq(syncJobs.id, jobId));

    logger.warn("Job failed, will retry", {
      jobId,
      attempts: newAttempts,
      nextRetryMs: backoffMs,
    });
  }

  // Log to sync_errors for debugging
  await db.insert(syncErrors).values({
    syncJobId: jobId,
    errorMessage: error.message,
    requestPayload: requestPayload ?? null,
    responsePayload: responsePayload ?? null,
  });
}

/**
 * Resets stale processing jobs back to pending (crash recovery).
 */
export async function resetStaleJobs(): Promise<number> {
  const result = await db
    .update(syncJobs)
    .set({ status: "pending", updatedAt: new Date() })
    .where(eq(syncJobs.status, "processing"))
    .returning({ id: syncJobs.id });

  if (result.length > 0) {
    logger.info("Reset stale processing jobs", { count: result.length });
  }

  return result.length;
}

/**
 * Returns queue statistics for the health endpoint.
 */
export async function getQueueStats() {
  const stats = await db
    .select({
      status: syncJobs.status,
      count: sql<number>`count(*)::int`,
    })
    .from(syncJobs)
    .groupBy(syncJobs.status);

  const result: Record<string, number> = {};
  for (const row of stats) {
    result[row.status] = row.count;
  }
  return result;
}
