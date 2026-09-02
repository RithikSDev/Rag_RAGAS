FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# HF_HOME lives under /app (chowned to appuser below) rather than the default
# /root - the pre-download RUN steps below run as root, but the app runs as
# appuser at container start, and appuser has no access to /root's cache.
# Without this, the "pre-download at build time" step is silently defeated:
# every cold start re-downloads both models over the network.
ENV HF_HOME=/app/.cache/huggingface

# Pre-download the embedding + reranker models at build time so a cold
# container start doesn't need HuggingFace Hub network access (and doesn't
# blow past the healthcheck's start-period waiting on a runtime download).
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"
RUN python -c "from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')"

COPY app app
COPY evaluation evaluation
COPY api.py main.py ./

# Seed documents baked into the image so a fresh volume gets bootstrap-ingested
# on first start (Docker copies an image directory's contents into an empty
# named volume mounted over it) - matches local dev's out-of-the-box behavior.
COPY data/documents data/documents

RUN useradd --create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -f http://127.0.0.1:8000/health || exit 1

# --workers 1 is required, not a default left unconfigured: the on-disk Qdrant
# store (QDRANT_PATH) holds an exclusive file lock, so this process must run
# as a single worker/replica. Scale out by fronting multiple deployments with
# their own QDRANT_PATH/DATABASE_URL, not by adding workers here.
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
