# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

RAG Chunking Lab: one PDF indexed three ways (fixed / structural / semantic chunking) into Supabase pgvector, with a Next.js UI for side-by-side retrieval, a chunk explorer, and a Hit-Rate@3 benchmark.

- `rag_pipeline/` — the actual pipeline (Python 3.11): `ingest.py` → `chunkers.py` → `embeddings.py` → `db_setup.py`/`db.py` → `query.py` (search + eval). `main.py` is the CLI orchestrator.
- `api/` — FastAPI wrapper. **Holds no retrieval logic**; `service.py` calls the same `rag_pipeline` functions the CLI uses, adding only progress reporting, the "active document" record, and JSON shapes. Keep new pipeline logic in `rag_pipeline/`, not `api/`.
- `web/` — Next.js 16 / React 19 / Tailwind 4 UI. Typed API client in `web/lib/api.ts`; one component per tab in `web/components/`. See `web/AGENTS.md`: this Next.js version has breaking changes — read `web/node_modules/next/dist/docs/` before writing Next.js code.

## Commands

No test suite or linter is configured.

```bash
# First-time setup — Python 3.11 is required (psycopg2-binary/numpy 1.26 have no 3.13 wheels)
python3.11 -m venv rag_pipeline/.venv
rag_pipeline/.venv/bin/pip install -r rag_pipeline/requirements.txt -r api/requirements.txt
cp rag_pipeline/.env.template rag_pipeline/.env
cd web && npm install

# Run API (default :8010) + web (default :3001) together
./dev.sh
API_PORT=8020 WEB_PORT=3005 ./dev.sh

# API alone (from api/)
../rag_pipeline/.venv/bin/uvicorn main:app --reload --port 8010

# Web alone (from web/) — NEXT_PUBLIC_API_URL is baked in at build time
NEXT_PUBLIC_API_URL=http://localhost:8010 npm run dev -- --port 3001
npm run build        # also runs the TypeScript type check

# Pipeline CLI (from rag_pipeline/)
.venv/bin/python main.py                   # full pipeline
.venv/bin/python main.py --phase setup     # table + HNSW index
.venv/bin/python main.py --phase embed     # ingest → chunk → embed → insert
.venv/bin/python main.py --phase query     # 10-query benchmark → results/
```

`dev.sh` is bash and uses `.venv/bin/` paths and `lsof`; on Windows the venv uses `Scripts/` instead.

CI (`.github/workflows/ci.yml`) runs `npm run build` for web, and for Python: `python -m compileall -q api rag_pipeline -x '\.venv'` plus an import smoke test (`cd api && python -c "import main"`) that asserts `/api/status` is registered. It skips `sentence-transformers` (torch), which is only imported lazily — keep that import lazy so the smoke test needs no model or DB.

## Architecture notes that span files

- **`api/paths.py` must be imported first** in any API module. It puts `api/` and `rag_pipeline/` on `sys.path` and `os.chdir`s into `rag_pipeline/`, because pipeline modules import each other by top-level name (`from ingest import ...`) and resolve `./data` and `./results` relative to cwd.
- **Embedding provider is switchable at runtime.** `embeddings.PROVIDER`, `EMBEDDING_DIM`, etc. are mutable module globals (`local` = all-MiniLM-L6-v2, 384 dims; `openai` = text-embedding-3-small, 1536 dims). Always `import embeddings` and read `embeddings.EMBEDDING_DIM`; never `from embeddings import EMBEDDING_DIM` (it goes stale). Because `VECTOR(n)` is fixed at table creation, a dim change marks the active document `stale` and the UI forces a re-index; `db_setup.py` drops and rebuilds the table on dim mismatch.
- **Single corpus.** Indexing replaces all rows; the indexed document is recorded in `rag_pipeline/results/active_document.json` (`service.read_state()/write_state()`), which drives `/api/status` and the UI.
- **Jobs are in-memory** (`api/jobs.py`): indexing/eval run on daemon threads with `(stage, message, pct)` progress, polled via `GET /api/jobs/{id}`. Lost on restart — which is why `fly.toml` keeps exactly one machine always running.
- **Benchmark is tied to the reference document** (`data/document.pdf`, IF-RES-2026-122). `QUERIES` and `GOLD_ANCHORS` in `query.py` are verbatim phrases resolved to character offsets at run time; a hit = a top-3 chunk covering ≥80% of the gold span (spans, not chunk ids, so the three strategies are compared fairly). `resolve_gold_spans()` raises on unresolved anchors, and `service._is_reference_document()` gates the eval in the UI. Changing the PDF means rewriting both lists.
- **Semantic chunker threshold is adaptive** (25th percentile of adjacent-window similarity), not a fixed constant — a fixed cut is model-specific.
- The API warms the embedding model on a background thread at startup (and after a provider switch) so the first search isn't slow.
- Strategy names `fixed | structural | semantic` are duplicated in the DB `CHECK` constraint (`db_setup.py`), `service.STRATEGIES`, and `web/lib/api.ts` (`STRATEGIES`, `STRATEGY_META` with chunking-parameter labels) — update all together.

## Config & deployment

- `rag_pipeline/.env` (from `.env.template`): Supabase URL/keys, `EMBEDDING_PROVIDER`, `OPENAI_API_KEY`, `PDF_PATH`. `SUPABASE_DB_PASSWORD` is the **Postgres password**, not the service-role key (using the key fails with password auth errors). `db.py` connects directly and falls back to the Supavisor pooler (`SUPABASE_REGION` / `SUPABASE_POOLER_HOST`, or `SUPABASE_DB_URL` to override).
- API deploys to Fly.io (`fly.toml`, root `Dockerfile` — built from repo root since the API imports `rag_pipeline` by path; bakes CPU torch, the MiniLM model and NLTK punkt into the image). CORS is set via `CORS_ORIGIN_REGEX` (defaults to any localhost port).
- Web deploys to Vercel; `NEXT_PUBLIC_API_URL` must point at the API at build time.
