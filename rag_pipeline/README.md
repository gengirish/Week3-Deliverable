# W03 RAG Pipeline — Supabase + pgvector Chunking Comparison

A fully runnable Python pipeline that ingests a PDF, applies **3 chunking strategies**, generates embeddings, and produces a **retrieval quality comparison table** using Supabase with pgvector.

Built from the [W03 Meta-Prompting Playbook](../w03-meta-prompting-playbook.md) — this is the Stage 2 implementation of the [technical plan](../w03-rag-implementation-plan.md).

---

## Project Structure

```
rag_pipeline/
├── main.py           # Orchestrator — run this
├── db_setup.py       # Phase 1: Supabase schema + HNSW index
├── ingest.py         # Phase 2: PDF extraction + cleaning (pdfplumber)
├── chunkers.py       # Phase 3: chunk_fixed / chunk_structural / chunk_semantic
├── db.py             # Shared Supabase Postgres connection (direct, pooler fallback)
├── embeddings.py     # Phase 4: local or OpenAI embeddings, batch insert
├── query.py          # Phase 5+6: semantic search, hit@3 scoring, comparison table
├── requirements.txt  # Pinned dependencies
├── .env.template     # Credentials template — copy to .env and fill in
├── data/             # Place your PDF here
└── results/          # Output: raw_results.json + comparison_table.md
```

---

## Quickstart

> **Python 3.11 is required.** The pinned `psycopg2-binary` and `numpy` versions
> have no wheels for 3.13 and fail to build from source.

### 1. Install dependencies

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Only needed for the default local embedding provider:
.venv/bin/pip install sentence-transformers
```

### 2. Set up credentials

```bash
cp .env.template .env
# Edit .env and fill in the values described in .env.template
```

`SUPABASE_DB_PASSWORD` is the **Postgres password** from Supabase >
Project Settings > Database. It is *not* the service-role API key — the service
key authenticates against the REST API, not Postgres, and using it here fails
with a password authentication error.

### 3. Place your PDF

```
rag_pipeline/data/document.pdf
```
Or set `PDF_PATH` in `.env` to any path.

### 4. Run the full pipeline

```bash
python main.py
```

Or run phases individually:

```bash
python main.py --phase setup    # Create DB table + HNSW index
python main.py --phase embed    # Ingest PDF → chunk → embed → insert to Supabase
python main.py --phase query    # Run 10 queries × 3 strategies → comparison table
```

---

## Embedding provider

Set `EMBEDDING_PROVIDER` in `.env`:

| Value | Model | Dims | Cost |
|---|---|---|---|
| `local` (default) | `all-MiniLM-L6-v2` via sentence-transformers | 384 | free, offline |
| `openai` | `text-embedding-3-small` | 1536 | ~$0.01 per run |

The vector column width follows the active model. `db_setup.py` detects a width
mismatch against an existing table and rebuilds it, so switching providers is
just an env change plus `--phase setup`.

---

## Swapping in a different PDF

`QUERIES` and `GOLD_ANCHORS` in `query.py` are written against the document in
`data/`. If you ingest a different PDF, rewrite both — the anchors are verbatim
phrases from the cleaned text, and `resolve_gold_spans()` raises on any anchor
it cannot find rather than scoring against a wrong span.

---

## Chunking Strategies

| Strategy | Function | Parameters |
|---|---|---|
| Fixed-size with overlap | `chunk_fixed()` | 500 tokens, 50 overlap |
| Structural / recursive | `chunk_structural()` | 400 token target, 100 min |
| Semantic / sentence-window | `chunk_semantic()` | window=3, adaptive threshold (p25) |

The semantic threshold is derived from the corpus rather than fixed. An absolute
cut is model-specific: measured on this document, `all-MiniLM-L6-v2` places 82%
of adjacent sentence windows below the original 0.85 constant, which collapses
the strategy into one-sentence chunks. Cutting at the 25th percentile of the
observed similarity distribution adapts to whichever embedding model is active.

## Evaluation

- **Metric:** Hit-Rate@3 — did a top-3 retrieved chunk contain the gold answer span?
- **Gold labels:** each query is labelled with a verbatim answer phrase from the
  document, resolved to character offsets at run time. A hit requires a retrieved
  chunk to cover ≥80% of that span. Labelling by span rather than by `chunk_id`
  keeps the comparison fair: the three strategies cut at different offsets, so any
  single gold `chunk_id` would belong to one strategy and disadvantage the others.
- **Output:** `results/comparison_table.md` — 10-row × 3-column markdown table + summary
- **Raw data:** `results/raw_results.json` — full result dicts for Stage 3 analysis

## Database

- **Table:** `document_chunks`, embedding column width set by the active model
- **Index:** HNSW (`m=16`, `ef_construction=64`) via pgvector
- **Why HNSW over IVFFlat:** a 50-page PDF produces ~150–600 chunks, well below IVFFlat's minimum row threshold for reliable recall

## Dependencies

| Package | Purpose |
|---|---|
| `pdfplumber` | Layout-aware PDF text extraction |
| `tiktoken` | Token counting (cl100k_base, matches OpenAI models) |
| `nltk` | Sentence tokenization for semantic chunking |
| `openai` | Embedding generation when `EMBEDDING_PROVIDER=openai` |
| `sentence-transformers` | Local embedding generation (default provider) |
| `psycopg2-binary` | Direct Postgres connection for pgvector queries |
| `supabase-py` | Supabase client (auth / REST) |
| `numpy` | Cosine similarity computation in semantic chunker |
| `python-dotenv` | `.env` credential loading |
