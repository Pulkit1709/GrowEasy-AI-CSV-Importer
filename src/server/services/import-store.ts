import type { ImportResult, RawRecord } from "@/types/import";

type ImportSession = {
  importId: string;
  rows: RawRecord[];
  createdAt: number;
  result?: ImportResult;
};

const sessions = new Map<string, ImportSession>();
const ttlMs = 30 * 60 * 1000;

function pruneExpiredSessions() {
  const expiresBefore = Date.now() - ttlMs;
  for (const [id, session] of sessions) {
    if (session.createdAt < expiresBefore) {
      sessions.delete(id);
    }
  }
}

export function createImportSession(rows: RawRecord[]) {
  pruneExpiredSessions();
  const importId = crypto.randomUUID();
  sessions.set(importId, { importId, rows, createdAt: Date.now() });
  return importId;
}

export function getImportSession(importId: string) {
  pruneExpiredSessions();
  return sessions.get(importId);
}

export function saveImportResult(importId: string, result: ImportResult) {
  const session = sessions.get(importId);
  if (session) {
    session.result = result;
  }
}
