"""
Phase 4: Embedding generation.

Two providers, selected by the EMBEDDING_PROVIDER env var:

    local  (default) — sentence-transformers all-MiniLM-L6-v2, 384 dims.
                       Runs offline on CPU, no API key, no cost.
    openai           — text-embedding-3-small, 1536 dims. Needs OPENAI_API_KEY
                       with available credit.

Both providers expose the same interface, so the rest of the pipeline is
provider-agnostic. The DB vector column width is taken from EMBEDDING_DIM.

Provides:
    embed_chunks()    — embed a list of chunk dicts, returns them with embeddings attached
    embed_sentences() — embed individual sentences (for semantic chunking)
    embed_query()     — embed a single query string for retrieval

Batching: BATCH_SIZE texts per call.
Retry: exponential backoff on rate limit (429), max 3 retries (openai only).
"""

import os
import time
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

# ---------------------------------------------------------------------------
# Provider configuration.
#
# These are module-level names rather than constants so the running API can
# switch providers without a restart. Import the module (`import embeddings`)
# and read `embeddings.EMBEDDING_DIM` rather than binding the value at import
# time with `from embeddings import EMBEDDING_DIM`, which would go stale.
# ---------------------------------------------------------------------------

PROVIDER_SPECS = {
    "local": {
        "model": os.environ.get("LOCAL_EMBEDDING_MODEL", "all-MiniLM-L6-v2"),
        "dim": 384,
        "batch_size": 256,
        "label": "all-MiniLM-L6-v2 (local)",
        "requires_key": False,
    },
    "openai": {
        "model": "text-embedding-3-small",
        "dim": 1536,
        "batch_size": 100,
        "label": "text-embedding-3-small (OpenAI)",
        "requires_key": True,
    },
}

PROVIDER = ""
EMBEDDING_MODEL = ""
EMBEDDING_DIM = 0
BATCH_SIZE = 0
MAX_RETRIES = 3

_local_models: dict[str, object] = {}


def set_provider(provider: str) -> dict:
    """
    Switch the active embedding provider and return its spec.

    Changing provider changes the vector width, so any existing index built with
    the previous provider is invalid — callers must re-run db_setup and re-embed.
    """
    provider = (provider or "local").lower()
    if provider not in PROVIDER_SPECS:
        raise ValueError(
            f"Unknown embedding provider {provider!r}. "
            f"Expected one of: {', '.join(PROVIDER_SPECS)}"
        )

    spec = PROVIDER_SPECS[provider]
    globals().update(
        PROVIDER=provider,
        EMBEDDING_MODEL=spec["model"],
        EMBEDDING_DIM=spec["dim"],
        BATCH_SIZE=spec["batch_size"],
    )
    return spec


def current_provider() -> dict:
    """Active provider as a plain dict, for API responses."""
    return {
        "provider": PROVIDER,
        "model": EMBEDDING_MODEL,
        "dim": EMBEDDING_DIM,
        "label": PROVIDER_SPECS[PROVIDER]["label"],
        "batch_size": BATCH_SIZE,
    }


def provider_available(provider: str) -> tuple[bool, str]:
    """Whether a provider can actually run right now, and why not if it cannot."""
    spec = PROVIDER_SPECS.get(provider)
    if spec is None:
        return False, "Unknown provider"
    if spec["requires_key"] and not os.environ.get("OPENAI_API_KEY"):
        return False, "OPENAI_API_KEY is not set"
    return True, ""


set_provider(os.environ.get("EMBEDDING_PROVIDER", "local"))




def _get_local_model():
    """Load the sentence-transformers model once per model name and cache it."""
    name = EMBEDDING_MODEL
    if name not in _local_models:
        from sentence_transformers import SentenceTransformer
        print(f"  [embeddings] Loading local model '{name}' (first run downloads it)...")
        _local_models[name] = SentenceTransformer(name)
    return _local_models[name]


def _get_client():
    import openai
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise EnvironmentError("OPENAI_API_KEY is not set. Add it to your .env file.")
    return openai.OpenAI(api_key=api_key)


