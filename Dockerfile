# FastAPI backend (api/) plus the rag_pipeline modules it wraps.
# Build from the repo root: the API imports rag_pipeline by path.

FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/hf \
    NLTK_DATA=/opt/nltk_data

WORKDIR /app

# CPU-only torch first, so sentence-transformers doesn't pull the ~5 GB CUDA build
COPY rag_pipeline/requirements.txt requirements-pipeline.txt
COPY api/requirements.txt requirements-api.txt
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r requirements-pipeline.txt -r requirements-api.txt

# Bake the embedding model and NLTK data into the image so the first request
# doesn't download them
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" \
 && python -m nltk.downloader -d /opt/nltk_data punkt punkt_tab

COPY api ./api
COPY rag_pipeline ./rag_pipeline

WORKDIR /app/api
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
