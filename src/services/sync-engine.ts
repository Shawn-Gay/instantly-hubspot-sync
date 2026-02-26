import { logger } from "../lib/logger.ts";
import { ApiError } from "../lib/errors.ts";
import { dequeueJobs, markCompleted, markFailed } from "../queue/processor.ts";
import { syncToHubSpot, type SyncJobPayload } from "./hubspot/sync.ts";
import { config } from "../config.ts";

let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

async function processBatch(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const jobs = await dequeueJobs(10);
    if (jobs.length === 0) return;

    logger.info("Processing sync batch", { jobCount: jobs.length });

    const jobInputs = jobs.map((j) => ({
      id: j.id,
      leadEmail: j.leadEmail,
      payload: j.payload as SyncJobPayload,
    }));

    try {
      await syncToHubSpot(jobInputs);
      await markCompleted(jobs.map((j) => j.id));
      logger.info("Sync batch completed", { jobCount: jobs.length });
    } catch (error) {
      // If batch fails, fail each job individually for proper retry tracking
      const err = error instanceof Error ? error : new Error(String(error));
      const responsePayload =
        error instanceof ApiError ? error.responseBody : undefined;

      for (const job of jobs) {
        await markFailed(
          job.id,
          job.attempts,
          err,
          job.payload,
          responsePayload,
        );
      }
    }
  } catch (error) {
    logger.error("Sync engine error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    running = false;
  }
}

export function startSyncEngine(): void {
  logger.info("Starting sync engine", { intervalMs: config.syncIntervalMs });
  intervalId = setInterval(processBatch, config.syncIntervalMs);
  // Run immediately on start
  processBatch();
}

export function stopSyncEngine(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("Sync engine stopped");
  }
}
