export interface ZohoContact {
  id: string;
  [key: string]: unknown;
}

export interface ZohoSearchResponse {
  data?: ZohoContact[];
  info?: { count: number; more_records: boolean };
}

export interface ZohoTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}
