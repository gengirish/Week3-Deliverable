# RAG Chunking Lab

A full-stack demo that indexes one PDF three different ways and shows what the
chunking choice actually changes — side-by-side retrieval, a chunk explorer, and
a labelled retrieval benchmark.

```
Week3-Deliverable/
├── rag_pipeline/     the pipeline: extraction, chunking, embeddings, retrieval, eval
├── api/              FastAPI wrapper over those modules
├── web/              Next.js UI
└── dev.sh            starts both
```

The API holds no retrieval logic of its own. It calls the same `rag_pipeline`
functions the CLI does, so the browser and `python main.py` can never disagree
about what the pipeline returns.

---

## Run it

```bash
./dev.sh
```

Then open the web URL it prints (http://localhost:3001 by default) and click
**Load reference document** on the Index tab.

Both default ports are commonly occupied, so they are overridable:

```bash
API_PORT=8020 WEB_PORT=3005 ./dev.sh
```

### First-time setup

```bash
# Python 3.11 — psycopg2-binary and numpy have no wheels for 3.13
python3.11 -m venv rag_pipeline/.venv
rag_pipeline/.venv/bin/pip install -r rag_pipeline/requirements.txt -r api/requirements.txt

cp rag_pipeline/.env.template rag_pipeline/.env   # then fill it in
cd web && npm install
```

`rag_pipeline/.env` needs Supabase credentials. Note that `SUPABASE_DB_PASSWORD`
is the **Postgres password** from Settings > Database, not the service-role API
key — the service key authenticates against the REST API and will fail here.

---

## The four tabs

**Compare search** — the core demo. One question is embedded once and sent to all
three indexes. The columns show what each strategy retrieved, with scores and
character offsets. Overlapping offsets mean the strategies agree on where the
answer lives; distant offsets mean the boundary choice changed what the retriever
could see at all.

**Chunk explorer** — per-strategy counts and token statistics, plus a size profile
drawn in document order. Fixed is a flat line by construction; semantic is jagged
wherever the topic turns. Browse the actual chunk text underneath.

**Benchmark** — runs 10 labelled queries and reports Hit-Rate@3 per strategy.
Expand any row to see all three strategies' top-3 with the gold-matching chunk
highlighted, which shows *why* a strategy missed rather than only that it did.

**Index** — drop in any text-based PDF and watch extraction, chunking and
embedding run with live progress. Indexing replaces the corpus, so the app always
describes one document.

---

## Two things worth knowing before you demo

**The benchmark only runs on the reference document.** Its gold answers are
verbatim phrases from `IF-RES-2026-122`, resolved to character offsets at run
time. Against any other PDF the anchors do not resolve, so the benchmark refuses
to score rather than reporting meaningless numbers. The UI disables the button
and says so. Upload freely to demo indexing and search — click **Load reference
document** before demoing the benchmark.

**Switching embedding provider invalidates the index.** The local model is 384
dims and OpenAI's is 1536; a Postgres `VECTOR(n)` column is fixed at creation.
Switching marks the index stale and sends you to the Index tab to rebuild. This
is surfaced rather than hidden because the alternative is a table that silently
cannot be queried.

---

## Evaluation method

Hit-Rate@3, scored against **answer spans** rather than chunk ids.

A single gold `chunk_id` cannot compare three strategies fairly — it belongs to
exactly one of them, and the other two can only ever match approximately. So each
query is labelled with a verbatim answer phrase, located in the cleaned text at
run time, and a strategy scores a hit when one of its top-3 chunks covers ≥80% of
that span. Every strategy is asked the identical question.

Current results on the reference document with `all-MiniLM-L6-v2`:

| Strategy | Hit@3 |
|---|---|
| Semantic | 5/10 |
| Fixed | 4/10 |
| Structural | 3/10 |

These numbers are weak, and the app says so on the results page. Ten queries over
one 16-page document cannot separate three strategies with confidence — a
one-query swing is 10 points. There is also no hybrid BM25 stage and no reranker,
which the source document argues matter more than the boundary choice. The
benchmark measures boundaries in isolation, which is deliberately the narrow
question.

---

## API

Interactive docs at `http://localhost:8010/docs`.

| Endpoint | Purpose |
|---|---|
| `GET /api/status` | Provider, indexed document, row counts |
| `POST /api/provider` | Switch embedding provider |
| `POST /api/index/upload` | Upload a PDF and start indexing |
| `POST /api/index/reference` | Re-index the bundled reference document |
| `GET /api/jobs/{id}` | Progress for an indexing or eval job |
| `POST /api/search` | One query against all three strategies |
| `GET /api/chunks/stats` | Size distributions |
| `GET /api/chunks/{strategy}` | Paginated chunk listing |
| `POST /api/eval/run` | Start the benchmark |
| `GET /api/eval/last` | Most recent benchmark result |

---

## CLI

The pipeline still runs standalone, and produces the same numbers:

```bash
cd rag_pipeline
.venv/bin/python main.py                  # full pipeline
.venv/bin/python main.py --phase query    # just the benchmark
```

See [rag_pipeline/README.md](rag_pipeline/README.md) for the pipeline internals —
chunking parameters, the adaptive semantic threshold, and the database schema.
