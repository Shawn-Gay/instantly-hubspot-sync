/**
 * Permanently deletes all archived (recycling bin) HubSpot contacts.
 *
 * Run with:
 *   bun run scripts/purge-hubspot-recycling-bin.ts
 *
 * Requires GDPR features enabled on your HubSpot account:
 *   Settings → Privacy & Consent → Enable GDPR features
 */

import { config } from "../src/config.ts";
import { gdprDeleteContact } from "../src/services/hubspot/client.ts";
import { hubspotLimiter } from "../src/lib/rate-limiter.ts";

const BASE_URL = "https://api.hubapi.com";
const CONCURRENCY = 10;

interface ArchivedContactsResponse {
  results: Array<{ id: string }>;
  paging?: { next?: { after: string } };
}

async function listArchivedContacts(after?: string): Promise<ArchivedContactsResponse> {
  const params = new URLSearchParams({ archived: "true", limit: "100" });
  if (after) params.set("after", after);

  await hubspotLimiter.acquire();
  const res = await fetch(`${BASE_URL}/crm/v3/objects/contacts?${params}`, {
    headers: { Authorization: `Bearer ${config.hubspotAccessToken}` },
  });

  if (!res.ok) throw new Error(`Failed to list archived contacts: ${res.status} ${await res.text()}`);
  return res.json() as Promise<ArchivedContactsResponse>;
}

async function main() {
  console.log("Fetching archived HubSpot contacts...\n");

  let after: string | undefined;
  const allIds: string[] = [];

  do {
    const page = await listArchivedContacts(after);
    for (const contact of page.results) allIds.push(contact.id);
    after = page.paging?.next?.after;
    if (after) process.stdout.write(`\rFetched ${allIds.length} archived contacts...`);
  } while (after);

  console.log(`\nFound ${allIds.length} contacts in the recycling bin.`);
  if (allIds.length === 0) return;

  console.log(`Permanently deleting (concurrency: ${CONCURRENCY})...\n`);

  let deleted = 0;

  for (let i = 0; i < allIds.length; i += CONCURRENCY) {
    const chunk = allIds.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((id) => gdprDeleteContact(id)));
    deleted += chunk.length;
    process.stdout.write(`\rDeleted ${deleted} / ${allIds.length}...`);
  }

  console.log(`\n\nDone. Permanently deleted ${deleted} contacts.`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  if (err.message.includes("403")) {
    console.error(
      "\nHint: GDPR delete may not be enabled. Go to:\n" +
        "  HubSpot Settings → Privacy & Consent → Enable GDPR features",
    );
  }
  process.exit(1);
});
