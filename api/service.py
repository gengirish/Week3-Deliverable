"""
Service layer — wraps the rag_pipeline modules in operations the API can call.

Everything here is deliberately thin: the pipeline logic stays in rag_pipeline/
so the CLI and the web app cannot drift apart. This module adds only what a web
front-end needs on top — progress reporting, an "active document" record, and
result shapes that serialise cleanly to JSON.
"""

import json
import time
from datetime import datetime, timezone
from typing import Callable, Iterable

import paths  # noqa: F401  — sets sys.path and cwd, must come first

import embeddings
import psycopg2.extras
from db import get_connection
from db_setup import setup_database
from ingest import extract_full_text
from chunkers import chunk_fixed, chunk_structural, chunk_semantic, split_into_sentences

STRATEGIES = ["fixed", "structural", "semantic"]

# A progress reporter: (stage, message, pct 0-100) -> None
Progress = Callable[[str, str, float], None]


def _noop(stage: str, message: str, pct: float) -> None:
    pass


# ---------------------------------------------------------------------------
# Active document state
# ---------------------------------------------------------------------------

def read_state() -> dict:
    """The document currently indexed, or an empty record if none."""
    if not paths.STATE_FILE.exists():
        return {"indexed": False}
    try:
        return json.loads(paths.STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {"indexed": False}


def write_state(state: dict) -> dict:
    paths.STATE_FILE.write_text(json.dumps(state, indent=2))
    return state


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

def row_counts() -> dict[str, int]:
    """Chunks per strategy currently in Postgres."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT strategy, COUNT(*) FROM document_chunks GROUP BY strategy;"
        )
        counts = {s: 0 for s in STRATEGIES}
        for strategy, count in cur.fetchall():
            counts[strategy] = count
        cur.close()
        return counts
    finally:
        conn.close()


def status() -> dict:
    """Everything the UI needs to render its header and gate its actions."""
    state = read_state()
    result = {
        "provider": embeddings.current_provider(),
        "providers": [
            {
                "id": key,
                "label": spec["label"],
                "dim": spec["dim"],
                "available": embeddings.provider_available(key)[0],
                "reason": embeddings.provider_available(key)[1],
            }
            for key, spec in embeddings.PROVIDER_SPECS.items()
        ],
        "document": state,
        "database": {"connected": False, "counts": {}, "total": 0, "error": None},
    }
    try:
        counts = row_counts()
        result["database"] = {
            "connected": True,
            "counts": counts,
            "total": sum(counts.values()),
            "error": None,
        }
    except Exception as exc:  # surfaced in the UI rather than crashing the page
        result["database"]["error"] = str(exc)[:200]
    return result


# ---------------------------------------------------------------------------
# Indexing
# ---------------------------------------------------------------------------

def build_chunks(full_text: str, page_index: list[dict], progress: Progress = _noop) -> dict:
    """Run all three chunking strategies over one extracted document."""
    progress("chunk", "Fixed-size windows...", 30)
    fixed = chunk_fixed(full_text, page_index)

    progress("chunk", "Structural split...", 38)
    structural = chunk_structural(full_text, page_index)

    progress("chunk", "Splitting into sentences...", 44)
    sentences = split_into_sentences(full_text)

    progress("chunk", f"Embedding {len(sentences)} sentences for boundary detection...", 50)
    sentence_embeddings = embeddings.embed_sentences(sentences)

    progress("chunk", "Detecting semantic boundaries...", 62)
    semantic = chunk_semantic(full_text, page_index, sentence_embeddings, sentences)

    return {"fixed": fixed, "structural": structural, "semantic": semantic}


def index_document(pdf_path: str, display_name: str, progress: Progress = _noop) -> dict:
    """
    Full re-index: extract, chunk three ways, embed, replace the table contents.

    Replaces rather than appends. The demo holds one active document at a time,
    so search results and chunk counts always describe the document named in the
    UI rather than an accumulated mix.
    """
    started = time.time()

    progress("setup", "Preparing database schema...", 5)
    setup_database()

    progress("ingest", "Extracting text from PDF...", 12)
    full_text, page_index = extract_full_text(pdf_path)
    if not full_text.strip():
        raise ValueError(
            "No text could be extracted from this PDF. Scanned or image-only "
            "documents need OCR, which this pipeline does not perform."
        )

    all_chunks = build_chunks(full_text, page_index, progress)

    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute("TRUNCATE document_chunks;")
        conn.commit()
        cur.close()

        pct = 68
        for strategy in STRATEGIES:
            chunks = all_chunks[strategy]
            progress("embed", f"Embedding {len(chunks)} {strategy} chunks...", pct)
            embedded = embeddings.embed_chunks(chunks)
            embeddings.insert_chunks_to_db(embedded, conn)
            pct += 10
    finally:
        conn.close()

    counts = {s: len(all_chunks[s]) for s in STRATEGIES}
    stats = {
        s: _token_stats([c["token_count"] for c in all_chunks[s]])
        for s in STRATEGIES
    }

    state = write_state({
        "indexed": True,
        "name": display_name,
        "path": str(pdf_path),
        "pages": len(page_index),
        "characters": len(full_text),
        "counts": counts,
        "token_stats": stats,
        "provider": embeddings.current_provider(),
        "indexed_at": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(time.time() - started, 1),
        "is_reference_document": _is_reference_document(display_name),
    })

    progress("done", "Index complete", 100)
    return state


def _token_stats(counts: list[int]) -> dict:
    if not counts:
        return {"count": 0, "avg": 0, "min": 0, "max": 0}
    return {
        "count": len(counts),
        "avg": round(sum(counts) / len(counts)),
        "min": min(counts),
        "max": max(counts),
    }


def _is_reference_document(name: str) -> bool:
    """
    The 10 evaluation queries and their gold answer spans were written against
    one specific document. Against any other PDF the anchors will not resolve,
    so the UI needs to know whether the eval is meaningful.
    """
    return "chunking" in name.lower() and "if-res-2026-122" in name.lower()


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def search_all_strategies(query: str, top_k: int = 3) -> dict:
    """Run one query against all three strategies and return them side by side."""
    from query import search

    t0 = time.time()
    vector = embeddings.embed_query(query)
    embed_ms = round((time.time() - t0) * 1000, 1)

    conn = get_connection()
    try:
        out = {}
        for strategy in STRATEGIES:
            t1 = time.time()
            hits = search(conn, vector, strategy, top_k=top_k)
            out[strategy] = {
                "took_ms": round((time.time() - t1) * 1000, 1),
                "results": [
                    {
                        "chunk_id": h["chunk_id"],
                        "content": h["content"],
                        "score": round(float(h["score"]), 4),
                        "source_page": h["source_page"],
                        "char_start": h["char_start"],
                        "char_end": h["char_end"],
                    }
                    for h in hits
                ],
            }
    finally:
        conn.close()

    return {"query": query, "top_k": top_k, "embed_ms": embed_ms, "strategies": out}


# ---------------------------------------------------------------------------
# Chunk explorer
# ---------------------------------------------------------------------------

def list_chunks(strategy: str, limit: int = 50, offset: int = 0) -> dict:
    if strategy not in STRATEGIES:
        raise ValueError(f"Unknown strategy {strategy!r}")

    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT chunk_id, content, source_page, char_start, char_end, token_count
            FROM document_chunks
            WHERE strategy = %s
            ORDER BY char_start
            LIMIT %s OFFSET %s;
            """,
            (strategy, limit, offset),
        )
        rows = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT COUNT(*) FROM document_chunks WHERE strategy = %s;", (strategy,)
        )
        total = cur.fetchone()["count"]
        cur.close()
        return {"strategy": strategy, "total": total, "limit": limit,
                "offset": offset, "chunks": rows}
    finally:
        conn.close()