def _embed_batch(texts: list[str]) -> list[list[float]]:
    """
    Embed a batch of texts using the configured provider.
    Returns a list of embedding vectors aligned with input texts.
    """
    if PROVIDER != "openai":
        model = _get_local_model()
        # normalize so cosine distance in pgvector matches the model's intent
        vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [v.tolist() for v in vectors]

    import openai
    client = _get_client()
    for attempt in range(MAX_RETRIES):
        try:
            response = client.embeddings.create(input=texts, model=EMBEDDING_MODEL)
            return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
        except openai.RateLimitError:
            wait = 2 ** attempt
            print(f"    [embeddings] Rate limit hit. Waiting {wait}s (attempt {attempt + 1}/{MAX_RETRIES})...")
            time.sleep(wait)
        except openai.APIError as e:
            print(f"    [embeddings] API error: {e}. Retrying...")
            time.sleep(2 ** attempt)

    raise RuntimeError(f"Embedding failed after {MAX_RETRIES} retries.")


def embed_chunks(chunks: list[dict]) -> list[dict]:
    """
    Embed all chunks in batches of BATCH_SIZE.
    Attaches 'embedding' key (list[float]) to each chunk dict in-place.
    Returns the same list with embeddings populated.
    """
    total = len(chunks)
    print(f"  [embeddings] Embedding {total} chunks in batches of {BATCH_SIZE}...")

    for batch_start in range(0, total, BATCH_SIZE):
        batch = chunks[batch_start: batch_start + BATCH_SIZE]
        texts = [c["content"] for c in batch]
        vectors = _embed_batch(texts)

        for chunk, vector in zip(batch, vectors):
            chunk["embedding"] = vector

        print(f"    [embeddings] Batch {batch_start // BATCH_SIZE + 1}: "
              f"{batch_start + len(batch)}/{total} done")

    # Verify shape
    sample = chunks[0]["embedding"] if chunks else []
    print(f"  [embeddings] Embedding dim: {len(sample)} (expected {EMBEDDING_DIM})")
    return chunks


def embed_sentences(sentences: list[str]) -> list[list[float]]:
    """
    Embed individual sentences for semantic chunking.
    Returns a list of embedding vectors aligned with input sentences.
    """
    total = len(sentences)
    print(f"  [embeddings] Embedding {total} sentences for semantic chunking...")

    all_vectors: list[list[float]] = []
    for batch_start in range(0, total, BATCH_SIZE):
        batch = sentences[batch_start: batch_start + BATCH_SIZE]
        vectors = _embed_batch(batch)
        all_vectors.extend(vectors)
        print(f"    [embeddings] Sentences: {batch_start + len(batch)}/{total} done")

    return all_vectors


def embed_query(query: str) -> list[float]:
    """
    Embed a single query string for semantic search.
    Returns a single embedding vector.
    """
    vectors = _embed_batch([query])
    return vectors[0]


def insert_chunks_to_db(chunks: list[dict], conn) -> int:
    """
    Insert a list of chunk dicts (with embeddings) into document_chunks table.
    Uses a single executemany for efficiency.
    Returns the number of rows inserted.
    """
    import psycopg2.extras

    records = [
        (
            c["chunk_id"],
            c["strategy"],
            c["source_page"],
            c["char_start"],
            c["char_end"],
            c["content"],
            c["token_count"],
            c["embedding"],
        )
        for c in chunks
    ]

    sql = """
        INSERT INTO document_chunks
            (chunk_id, strategy, source_page, char_start, char_end,
             content, token_count, embedding)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector)
        ON CONFLICT (chunk_id) DO NOTHING;
    """

    strategy = records[0][1] if records else None

    cur = conn.cursor()
    # execute_batch's rowcount only reflects the final batch, so count the rows
    # that actually landed rather than reporting a misleading number.
    before = _count_for_strategy(cur, strategy)
    psycopg2.extras.execute_batch(cur, sql, records, page_size=100)
    conn.commit()
    inserted = _count_for_strategy(cur, strategy) - before
    cur.close()

    print(f"  [embeddings] Inserted {inserted} new chunks into document_chunks "
          f"({len(records)} submitted, {len(records) - inserted} duplicates skipped)")
    return len(records)


def _count_for_strategy(cur, strategy: str | None) -> int:
    if strategy is None:
        return 0
    cur.execute("SELECT COUNT(*) FROM document_chunks WHERE strategy = %s;", (strategy,))
    return cur.fetchone()[0]


def verify_row_counts(conn) -> dict[str, int]:
    """Print and return row counts per strategy."""
    cur = conn.cursor()
    cur.execute("""
        SELECT strategy, COUNT(*) as count
        FROM document_chunks
        GROUP BY strategy
        ORDER BY strategy;
    """)
    rows = cur.fetchall()
    cur.close()

    counts = {}
    print("\n--- Verification: row counts per strategy ---")
    for strategy, count in rows:
        print(f"  {strategy}: {count} rows")
        counts[strategy] = count
    return counts
