// ─── Contact Types ───────────────────────────────────────

export interface HubSpotContactInput {
  email: string;
  properties: Record<string, string | number | boolean>;
}

export interface HubSpotBatchUpsertRequest {
  inputs: Array<{
    idProperty: "email";
    id: string;
    properties: Record<string, string>;
  }>;
}

export interface HubSpotBatchUpsertResponse {
  status: string;
  results: Array<{
    id: string;
    properties: {
      email?: string;
      [key: string]: string | undefined;
    };
  }>;
}

// ─── Property Types ──────────────────────────────────────

export interface HubSpotPropertyDefinition {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  groupName: string;
  description: string;
  options?: Array<{
    label: string;
    value: string;
    displayOrder: number;
  }>;
}

export interface HubSpotPropertyGroup {
  name: string;
  label: string;
  displayOrder: number;
}
