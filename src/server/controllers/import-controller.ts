import { AppError } from "@/server/errors";
import { splitIntoBatches } from "@/server/services/batching-service";
import { parseCsvFile, normalizeJsonRows } from "@/server/services/csv-service";
import { createImportSession, getImportSession, saveImportResult } from "@/server/services/import-store";
import { processBatches } from "@/server/services/ai-extraction-service";
import { processRowsSchema, uploadRowsSchema, type RawRecord } from "@/types/import";

export async function uploadImport(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let rows: RawRecord[];

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("CSV file is required.", 400, "MISSING_FILE");
    }
    rows = await parseCsvFile(file);
  } else {
    const body = uploadRowsSchema.parse(await request.json());
    rows = normalizeJsonRows(body.rows);
  }

  const importId = createImportSession(rows);
  return {
    importId,
    rawRecordCount: rows.length,
    previewRows: rows.slice(0, 50)
  };
}

export async function processImport(importId: string, request: Request) {
  const body = processRowsSchema.parse(await request.json().catch(() => ({})));
  const session = getImportSession(importId);
  const rows = body.rows ? normalizeJsonRows(body.rows) : session?.rows;

  if (!rows || rows.length === 0) {
    throw new AppError("Import session not found or expired. Please upload the CSV again.", 404, "IMPORT_NOT_FOUND");
  }

  const allBatches = splitIntoBatches(rows, 25);
  const batches = body.retryBatchIndexes?.length
    ? allBatches.filter((batch) => body.retryBatchIndexes?.includes(batch.batchIndex))
    : allBatches;

  if (batches.length === 0) {
    throw new AppError("No matching failed batches were found to retry.", 400, "NO_BATCHES_TO_PROCESS");
  }

  const result = await processBatches(batches);
  saveImportResult(importId, result);
  return result;
}

export async function getImportStatus(importId: string) {
  const session = getImportSession(importId);
  if (!session) {
    throw new AppError("Import session not found or expired.", 404, "IMPORT_NOT_FOUND");
  }

  return {
    importId,
    rawRecordCount: session.rows.length,
    result: session.result ?? null
  };
}
