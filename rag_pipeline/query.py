"""
Phase 5 & 6: Semantic search and hit-rate@3 evaluation.

Provides:
    run_queries()        — execute 10 queries × 3 strategies (30 searches total)
    score_results()      — compute hit@3 against pre-labeled gold chunks
    build_comparison_table() — produce the markdown comparison table
    save_results()       — persist raw results to results/raw_results.json

Query types (per the plan):
    Q1-Q3  : Single-fact lookup
    Q4-Q6  : Multi-sentence / context-dependent
    Q7-Q9  : Cross-section synthesis
    Q10    : Adversarial / boundary

QUERIES and GOLD_ANCHORS below are written against the ingested document. If you
swap in a different PDF, both must be rewritten: the anchors are verbatim phrases
from the cleaned text and resolve_gold_spans() raises if one is not found.
"""

import json
import os
import re
import psycopg2
import psycopg2.extras
from embeddings import embed_query


# ---------------------------------------------------------------------------
# Query set — drawn from the ingested document
# (IntelliForge IF-RES-2026-122, "Choosing a Chunking Strategy", 16pp)
# ---------------------------------------------------------------------------

QUERIES: dict[str, dict] = {
    "Q1":  {"type": "Fact lookup",    "text": "What percentage of overlap should I use between chunks?"},
    "Q2":  {"type": "Fact lookup",    "text": "Who wrote this document and what is their job title?"},
    "Q3":  {"type": "Fact lookup",    "text": "What does late chunking mean?"},
    "Q4":  {"type": "Multi-sentence", "text": "Why should overlap be set to zero when using structure-aware boundaries?"},
    "Q5":  {"type": "Multi-sentence", "text": "What evidence shows that adding document context reduces retrieval failures?"},
    "Q6":  {"type": "Multi-sentence", "text": "What are the five questions in the decision path, and in what order?"},
    "Q7":  {"type": "Cross-section",  "text": "What goes wrong when a chunk refers to something defined in an earlier chunk?"},
    "Q8":  {"type": "Cross-section",  "text": "What are the anti-patterns that quietly destroy retrieval recall?"},
    "Q9":  {"type": "Cross-section",  "text": "How should legal contracts be chunked compared to source code repositories?"},
    "Q10": {"type": "Boundary",       "text": "After building the golden set, what is the next step in the eval loop?"},
}

# Gold labels are answer SPANS, not chunk ids.
#
# A single gold chunk_id cannot be fair here: the three strategies cut the
# document at different offsets, so any chunk_id belongs to exactly one of them
# and the other two can only ever match by approximate overlap. Instead each
# query is labelled with a verbatim phrase from the document that answers it —
# the "label the true source span" step the document itself prescribes. A
# retrieval counts as a hit when a returned chunk actually contains that span,
# which is the same question asked identically of every strategy.
#
# Format: query_id -> (anchor phrase, which occurrence to use if repeated)
# Whitespace in the anchor is matched flexibly, since PDF extraction inserts
# line breaks mid-sentence.

GOLD_ANCHORS: dict[str, tuple[str, int]] = {
    "Q1":  ("10-15% is the working range", 0),
    "Q2":  ("Founder & Principal Engineer", 0),
    "Q3":  ("late chunking - encoding the whole document first and pooling per-chunk vectors afterwards", 0),
    "Q4":  ("If you have adopted structure-aware boundaries, set overlap to zero", 0),
    "Q5":  ("cut top-20 retrieval failures by 35% on its own, 49% with contextual BM25", 0),
    "Q6":  ("Structure \u2192 answer shape \u2192 chunk independence \u2192 budget and churn \u2192 citation and access control", 0),
    "Q7":  ("Orphan references", 1),
    "Q8":  ("Eight anti-patterns that quietly destroy recall", 1),
    "Q9":  ("Clauses are the legal unit of meaning", 0),
    "Q10": ("Measure five things", 0),
}

# Fraction of the gold span a chunk must contain to count as a hit.
SPAN_COVERAGE = 0.80


