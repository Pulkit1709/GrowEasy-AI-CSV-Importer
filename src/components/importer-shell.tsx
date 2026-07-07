"use client";

import { CheckCircle2, Download, FileText, Moon, RefreshCcw, Upload, XCircle } from "lucide-react";
import Papa from "papaparse";
import { useMemo, useRef, useState } from "react";
import { FixedSizeList as List } from "react-window";
import clsx from "clsx";
import type { BatchResult, CrmRecord, ImportResult, RawRecord, SkippedRecord } from "@/types/import";
import { crmFieldNames } from "@/types/import";

const maxSize = 5 * 1024 * 1024;

type UploadResponse = {
  importId: string;
  rawRecordCount: number;
  previewRows: RawRecord[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseFile(file: File) {
  return new Promise<RawRecord[]>((resolve, reject) => {
    Papa.parse<RawRecord>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
      complete: (result) => {
        if (result.errors.length) {
          reject(new Error(result.errors[0].message));
          return;
        }
        const rows = result.data.filter((row) => Object.values(row).some((value) => String(value ?? "").trim()));
        resolve(rows);
      },
      error: (error) => reject(error)
    });
  });
}

function DataTable({ rows, fields }: { rows: RawRecord[]; fields?: string[] }) {
  const columns = useMemo(() => fields ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))), [fields, rows]);
  const columnWidth = fields ? 220 : 190;
  const tableWidth = Math.max(columns.length * columnWidth, 760);
  const gridTemplateColumns = `repeat(${columns.length}, ${columnWidth}px)`;

  if (rows.length === 0) {
    return <div className="empty-state">No rows to display.</div>;
  }

  return (
    <div className="table-shell">
      <div className="table-grid table-header" style={{ width: tableWidth, gridTemplateColumns }}>
        {columns.map((column) => <div key={column}>{column}</div>)}
      </div>
      <List height={360} itemCount={rows.length} itemSize={52} width="100%">
        {({ index, style }) => (
          <div className="table-grid table-row" style={{ ...style, width: tableWidth, gridTemplateColumns }}>
            {columns.map((column) => <div key={column} title={String(rows[index][column] ?? "")}>{String(rows[index][column] ?? "")}</div>)}
          </div>
        )}
      </List>
    </div>
  );
}

function SummaryStrip({ result }: { result: ImportResult }) {
  const failed = result.batchResults.filter((batch) => batch.status === "failed").length;
  return (
    <div className="summary-strip">
      <div><strong>{result.totalImported}</strong><span>Total imported</span></div>
      <div><strong>{result.totalSkipped}</strong><span>Total skipped</span></div>
      <div><strong>{failed}</strong><span>Failed batches</span></div>
    </div>
  );
}

