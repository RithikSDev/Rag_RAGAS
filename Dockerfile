FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the embedding model at build time so a cold container start
# doesn't need HuggingFace Hub network access.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-small-en-v1.5')"

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
    CMD curl -f http://localhost:8000/health || exit 1

# --workers 1 is required, not a default left unconfigured: the on-disk Qdrant
# store (QDRANT_PATH) holds an exclusive file lock, so this process must run
# as a single worker/replica. Scale out by fronting multiple deployments with
# their own QDRANT_PATH/DATABASE_URL, not by adding workers here.
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