def resolve_gold_spans(pdf_path: str | None = None) -> dict[str, tuple[int, int]]:
    """
    Locate each gold anchor in the cleaned full-document text and return its
    (char_start, char_end). These offsets are in the same coordinate space the
    chunkers used, so they can be compared against chunk char ranges directly.
    """
    from ingest import extract_full_text

    pdf_path = pdf_path or os.environ.get("PDF_PATH", "./data/document.pdf")
    full_text, _ = extract_full_text(pdf_path)

    spans: dict[str, tuple[int, int]] = {}
    for q_id, (anchor, occurrence) in GOLD_ANCHORS.items():
        # Match flexibly across the line breaks PDF extraction leaves behind
        pattern = re.compile(r"\s+".join(re.escape(w) for w in anchor.split()), re.I)
        matches = list(pattern.finditer(full_text))
        if not matches:
            raise ValueError(
                f"{q_id}: gold anchor not found in document: {anchor[:60]!r}. "
                "The anchor must be a verbatim phrase from the cleaned text."
            )
        m = matches[min(occurrence, len(matches) - 1)]
        spans[q_id] = (m.start(), m.end())

    return spans


STRATEGIES = ["fixed", "structural", "semantic"]
TOP_K = 3


# ---------------------------------------------------------------------------
# Core search
# ---------------------------------------------------------------------------

