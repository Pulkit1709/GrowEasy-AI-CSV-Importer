import Papa from "papaparse";
import { AppError } from "@/server/errors";
import type { RawRecord } from "@/types/import";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function cleanHeader(header: string, index: number) {
  const normalized = header.replace(/^\uFEFF/, "").trim();
  return normalized || `column_${index + 1}`;
}

function cleanValue(value: unknown) {
  const trimmed = String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function isBlankRow(row: RawRecord) {
  return Object.values(row).every((value) => value.trim() === "");
}

export function validateCsvFile(file: File) {
  if (!file.name.toLowerCase().endsWith(".csv")) {
    throw new AppError("Please upload a CSV file.", 415, "INVALID_FILE_TYPE");
  }

  if (file.size === 0) {
    throw new AppError("The selected CSV file is empty.", 400, "EMPTY_FILE");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new AppError("CSV file is too large. Maximum size is 5MB.", 413, "FILE_TOO_LARGE");
  }
}

export function parseCsvText(csvText: string): RawRecord[] {
  if (!csvText.trim()) {
    throw new AppError("The CSV file does not contain any rows.", 400, "EMPTY_CSV");
  }

  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: cleanHeader
  });

  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new AppError(
      `Malformed CSV near row ${firstError.row ?? "unknown"}: ${firstError.message}`,
      400,
      "MALFORMED_CSV"
    );
  }

  const rows = parsed.data.map((row) => {
    const cleanRow: RawRecord = {};
    for (const [key, value] of Object.entries(row)) {
      cleanRow[String(key).trim()] = cleanValue(value);
    }
    return cleanRow;
  }).filter((row) => !isBlankRow(row));

  if (rows.length === 0) {
    throw new AppError("The CSV only contains headers or blank rows.", 400, "NO_DATA_ROWS");
  }

  return rows;
}

export async function parseCsvFile(file: File) {
  validateCsvFile(file);
  return parseCsvText(await file.text());
}

export function normalizeJsonRows(rows: RawRecord[]) {
  return rows.map((row) => {
    const cleanRow: RawRecord = {};
    for (const [key, value] of Object.entries(row)) {
      cleanRow[String(key).replace(/^\uFEFF/, "").trim()] = cleanValue(value);
    }
    return cleanRow;
  }).filter((row) => !isBlankRow(row));
}
