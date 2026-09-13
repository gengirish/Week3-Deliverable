"""
FastAPI backend for the RAG chunking comparison demo.

Wraps the rag_pipeline modules; holds no retrieval logic of its own, so the API
and the CLI always describe the same pipeline.

Run:
    uvicorn main:app --reload --port 8000     (from the api/ directory)
"""

import os
import shutil
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import paths  # noqa: F401  — sets sys.path and cwd, must be imported first

import embeddings
import jobs
import service
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

@asynccontextmanager
async def lifespan(_: FastAPI):
    """
    Warm the embedding model in the background at startup.

    The local model loads lazily on first use, which otherwise lands on whoever
    runs the first search — an ~11 second pause at exactly the wrong moment in a
    demo. Loading it here moves that cost to server start. Backgrounded on a
    thread so the API begins serving immediately either way.
    """

    def warm():
        try:
            embeddings.embed_query("warmup")
            print("  [startup] Embedding model ready")
        except Exception as exc:
            print(f"  [startup] Model warmup skipped: {str(exc)[:120]}")

    threading.Thread(target=warm, daemon=True).start()
    yield


app = FastAPI(
    title="RAG Chunking Comparison API",
    description="Compare fixed, structural and semantic chunking over one PDF.",
    version="1.0.0",
    lifespan=lifespan,
)

# Next.js picks the next free port when 3000 is taken, so match localhost on any
# port rather than pinning one and breaking the demo when the port shifts.
# Deployments add their frontend's origin through CORS_ORIGIN_REGEX.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.environ.get(
        "CORS_ORIGIN_REGEX", r"http://(localhost|127\.0\.0\.1):\d+"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
    top_k: int = Field(default=3, ge=1, le=10)


class ProviderRequest(BaseModel):
    provider: str


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@app.get("/api/status")
def get_status():
    """Provider, indexed document and database counts — drives the whole UI."""
    return service.status()


@app.post("/api/provider")
def set_provider(req: ProviderRequest):
    """
    Switch embedding provider.

    Providers have different vector widths, so any existing index becomes
    unusable. The response says so explicitly and the UI prompts a re-index
    rather than leaving a table that silently cannot be queried.
    """
    available, reason = embeddings.provider_available(req.provider)
    if not available:
        raise HTTPException(status_code=400, detail=reason)

    previous = embeddings.current_provider()
    try:
        embeddings.set_provider(req.provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    current = embeddings.current_provider()
    dim_changed = previous["dim"] != current["dim"]

    # Preload the newly selected model rather than charging the next search for it
    threading.Thread(
        target=lambda: embeddings.embed_query("warmup"), daemon=True
    ).start()

    state = service.read_state()
    if dim_changed and state.get("indexed"):
        state["stale"] = True
        state["stale_reason"] = (
            f"Indexed with {previous['label']} at {previous['dim']} dims; "
            f"now using {current['label']} at {current['dim']} dims."
        )
        service.write_state(state)

    return {
        "provider": current,
        "reindex_required": dim_changed and state.get("indexed", False),
    }


# ---------------------------------------------------------------------------
# Indexing
# ---------------------------------------------------------------------------

@app.post("/api/index/upload")
async def upload_and_index(file: UploadFile = File(...)):
    """Accept a PDF, store it, and start a background index job."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are accepted.")

    destination = paths.UPLOAD_DIR / Path(file.filename).name
    with destination.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    if destination.stat().st_size == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    job_id = jobs.create("index")
    jobs.run(job_id, lambda progress: service.index_document(
        str(destination), destination.name, progress))
    return {"job_id": job_id, "filename": destination.name}


@app.post("/api/index/reference")
def index_reference_document():
    """
    Re-index the bundled reference document.

    This is the PDF the evaluation's gold spans were written against, so it is
    the one-click path back to a state where the benchmark can run.
    """
    reference = paths.DATA_DIR / "document.pdf"
    if not reference.exists():
        raise HTTPException(
            status_code=404,
            detail="Reference document not found at rag_pipeline/data/document.pdf",
        )

    job_id = jobs.create("index")
    jobs.run(job_id, lambda progress: service.index_document(
        str(reference), "IF-RES-2026-122 Choosing a Chunking Strategy", progress))
    return {"job_id": job_id, "filename": "document.pdf"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job id")
    return job


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

@app.post("/api/search")
def search(req: SearchRequest):
    """One query, three strategies, returned side by side."""
    state = service.read_state()
    if not state.get("indexed"):
        raise HTTPException(
            status_code=409,
            detail="No document is indexed yet. Index a PDF before searching.",
        )
    try:
        return service.search_all_strategies(req.query, req.top_k)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)[:300])


# ---------------------------------------------------------------------------
# Chunk explorer
# ---------------------------------------------------------------------------

@app.get("/api/chunks/stats")
def get_chunk_stats():
    return service.chunk_stats()


@app.get("/api/chunks/{strategy}")
def get_chunks(strategy: str, limit: int = 50, offset: int = 0):
    try:
        return service.list_chunks(strategy, limit=min(limit, 200), offset=offset)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

@app.post("/api/eval/run")
def start_evaluation():
    job_id = jobs.create("eval")
    jobs.run(job_id, lambda progress: service.run_evaluation(progress))
    return {"job_id": job_id}


@app.get("/api/eval/last")
def get_last_evaluation():
    result = service.last_evaluation()
    if result is None:
        raise HTTPException(status_code=404, detail="No evaluation has been run yet.")
    return result


@app.get("/api/eval/queries")
def get_eval_queries():
    """The benchmark query set and its gold anchors, for display before a run."""
    import query as q
    return {
        "top_k": q.TOP_K,
        "span_coverage": q.SPAN_COVERAGE,
        "queries": [
            {
                "id": q_id,
                "type": data["type"],
                "text": data["text"],
                "gold_anchor": q.GOLD_ANCHORS[q_id][0],
            }
            for q_id, data in q.QUERIES.items()
        ],
    }