def search(
    conn,
    query_vector: list[float],
    strategy: str,
    top_k: int = TOP_K,
) -> list[dict]:
    """
    Run a cosine similarity search against document_chunks for a given strategy.
    Returns top_k results as dicts: {chunk_id, content, score, char_start, char_end}.
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(
        """
        SELECT
            chunk_id,
            content,
            source_page,
            char_start,
            char_end,
            1 - (embedding <=> %s::vector) AS score
        FROM document_chunks
        WHERE strategy = %s
        ORDER BY embedding <=> %s::vector
        LIMIT %s;
        """,
        (query_vector, strategy, query_vector, top_k),
    )
    rows = cur.fetchall()
    cur.close()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Gold matching — does a retrieved chunk actually contain the answer span?
# ---------------------------------------------------------------------------

def _contains_gold(result_chunk: dict, gold_span: tuple[int, int]) -> bool:
    """
    True when the chunk covers at least SPAN_COVERAGE of the gold answer span.

    Partial credit matters: a chunk holding 90% of the answer is a useful
    retrieval, while one clipping the final three words is not meaningfully
    worse than one holding all of it. Requiring full containment would penalise
    boundary placement rather than measure retrieval.
    """
    g_start, g_end = gold_span
    gold_len = g_end - g_start
    if gold_len <= 0:
        return False

    overlap = min(result_chunk["char_end"], g_end) - max(result_chunk["char_start"], g_start)
    return overlap > 0 and (overlap / gold_len) >= SPAN_COVERAGE


# ---------------------------------------------------------------------------
# Run all queries
# ---------------------------------------------------------------------------

def run_queries(conn) -> list[dict]:
    """
    Execute all 10 queries × 3 strategies = 30 searches.
    Returns raw results list suitable for scoring and Stage 3 consumption.
    """
    gold_spans = resolve_gold_spans()
    results = []

    print(f"\n[query] Running {len(QUERIES)} queries × {len(STRATEGIES)} strategies...")

    for q_id, q_data in QUERIES.items():
        q_text = q_data["text"]
        q_type = q_data["type"]
        print(f"\n  {q_id} ({q_type}): {q_text[:80]}...")

        query_vector = embed_query(q_text)

        for strategy in STRATEGIES:
            hits = search(conn, query_vector, strategy, top_k=TOP_K)

            gold_span = gold_spans[q_id]
            hit_at_3  = int(any(_contains_gold(h, gold_span) for h in hits))
            top_score = round(hits[0]["score"], 4) if hits else 0.0

            # Which of the top-3 hit, for auditability in the raw results
            hit_rank = next(
                (i + 1 for i, h in enumerate(hits) if _contains_gold(h, gold_span)), None
            )

            result = {
                "query_id":         q_id,
                "query_type":       q_type,
                "query_text":       q_text,
                "strategy":         strategy,
                "gold_anchor":      GOLD_ANCHORS[q_id][0],
                "gold_span":        list(gold_span),
                "hit_rank":         hit_rank,
                "retrieved_chunks": [h["chunk_id"] for h in hits],
                "retrieved_spans":  [[h["char_start"], h["char_end"]] for h in hits],
                "scores":           [round(h["score"], 4) for h in hits],
                "top_score":        top_score,
                "hit_at_3":         hit_at_3,
            }
            results.append(result)
            hit_icon = "✅" if hit_at_3 else "❌"
            print(f"    [{strategy}] {hit_icon} top score={top_score:.4f} | top chunk={hits[0]['chunk_id'] if hits else 'n/a'}")

    return results


# ---------------------------------------------------------------------------
# Scoring summary
# ---------------------------------------------------------------------------

def score_results(results: list[dict]) -> dict:
    """
    Compute hit@3 totals per strategy.
    Returns a dict: {strategy: {"hit": int, "total": int, "pct": float}}
    """
    summary = {s: {"hit": 0, "total": 0} for s in STRATEGIES}
    for r in results:
        s = r["strategy"]
        summary[s]["total"] += 1
        summary[s]["hit"]   += r["hit_at_3"]

    for s, data in summary.items():
        data["pct"] = round(data["hit"] / data["total"] * 100, 1) if data["total"] > 0 else 0.0

    print("\n--- Hit-Rate@3 Summary ---")
    for s, data in summary.items():
        print(f"  {s}: {data['hit']}/{data['total']} ({data['pct']}%)")

    return summary


# ---------------------------------------------------------------------------
# Markdown comparison table
# ---------------------------------------------------------------------------

def build_comparison_table(results: list[dict]) -> str:
    """
    Build the markdown comparison table:
    rows = 10 queries, columns = 3 strategies.
    Each cell = ✅/❌ + top-1 cosine score.
    Bottom row = total hit@3 per strategy.
    """
    # Index results by (query_id, strategy)
    index: dict[tuple, dict] = {}
    for r in results:
        index[(r["query_id"], r["strategy"])] = r

    lines = [
        "| Query | Type | Fixed (hit@3 / score) | Structural (hit@3 / score) | Semantic (hit@3 / score) |",
        "|---|---|---|---|---|",
    ]

    totals = {s: 0 for s in STRATEGIES}

    for q_id, q_data in QUERIES.items():
        q_type  = q_data["type"]
        q_label = q_id  # short label; replace with a meaningful phrase after reviewing results

        cells = []
        for strategy in STRATEGIES:
            r = index.get((q_id, strategy))
            if r:
                icon  = "✅" if r["hit_at_3"] else "❌"
                score = r["top_score"]
                cells.append(f"{icon} {score:.2f}")
                totals[strategy] += r["hit_at_3"]
            else:
                cells.append("—")

        lines.append(f"| {q_label} | {q_type} | {cells[0]} | {cells[1]} | {cells[2]} |")

    # Totals row
    total_cells = [f"**{totals[s]}/10**" for s in STRATEGIES]
    lines.append(f"| **Total hit@3** | | {total_cells[0]} | {total_cells[1]} | {total_cells[2]} |")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Persist results
# ---------------------------------------------------------------------------

def save_results(results: list[dict], output_dir: str = "./results") -> str:
    """Save raw results to JSON for Stage 3 consumption."""
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "raw_results.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"\n[query] Raw results saved to '{path}'")
    return path


def save_comparison_table(table_md: str, output_dir: str = "./results") -> str:
    """Save the markdown comparison table to a file."""
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "comparison_table.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("# RAG Retrieval Quality Comparison\n\n")
        f.write(f"**Metric:** Hit-Rate@3 (did the gold chunk appear in top-3 results?)\n\n")
        import embeddings
        f.write(f"**Embedding model:** {embeddings.EMBEDDING_MODEL} ({embeddings.EMBEDDING_DIM}-dim)\n\n")
        f.write("**Gold labelling:** answer spans located by verbatim anchor phrase; "
                f"a hit requires a retrieved chunk to cover \u2265{SPAN_COVERAGE:.0%} of the span.\n\n")
        f.write(table_md)
        f.write("\n\n## Limitations\n\n")
        f.write(
            "- Single document (16 pages, ~41k characters): results may not generalise to larger corpora.\n"
            "- Single embedding model: a different model may favour different chunking strategies.\n"
            "- Gold labels were manually assigned by a single reviewer — no independently verified ground truth.\n"
            "- Sample size of 10 queries is too small for statistical significance.\n"
        )
    print(f"[query] Comparison table saved to '{path}'")
    return path
