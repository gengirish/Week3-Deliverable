"""
Path setup — must be imported before any rag_pipeline module.

The pipeline modules import each other by top-level name (`from ingest import ...`)
and resolve data/results with paths relative to the working directory. Rather than
rewrite that, put the pipeline directory on sys.path and make the process work from
there, so both the CLI and the API see identical behaviour.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAG_DIR = ROOT / "rag_pipeline"
DATA_DIR = RAG_DIR / "data"
RESULTS_DIR = RAG_DIR / "results"
UPLOAD_DIR = DATA_DIR / "uploads"
STATE_FILE = RESULTS_DIR / "active_document.json"

for directory in (DATA_DIR, RESULTS_DIR, UPLOAD_DIR):
    directory.mkdir(parents=True, exist_ok=True)

API_DIR = Path(__file__).resolve().parent

# Both directories go on sys.path by absolute path. The chdir below moves the
# working directory away from api/, so relying on the interpreter's default
# cwd entry would break sibling imports (jobs, service) once it runs.
for directory in (API_DIR, RAG_DIR):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

# Pipeline code resolves ./data and ./results relative to cwd
os.chdir(RAG_DIR)
