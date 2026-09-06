"""
Shared Postgres connection helper for Supabase.

Supabase's Postgres password is NOT the service-role API key — it is the database
password set when the project was created (SUPABASE_DB_PASSWORD).

Connection preference:
    1. SUPABASE_DB_URL, if set (full libpq URL — overrides everything)
    2. Direct connection: db.<project-ref>.supabase.co:5432 (IPv6-only on many networks)
    3. Session pooler:    aws-0-<region>.pooler.supabase.com:5432 (IPv4 fallback)
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

CONNECT_TIMEOUT = 15


def _project_ref() -> str:
    return os.environ["SUPABASE_URL"].replace("https://", "").split(".")[0]


def _db_password() -> str:
    pw = os.environ.get("SUPABASE_DB_PASSWORD")
    if not pw:
        raise RuntimeError(
            "SUPABASE_DB_PASSWORD is not set. This is the Postgres password from "
            "Supabase > Project Settings > Database, not the service-role API key."
        )
    return pw


def get_connection():
    """Return a live psycopg2 connection, trying direct then pooler."""
    url = os.environ.get("SUPABASE_DB_URL")
    if url:
        return psycopg2.connect(url, connect_timeout=CONNECT_TIMEOUT)

    ref = _project_ref()
    password = _db_password()
    region = os.environ.get("SUPABASE_REGION", "ap-south-1")

    candidates = [
        # (label, kwargs)
        ("direct", dict(host=f"db.{ref}.supabase.co", port=5432, user="postgres")),
        ("pooler", dict(host=f"aws-0-{region}.pooler.supabase.com", port=5432,
                        user=f"postgres.{ref}")),
    ]

    last_error = None
    for label, kwargs in candidates:
        try:
            return psycopg2.connect(
                dbname="postgres",
                password=password,
                sslmode="require",
                connect_timeout=CONNECT_TIMEOUT,
                **kwargs,
            )
        except psycopg2.OperationalError as exc:
            print(f"  [db] {label} connection failed: {str(exc).strip()[:100]}")
            last_error = exc

    raise RuntimeError(f"Could not connect to Supabase Postgres: {last_error}")
