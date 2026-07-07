# GrowEasy AI-Powered CSV Importer

Production-grade assignment build for GrowEasy CRM. The app uploads arbitrary lead CSVs, previews them locally, then maps messy columns into GrowEasy's fixed CRM schema using provider-backed LLM extraction with validation, batching, skips, and failed-batch retry support.

## Tech Stack

- Next.js App Router + TypeScript
- Route-handler backend with controller/service separation
- Ollama or Groq for AI extraction
- PapaParse for CSV parsing
- Zod validation
- react-window virtualized tables
- Vitest unit tests

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Run Ollama locally:

```bash
ollama pull llama3.1
ollama serve
```

Environment variables:

- `AI_PROVIDER`: selects the extraction backend. `ollama` (default) runs against a local Ollama instance for development; `groq` runs against Groq's hosted OpenAI-compatible API for production/public deployment where a local model isn't reachable. The same prompt, batching, and validation logic runs unchanged against either provider.
- `OLLAMA_BASE_URL`: defaults to `http://localhost:11434`
- `OLLAMA_MODEL`: defaults to `llama3.1`
- `OLLAMA_ALLOW_HEURISTIC_FALLBACK`: defaults to `true`; set `false` if failed Ollama batches should fail instead of using the deterministic fallback mapper
- `GROQ_API_KEY`: required when `AI_PROVIDER=groq`
- `GROQ_MODEL`: defaults to `llama-3.3-70b-versatile`

## API Contract

- `POST /api/import/upload`: accepts multipart CSV file or JSON `{ rows }`, validates/parses, returns `{ importId, rawRecordCount, previewRows }`
- `POST /api/import/:importId/process`: processes rows in batches and returns imported/skipped records plus per-batch status
- `GET /api/import/:importId/status`: returns the latest in-memory import session/result

The in-memory store is intentionally short-lived and stateless-friendly. The client sends rows again during processing so serverless deployments can recover if memory is cold.

## Prompt Engineering Approach

The extraction prompt lives in `src/server/services/prompt-service.ts`. It explicitly defines the exact target schema, enum constraints, JavaScript-parseable date normalization, overflow-note behavior, multiple email/phone handling, CSV-safety, and the skip rule. It includes few-shot examples for ambiguous CRM exports and gives synonym hints without relying only on brittle header lookups.

After every batch, the backend parses strict JSON, retries malformed LLM output once, sanitizes records with Zod, clears invalid enums, escapes newlines, applies the skip rule, and returns per-batch success/failure. Raw prompt text is not exposed to the frontend; only server-side sample input/output logs are emitted for debugging.

## Testing

```bash
npm test
```

Tests cover CSV edge cases, enum validation, skip-rule logic, batch splitting, and fallback mapping.

## Deployment

Single-repo deployment works on Vercel. Set the Ollama environment variables to point at an accessible Ollama host, or deploy a backend/runtime where Ollama is reachable. For the publicly deployed instance, set `AI_PROVIDER=groq` and `GROQ_API_KEY` in the hosting platform's environment variables so extraction does not depend on a locally-running Ollama instance. Docker is included for self-hosted deployment:

```bash
docker build -t groweasy-importer .
docker run -p 3000:3000 --env-file .env.local groweasy-importer
```

