"""
Phase 1: Database setup — creates the document_chunks table and HNSW index.

Run this once before ingesting any data:
    python db_setup.py

Verification: queries pg_indexes to confirm the HNSW index was created.
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Connect via Supabase's Supavisor session pooler rather than the direct
# db.<project-ref>.supabase.co host: the direct host is IPv6-only unless the
# IPv4 add-on is purchased, and often fails to resolve on networks that don't
# route IPv6. The pooler accepts the actual Postgres password (NOT the
# service_role API key, which is a JWT used only for the REST/Auth APIs).
# ---------------------------------------------------------------------------

def get_connection():
    supabase_url = os.environ["SUPABASE_URL"]              # e.g. https://abcdef.supabase.co
    db_password  = os.environ["SUPABASE_DB_PASSWORD"]      # actual Postgres password, not the service key
    pooler_host  = os.environ.get("SUPABASE_POOLER_HOST", "aws-0-ap-south-1.pooler.supabase.com")

    # Extract project ref from URL: https://<ref>.supabase.co
    project_ref = supabase_url.replace("https://", "").split(".")[0]

    conn = psycopg2.connect(
        host=pooler_host,
        port=5432,
        dbname="postgres",
        user=f"postgres.{project_ref}",
        password=db_password,
        sslmode="require",
    )
    return conn


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
    embedding     VECTOR(1536) NOT NULL
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


def setup_database():
    print("Connecting to Supabase Postgres...")
    conn = get_connection()
    conn.autocommit = True
    cur = conn.cursor()

    print("Enabling pgvector extension...")
    cur.execute(SQL_ENABLE_PGVECTOR)

    print("Creating document_chunks table...")
    cur.execute(SQL_CREATE_TABLE)

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