def chunk_stats() -> dict:
    """Per-strategy size distribution, for the explorer charts."""
    conn = get_connection()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            SELECT strategy,
                   COUNT(*)                AS chunks,
                   AVG(token_count)        AS avg_tokens,
                   MIN(token_count)        AS min_tokens,
                   MAX(token_count)        AS max_tokens,
                   SUM(token_count)        AS total_tokens
            FROM document_chunks
            GROUP BY strategy
            ORDER BY strategy;
            """
        )
        summary = {
            r["strategy"]: {
                "chunks": r["chunks"],
                "avg_tokens": round(float(r["avg_tokens"] or 0)),
                "min_tokens": r["min_tokens"],
                "max_tokens": r["max_tokens"],
                "total_tokens": r["total_tokens"],
            }
            for r in cur.fetchall()
        }

        # Raw token counts per strategy, so the UI can draw a real histogram
        cur.execute("SELECT strategy, token_count FROM document_chunks ORDER BY char_start;")
        series: dict[str, list[int]] = {s: [] for s in STRATEGIES}
        for row in cur.fetchall():
            series.setdefault(row["strategy"], []).append(row["token_count"])
        cur.close()

        return {"summary": summary, "token_counts": series}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def run_evaluation(progress: Progress = _noop) -> dict:
    """
    Run the 10-query benchmark and return per-query detail plus totals.

    Mirrors query.run_queries, but reports progress and keeps the retrieved text
    so the UI can show *why* a strategy missed rather than only that it did.
    """
    import query as q

    state = read_state()
    if not state.get("indexed"):
        raise ValueError("No document is indexed. Upload and index a PDF first.")
    if not state.get("is_reference_document"):
        raise ValueError(
            "The evaluation's gold answer spans were written for the reference "
            "document (IF-RES-2026-122). They cannot be scored against "
            f"'{state.get('name')}'. Re-index the reference document to run the benchmark."
        )

    progress("eval", "Resolving gold answer spans...", 5)
    gold_spans = q.resolve_gold_spans()

    conn = get_connection()
    results = []
    try:
        total_steps = len(q.QUERIES)
        for i, (q_id, q_data) in enumerate(q.QUERIES.items()):
            progress("eval", f"{q_id}: {q_data['text'][:50]}...",
                     5 + (i / total_steps) * 90)

            vector = embeddings.embed_query(q_data["text"])
            gold_span = gold_spans[q_id]

            per_strategy = {}
            for strategy in STRATEGIES:
                hits = q.search(conn, vector, strategy, top_k=q.TOP_K)
                hit_rank = next(
                    (j + 1 for j, h in enumerate(hits) if q._contains_gold(h, gold_span)),
                    None,
                )
                per_strategy[strategy] = {
                    "hit": hit_rank is not None,
                    "hit_rank": hit_rank,
                    "top_score": round(float(hits[0]["score"]), 4) if hits else 0.0,
                    "results": [
                        {
                            "chunk_id": h["chunk_id"],
                            "score": round(float(h["score"]), 4),
                            "content": h["content"],
                            "char_start": h["char_start"],
                            "char_end": h["char_end"],
                            "is_gold": q._contains_gold(h, gold_span),
                        }
                        for h in hits
                    ],
                }

            results.append({
                "query_id": q_id,
                "query_type": q_data["type"],
                "query_text": q_data["text"],
                "gold_anchor": q.GOLD_ANCHORS[q_id][0],
                "gold_span": list(gold_span),
                "strategies": per_strategy,
            })
    finally:
        conn.close()

    summary = {
        s: {
            "hit": sum(1 for r in results if r["strategies"][s]["hit"]),
            "total": len(results),
        }
        for s in STRATEGIES
    }
    for s in summary:
        summary[s]["pct"] = round(summary[s]["hit"] / summary[s]["total"] * 100, 1)

    payload = {
        "summary": summary,
        "results": results,
        "provider": embeddings.current_provider(),
        "document": state.get("name"),
        "span_coverage": q.SPAN_COVERAGE,
        "top_k": q.TOP_K,
        "ran_at": datetime.now(timezone.utc).isoformat(),
    }

    (paths.RESULTS_DIR / "eval_run.json").write_text(json.dumps(payload, indent=2))
    progress("done", "Evaluation complete", 100)
    return payload


def last_evaluation() -> dict | None:
    path = paths.RESULTS_DIR / "eval_run.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return None
