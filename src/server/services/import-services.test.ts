import { describe, expect, it } from "vitest";
import { splitIntoBatches } from "@/server/services/batching-service";
import { parseCsvText } from "@/server/services/csv-service";
import { mapRowsHeuristically } from "@/server/services/heuristic-mapper";
import { sanitizeCrmRecord, shouldSkipRecord } from "@/server/services/validation-service";

describe("csv service", () => {
  it("handles BOM, quoted commas, whitespace, and blank rows", () => {
    const rows = parseCsvText("\uFEFFName, Phone,Notes\n \"Rahil\" ,\"+91 98765 43210\",\"hello, again\"\n,,\n");
    expect(rows).toHaveLength(1);
    expect(rows[0].Name).toBe("Rahil");
    expect(rows[0].Notes).toBe("hello, again");
  });
});

describe("validation service", () => {
  it("clears invalid enum values and escapes newlines", () => {
    const record = sanitizeCrmRecord({
      created_at: "not a date",
      name: "A",
      email: "a@example.com",
      mobile_without_country_code: "",
      crm_status: "MAYBE",
      data_source: "facebook",
      crm_note: "line one\nline two"
    });
    expect(record?.crm_status).toBe("");
    expect(record?.data_source).toBe("");
    expect(record?.crm_note).toContain("\\n");
  });

  it("applies the skip rule after mapping", () => {
    const record = sanitizeCrmRecord({ name: "No Contact" });
    expect(record && shouldSkipRecord(record)).toBe(true);
  });
});

describe("batching service", () => {
  it("splits rows into retryable batches", () => {
    const batches = splitIntoBatches([1, 2, 3, 4, 5], 2);
    expect(batches.map((batch) => batch.rows)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batches[1].batchIndex).toBe(1);
    expect(batches[1].startRow).toBe(3);
  });
});

describe("heuristic fallback", () => {
  it("maps obvious contact/status/source fields and skips no-contact rows", () => {
    const records = mapRowsHeuristically([
      { Name: "Karan", Phone: "+91 98765 43210", Stage: "no answer", Source: "Sarjapur plots" },
      { Name: "No Contact", Stage: "interested" }
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].mobile_without_country_code).toBe("9876543210");
    expect(records[0].crm_status).toBe("DID_NOT_CONNECT");
    expect(records[0].data_source).toBe("sarjapur_plots");
  });
});