function SkippedRows({ rows }: { rows: SkippedRecord[] }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <div className="skipped-panel">
      <button type="button" className="text-button" onClick={() => setOpen((value) => !value)}>
        {open ? "Hide" : "Show"} skipped rows ({rows.length})
      </button>
      {open && (
        <div className="skipped-list">
          {rows.map((row, index) => (
            <div key={`${row.reason}-${index}`} className="skipped-item">
              <XCircle size={16} />
              <span>{row.reason}</span>
              <code>{JSON.stringify(row.originalRow)}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ImporterShell() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dark, setDark] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<RawRecord[]>([]);
  const [importId, setImportId] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState("");

  async function handleFile(selected: File | undefined) {
    setError("");
    setResult(null);
    setImportId("");
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a .csv file.");
      return;
    }
    if (selected.size === 0) {
      setError("This CSV is empty. Choose a file with headers and at least one row.");
      return;
    }
    if (selected.size > maxSize) {
      setError("CSV file is too large. Maximum size is 5MB.");
      return;
    }

    try {
      const parsedRows = await parseFile(selected);
      if (!parsedRows.length) {
        setError("The CSV only contains headers or blank rows.");
        return;
      }
      setFile(selected);
      setRows(parsedRows);
    } catch (parseError) {
      setError(parseError instanceof Error ? `Malformed CSV: ${parseError.message}` : "Malformed CSV.");
    }
  }

  async function uploadRows() {
    const response = await fetch("/api/import/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Upload failed.");
    }
    return payload as UploadResponse;
  }

  async function processRows(retryBatchIndexes?: number[]) {
    setProcessing(true);
    setError("");
    setProgress(retryBatchIndexes?.length ? `Retrying ${retryBatchIndexes.length} failed batch…` : "Uploading parsed rows…");
    try {
      const upload = importId ? { importId } : await uploadRows();
      setImportId(upload.importId);
      const batchCount = Math.ceil(rows.length / 25);
      setProgress(retryBatchIndexes?.length ? "Retrying failed batches…" : `Processing batch 1 of ${batchCount}…`);
      const response = await fetch(`/api/import/${upload.importId}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, retryBatchIndexes })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "AI processing failed.");
      }

      const nextResult = payload as ImportResult;
      if (retryBatchIndexes?.length && result) {
        const retrySet = new Set(retryBatchIndexes);
        setResult({
          importedRecords: [...result.importedRecords, ...nextResult.importedRecords],
          skippedRecords: [...result.skippedRecords, ...nextResult.skippedRecords],
          totalImported: result.totalImported + nextResult.totalImported,
          totalSkipped: result.totalSkipped + nextResult.totalSkipped,
          batchResults: [
            ...result.batchResults.filter((batch) => !retrySet.has(batch.batchIndex)),
            ...nextResult.batchResults
          ].sort((a, b) => a.batchIndex - b.batchIndex)
        });
      } else {
        setResult(nextResult);
      }
      setProgress("Import processing complete.");
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Network/API failure while processing import.");
    } finally {
      setProcessing(false);
    }
  }

  const failedBatches: BatchResult[] = result?.batchResults.filter((batch) => batch.status === "failed") ?? [];

  return (
    <main className={clsx("app-shell", dark && "dark")}>
      <aside className="sidebar">
        <div className="brand-mark">GE</div>
        <nav>
          <span className="active">Imports</span>
          <span>Leads</span>
          <span>Reports</span>
          <span>Settings</span>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">GrowEasy CRM</p>
            <h1>Import Leads via CSV</h1>
            <p>Upload a CSV file to bulk import leads into your system.</p>
          </div>
          <button className="icon-button" type="button" onClick={() => setDark((value) => !value)} aria-label="Toggle dark mode">
            <Moon size={18} />
          </button>
        </header>

        <section className="panel">
          <div
            className={clsx("dropzone", dragging && "dragging")}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFile(event.dataTransfer.files[0]);
            }}
          >
            <Upload size={28} />
            <h2>Drop your CRM leads CSV here</h2>
            <p>Supported file: .csv (max 5MB)</p>
            <button type="button" className="primary-button" onClick={() => inputRef.current?.click()}>
              <FileText size={18} />
              Choose CSV
            </button>
            <a className="sample-link" href="/sample-groweasy-leads.csv" download>
              <Download size={16} />
              Download Sample CSV Template
            </a>
            <input ref={inputRef} hidden type="file" accept=".csv,text/csv" onChange={(event) => void handleFile(event.target.files?.[0])} />
          </div>

          {error && <div className="error-box">{error}</div>}

          {file && (
            <div className="file-summary">
              <FileText size={18} />
              <span>{file.name}</span>
              <strong>{formatBytes(file.size)}</strong>
              <em>{rows.length} rows parsed locally</em>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Preview</h2>
              <p>No backend or AI call happens until you confirm import.</p>
            </div>
            <button className="primary-button" type="button" disabled={!rows.length || processing} onClick={() => void processRows()}>
              {processing ? "Processing…" : "Confirm Import"}
            </button>
          </div>
          {!rows.length ? <div className="empty-state">No file loaded yet.</div> : <DataTable rows={rows} />}
          {progress && <div className="progress-line">{progress}</div>}
        </section>

        {result && (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>AI Results</h2>
                <p>Mapped into the fixed GrowEasy CRM schema.</p>
              </div>
              {failedBatches.length > 0 && (
                <button className="secondary-button" type="button" disabled={processing} onClick={() => void processRows(failedBatches.map((batch) => batch.batchIndex))}>
                  <RefreshCcw size={16} />
                  Retry failed batches
                </button>
              )}
            </div>
            <SummaryStrip result={result} />
            {result.totalImported === 0 && failedBatches.length === 0 && (
              <div className="empty-state">All rows were skipped because no email or mobile number could be found.</div>
            )}
            {result.importedRecords.length > 0 && (
              <div className="success-frame">
                <CheckCircle2 size={18} />
                <span>{result.importedRecords.length} records are ready for CRM import.</span>
              </div>
            )}
            <DataTable rows={result.importedRecords as unknown as RawRecord[]} fields={[...crmFieldNames]} />
            <SkippedRows rows={result.skippedRecords} />
          </section>
        )}
      </section>
    </main>
  );
}
