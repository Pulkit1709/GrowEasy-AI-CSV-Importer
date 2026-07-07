import { crmRecordSchema, crmStatuses, dataSources, type CrmRecord, type RawRecord } from "@/types/import";

const emptyRecord: CrmRecord = {
  created_at: "",
  name: "",
  email: "",
  country_code: "",
  mobile_without_country_code: "",
  company: "",
  city: "",
  state: "",
  country: "",
  lead_owner: "",
  crm_status: "",
  crm_note: "",
  data_source: "",
  possession_time: "",
  description: ""
};

export function csvSafe(value: string) {
  return value.replace(/\r\n|\r|\n/g, "\\n").trim();
}

export function sanitizeCrmRecord(candidate: unknown): CrmRecord | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }

  const source = candidate as Record<string, unknown>;
  const record: Record<keyof CrmRecord, string> = { ...emptyRecord };
  for (const key of Object.keys(record) as Array<keyof CrmRecord>) {
    record[key] = csvSafe(String(source[key] ?? ""));
  }

  if (!crmStatuses.includes(record.crm_status as never)) {
    record.crm_status = "";
  }

  if (!dataSources.includes(record.data_source as never)) {
    record.data_source = "";
  }

  if (record.created_at && Number.isNaN(new Date(record.created_at).getTime())) {
    record.crm_note = [record.crm_note, `unparseable created_at from AI: ${record.created_at}`].filter(Boolean).join("; ");
    record.created_at = "";
  }

  const parsed = crmRecordSchema.safeParse(record);
  return parsed.success ? parsed.data : null;
}

export function shouldSkipRecord(record: CrmRecord) {
  return record.email.trim() === "" && record.mobile_without_country_code.trim() === "";
}

export function detectContactPresence(row: RawRecord) {
  const haystack = Object.values(row).join(" ");
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(haystack);
  const phone = /(?:\+?\d[\d\s().-]{6,}\d)/.test(haystack);
  return { email, phone, hasAnyContact: email || phone };
}
