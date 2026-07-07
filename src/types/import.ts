import { z } from "zod";

export const crmStatuses = [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE"
] as const;

export const dataSources = [
  "leads_on_demand",
  "meridian_tower",
  "eden_park",
  "varah_swamy",
  "sarjapur_plots"
] as const;

export const crmFieldNames = [
  "created_at",
  "name",
  "email",
  "country_code",
  "mobile_without_country_code",
  "company",
  "city",
  "state",
  "country",
  "lead_owner",
  "crm_status",
  "crm_note",
  "data_source",
  "possession_time",
  "description"
] as const;

export type RawRecord = Record<string, string>;
export type CrmStatus = (typeof crmStatuses)[number];
export type DataSource = (typeof dataSources)[number];
export type CrmFieldName = (typeof crmFieldNames)[number];

export const crmRecordSchema = z.object({
  created_at: z.string(),
  name: z.string(),
  email: z.string(),
  country_code: z.string(),
  mobile_without_country_code: z.string(),
  company: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  lead_owner: z.string(),
  crm_status: z.union([z.enum(crmStatuses), z.literal("")]),
  crm_note: z.string(),
  data_source: z.union([z.enum(dataSources), z.literal("")]),
  possession_time: z.string(),
  description: z.string()
});

export type CrmRecord = z.infer<typeof crmRecordSchema>;

export const uploadRowsSchema = z.object({
  rows: z.array(z.record(z.string())).min(1).max(5000)
});

export const processRowsSchema = z.object({
  rows: z.array(z.record(z.string())).min(1).max(5000).optional(),
  retryBatchIndexes: z.array(z.number().int().nonnegative()).optional()
});

export type SkippedRecord = {
  originalRow: RawRecord;
  reason: string;
};

export type BatchResult = {
  batchIndex: number;
  startRow: number;
  endRow: number;
  status: "success" | "failed";
  importedCount: number;
  skippedCount: number;
  error?: string;
};

export type ImportResult = {
  importedRecords: CrmRecord[];
  skippedRecords: SkippedRecord[];
  totalImported: number;
  totalSkipped: number;
  batchResults: BatchResult[];
};
