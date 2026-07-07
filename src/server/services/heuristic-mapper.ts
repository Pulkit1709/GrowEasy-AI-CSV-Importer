import type { CrmRecord, RawRecord } from "@/types/import";
import { csvSafe, shouldSkipRecord } from "@/server/services/validation-service";

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const phoneRegex = /(?:\+?\d[\d\s().-]{6,}\d)/g;

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findValue(row: RawRecord, keys: string[]) {
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizedKey(key);
    if (keys.some((candidate) => normalized.includes(candidate))) {
      return value;
    }
  }
  return "";
}

function allText(row: RawRecord) {
  return Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(" ");
}

function extractEmails(text: string) {
  return Array.from(text.matchAll(emailRegex), (match) => match[0]);
}

function normalizePhone(raw: string) {
  const hasPlus91 = /^\s*\+?91[\s().-]*/.test(raw);
  const digits = raw.replace(/\D/g, "");
  if (hasPlus91 && digits.length > 10) {
    return { countryCode: "+91", mobile: digits.slice(-10) };
  }
  return { countryCode: "", mobile: digits };
}

function extractPhones(text: string) {
  return Array.from(text.matchAll(phoneRegex), (match) => match[0])
    .map(normalizePhone)
    .filter((phone) => phone.mobile.length >= 7);
}

function mapStatus(text: string) {
  const value = text.toLowerCase();
  if (/(booked|closed|won|converted|sold|sale done)/.test(value)) return "SALE_DONE";
  if (/(no answer|not connect|unreachable|did not pick|dnc)/.test(value)) return "DID_NOT_CONNECT";
  if (/(bad|invalid|spam|junk|not interested|wrong number)/.test(value)) return "BAD_LEAD";
  if (/(interested|follow|call back|warm|brochure)/.test(value)) return "GOOD_LEAD_FOLLOW_UP";
  return "";
}

function mapSource(text: string) {
  const value = text.toLowerCase();
  if (/leads?\s*on\s*demand/.test(value)) return "leads_on_demand";
  if (/meridian/.test(value)) return "meridian_tower";
  if (/eden/.test(value)) return "eden_park";
  if (/varah|swamy/.test(value)) return "varah_swamy";
  if (/sarjapur/.test(value)) return "sarjapur_plots";
  return "";
}

function parseDate(raw: string) {
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 25000 && numeric < 70000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + numeric * 86400000).toISOString().replace("T", " ").slice(0, 19);
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().replace("T", " ").slice(0, 19);
  }
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(.*)$/);
  if (dmy) {
    const [, day, month, year, rest] = dmy;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const parsedDmy = new Date(`${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")} ${rest.trim()}`);
    if (!Number.isNaN(parsedDmy.getTime())) {
      return parsedDmy.toISOString().replace("T", " ").slice(0, 19);
    }
  }
  return "";
}

export function mapRowsHeuristically(rows: RawRecord[]) {
  const mapped: CrmRecord[] = [];

  for (const row of rows) {
    const text = allText(row);
    const emails = extractEmails(text);
    const phones = extractPhones(text);
    const firstPhone = phones[0];
    const notes = [
      findValue(row, ["note", "remark", "comment", "feedback"]),
      ...emails.slice(1).map((email) => `extra email: ${email}`),
      ...phones.slice(1).map((phone) => `extra phone: ${phone.mobile}`)
    ].filter(Boolean);

    const record: CrmRecord = {
      created_at: parseDate(findValue(row, ["date", "created", "time", "timestamp"])),
      name: findValue(row, ["fullname", "name", "client", "customer", "leadname"]),
      email: emails[0] ?? "",
      country_code: firstPhone?.countryCode ?? "",
      mobile_without_country_code: firstPhone?.mobile ?? "",
      company: findValue(row, ["company", "organization", "organisation"]),
      city: findValue(row, ["city"]),
      state: findValue(row, ["state"]),
      country: findValue(row, ["country"]),
      lead_owner: findValue(row, ["owner", "rep", "agent", "assignee"]),
      crm_status: mapStatus(text),
      crm_note: notes.map(csvSafe).join("; "),
      data_source: mapSource(text),
      possession_time: findValue(row, ["possession"]),
      description: findValue(row, ["description", "requirement", "summary"])
    };

    if (!shouldSkipRecord(record)) {
      mapped.push(record);
    }
  }

  return mapped;
}
