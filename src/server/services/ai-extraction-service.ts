import { buildSystemPrompt, buildUserPrompt } from "@/server/services/prompt-service";
import { mapRowsHeuristically } from "@/server/services/heuristic-mapper";
import { detectContactPresence, sanitizeCrmRecord, shouldSkipRecord } from "@/server/services/validation-service";
import { callLLM } from "@/server/services/llm-client";
import type { BatchResult, CrmRecord, ImportResult, RawRecord, SkippedRecord } from "@/types/import";

function parseJsonArray(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error("AI response was not a JSON array.");
  }
  return parsed;
}

async function extractBatch(rows: RawRecord[]) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(rows);

  try {
    const first = parseJsonArray(await callLLM(systemPrompt, userPrompt));
    return first;
  } catch (firstError) {
    console.warn("First LLM attempt failed; retrying batch once", firstError);
    const second = parseJsonArray(await callLLM(systemPrompt, userPrompt));
    return second;
  }
}

function validateMappedRows(candidates: unknown[]) {
  return candidates.map(sanitizeCrmRecord).filter((record): record is CrmRecord => Boolean(record));
}

function buildSkippedRows(rows: RawRecord[], mapped: CrmRecord[]) {
  const skipped: SkippedRecord[] = [];
  const skippedCountFromAi = Math.max(0, rows.length - mapped.length);

  for (const row of rows) {
    const contact = detectContactPresence(row);
    if (!contact.hasAnyContact) {
      skipped.push({ originalRow: row, reason: "no email or mobile number found" });
    }
  }

  for (let i = skipped.length; i < skippedCountFromAi; i += 1) {
    skipped.push({
      originalRow: rows[i] ?? {},
      reason: "AI omitted this row or returned an invalid mapped record"
    });
  }

  return skipped;
}

export async function processBatches(
  batches: Array<{ batchIndex: number; startRow: number; endRow: number; rows: RawRecord[] }>
): Promise<ImportResult> {
  const importedRecords: CrmRecord[] = [];
  const skippedRecords: SkippedRecord[] = [];
  const batchResults: BatchResult[] = [];

  for (const batch of batches) {
    try {
      let rawMapped: unknown[];
      try {
        rawMapped = await extractBatch(batch.rows);
      } catch (llmError) {
        if ((process.env.OLLAMA_ALLOW_HEURISTIC_FALLBACK ?? "true") !== "true") {
          throw llmError;
        }
        console.warn("Using heuristic fallback because LLM extraction failed", llmError);
        rawMapped = mapRowsHeuristically(batch.rows);
      }

      const mapped = validateMappedRows(rawMapped).filter((record) => !shouldSkipRecord(record));
      const skipped = buildSkippedRows(batch.rows, mapped);
      importedRecords.push(...mapped);
      skippedRecords.push(...skipped);
      batchResults.push({
        batchIndex: batch.batchIndex,
        startRow: batch.startRow,
        endRow: batch.endRow,
        status: "success",
        importedCount: mapped.length,
        skippedCount: skipped.length
      });

      console.info("Batch mapping sample", {
        batchIndex: batch.batchIndex,
        raw: batch.rows[0],
        mapped: mapped[0]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI batch error";
      batchResults.push({
        batchIndex: batch.batchIndex,
        startRow: batch.startRow,
        endRow: batch.endRow,
        status: "failed",
        importedCount: 0,
        skippedCount: 0,
        error: message
      });
    }
  }

  return {
    importedRecords,
    skippedRecords,
    totalImported: importedRecords.length,
    totalSkipped: skippedRecords.length,
    batchResults
  };
}
