import { logger } from "../../lib/logger.ts";
import { createPropertyGroup, createProperty, patchProperty } from "./client.ts";
import type { HubSpotPropertyDefinition } from "./types.ts";

const GROUP_NAME = "instantly_integration";

const PROPERTY_DEFINITIONS: HubSpotPropertyDefinition[] = [
  {
    name: "instantly_campaign_name",
    label: "Instantly Campaign Name",
    type: "string",
    fieldType: "text",
    groupName: GROUP_NAME,
    description: "Name of the Instantly campaign",
  },
  {
    name: "instantly_campaign_id",
    label: "Instantly Campaign ID",
    type: "string",
    fieldType: "text",
    groupName: GROUP_NAME,
    description: "UUID of the Instantly campaign",
  },
  {
    name: "instantly_lead_status",
    label: "Instantly Lead Status",
    type: "string",
    fieldType: "text",
    groupName: GROUP_NAME,
    description: "Lead status from Instantly",
  },
  {
    name: "instantly_last_email_sent_date",
    label: "Instantly Last Email Sent",
    type: "datetime",
    fieldType: "date",
    groupName: GROUP_NAME,
    description: "Timestamp of last email sent via Instantly",
  },
  {
    name: "instantly_email_open_count",
    label: "Instantly Email Open Count",
    type: "number",
    fieldType: "number",
    groupName: GROUP_NAME,
    description: "Number of email opens tracked by Instantly",
  },
  {
    name: "instantly_email_click_count",
    label: "Instantly Email Click Count",
    type: "number",
    fieldType: "number",
    groupName: GROUP_NAME,
    description: "Number of email clicks tracked by Instantly",
  },
  {
    name: "instantly_reply_received",
    label: "Instantly Reply Received",
    type: "enumeration",
    fieldType: "booleancheckbox",
    groupName: GROUP_NAME,
    description: "Whether the lead has replied",
    options: [
      { label: "Yes", value: "true", displayOrder: 0 },
      { label: "No", value: "false", displayOrder: 1 },
    ],
  },
  {
    name: "instantly_reply_snippet",
    label: "Instantly Reply Snippet",
    type: "string",
    fieldType: "textarea",
    groupName: GROUP_NAME,
    description: "Preview text of the lead's reply",
  },
  {
    name: "instantly_email_bounced",
    label: "Instantly Email Bounced",
    type: "enumeration",
    fieldType: "booleancheckbox",
    groupName: GROUP_NAME,
    description: "Whether the email bounced",
    options: [
      { label: "Yes", value: "true", displayOrder: 0 },
      { label: "No", value: "false", displayOrder: 1 },
    ],
  },
  {
    name: "instantly_unsubscribed",
    label: "Instantly Unsubscribed",
    type: "enumeration",
    fieldType: "booleancheckbox",
    groupName: GROUP_NAME,
    description: "Whether the lead has unsubscribed",
    options: [
      { label: "Yes", value: "true", displayOrder: 0 },
      { label: "No", value: "false", displayOrder: 1 },
    ],
  },
  {
    name: "instantly_last_activity_date",
    label: "Instantly Last Activity",
    type: "datetime",
    fieldType: "date",
    groupName: GROUP_NAME,
    description: "Most recent activity timestamp from Instantly",
  },
];

export async function ensureCustomProperties(): Promise<void> {
  logger.info("Ensuring HubSpot custom property group exists...");

  await createPropertyGroup({
    name: GROUP_NAME,
    label: "Instantly Integration",
    displayOrder: 6,
  });

  logger.info("Ensuring HubSpot custom properties exist...");

  for (const prop of PROPERTY_DEFINITIONS) {
    const result = await createProperty(prop);
    if (result) {
      logger.info("Created HubSpot property", { name: prop.name });
    } else {
      // Property already exists — patch it to ensure type/fieldType match the current definition
      await patchProperty(prop.name, { type: prop.type, fieldType: prop.fieldType, label: prop.label, description: prop.description });
      logger.debug("HubSpot property already exists (patched)", { name: prop.name });
    }
  }

  logger.info("HubSpot custom properties ready");
}
