"""
Phase 1: Database setup — creates the document_chunks table and HNSW index.

Run this once before ingesting any data:
    python db_setup.py

Verification: queries pg_indexes to confirm the HNSW index was created.
"""

import embeddings
from db import get_connection

# ---------------------------------------------------------------------------
# SQL: enable pgvector, create table, create HNSW index
# ---------------------------------------------------------------------------

SQL_ENABLE_PGVECTOR = "CREATE EXTENSION IF NOT EXISTS vector;"

SQL_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS document_chunks (
    id            BIGSERIAL PRIMARY KEY,
    chunk_id      TEXT NOT NULL UNIQUE,
    strategy      TEXT NOT NULL CHECK (strategy IN ('fixed', 'structural', 'semantic')),
    source_page   INTEGER NOT NULL,
    char_start    INTEGER NOT NULL,
    char_end      INTEGER NOT NULL,
    content       TEXT NOT NULL,
    token_count   INTEGER,
    embedding     VECTOR({dim}) NOT NULL
);
"""

# HNSW index: m=16 (bidirectional links), ef_construction=64 (build-time recall).
# vector_cosine_ops: cosine distance, correct for normalized OpenAI embeddings.
# Justified over IVFFlat: a 50-page PDF produces ~150-600 chunks — well below the
# ~3,900 rows IVFFlat needs to train reliable inverted lists.
SQL_CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS document_chunks_embedding_hnsw_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
"""

SQL_VERIFY_INDEX = """
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'document_chunks';
"""


SQL_EXISTING_DIM = """
SELECT a.atttypmod
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
WHERE c.relname = 'document_chunks' AND a.attname = 'embedding' AND a.attnum > 0;
"""


def _drop_if_dim_mismatch(cur):
    """
    The vector column width is fixed at CREATE TABLE time. If the table exists
    with a different width than the active embedding model produces, inserts
    would fail — so drop and rebuild it.
    """
    cur.execute(SQL_EXISTING_DIM)
    row = cur.fetchone()
    if row and row[0] not in (None, -1) and row[0] != embeddings.EMBEDDING_DIM:
        print(f"  Existing table has VECTOR({row[0]}) but model needs "
              f"VECTOR({embeddings.EMBEDDING_DIM}) — dropping and recreating.")
        cur.execute("DROP TABLE document_chunks CASCADE;")


def setup_database():
    print("Connecting to Supabase Postgres...")
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    print("Enabling pgvector extension...")
    cur.execute(SQL_ENABLE_PGVECTOR)

    _drop_if_dim_mismatch(cur)

    print(f"Creating document_chunks table (VECTOR({embeddings.EMBEDDING_DIM}), model={embeddings.EMBEDDING_MODEL})...")
    cur.execute(SQL_CREATE_TABLE.format(dim=embeddings.EMBEDDING_DIM))

    print("Creating HNSW index (m=16, ef_construction=64)...")
    cur.execute(SQL_CREATE_INDEX)

    # Verification
    cur.execute(SQL_VERIFY_INDEX)
    rows = cur.fetchall()
    print("\n--- Verification: pg_indexes for document_chunks ---")
    for indexname, indexdef in rows:
        print(f"  {indexname}: {indexdef}")

    cur.close()
    conn.close()
    print("\nDatabase setup complete.")


if __name__ == "__main__":
    setup_database()
