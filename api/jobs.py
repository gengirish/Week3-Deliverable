"""
In-process job tracking for long-running work (indexing, evaluation).

Deliberately in-memory: this is a single-process demo app, and a durable queue
would add infrastructure without adding anything the demo shows. Jobs are lost
on restart, which is the correct trade here.
"""

import threading
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def create(kind: str) -> str:
    job_id = uuid.uuid4().hex[:12]
    with _lock:
        _jobs[job_id] = {
            "id": job_id,
            "kind": kind,
            "state": "pending",
            "stage": "queued",
            "message": "Waiting to start",
            "pct": 0.0,
            "result": None,
            "error": None,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "finished_at": None,
        }
    return job_id


def get(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def _update(job_id: str, **fields: Any) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


def run(job_id: str, fn: Callable[[Callable], Any]) -> None:
    """
    Run `fn` on a worker thread, passing it a progress reporter.

    The pipeline is CPU- and IO-bound rather than async, so a thread keeps the
    event loop responsive while indexing runs.
    """

    def progress(stage: str, message: str, pct: float) -> None:
        _update(job_id, stage=stage, message=message, pct=round(float(pct), 1))

    def worker() -> None:
        _update(job_id, state="running", stage="starting", message="Starting", pct=1.0)
        try:
            result = fn(progress)
            _update(job_id, state="succeeded", stage="done", message="Complete",
                    pct=100.0, result=result,
                    finished_at=datetime.now(timezone.utc).isoformat())
        except Exception as exc:
            traceback.print_exc()
            _update(job_id, state="failed", stage="error", message=str(exc)[:400],
                    error=str(exc)[:400],
                    finished_at=datetime.now(timezone.utc).isoformat())

    threading.Thread(target=worker, daemon=True).start()
