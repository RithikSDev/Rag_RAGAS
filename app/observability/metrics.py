from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

REQUEST_COUNT = Counter(
    "http_requests_total", "Total HTTP requests", ["method", "path", "status"]
)
REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds", "HTTP request latency", ["method", "path"]
)

RAG_QUERY_COUNT = Counter("rag_query_total", "Total /ask queries")
RAG_QUERY_LATENCY = Histogram("rag_query_duration_seconds", "Latency of /ask queries")

INGESTION_COUNT = Counter("document_ingestion_total", "Total documents ingested")
EVALUATION_RUNS = Counter("evaluation_runs_total", "Total RAGAS evaluation runs")

ACTIVE_DOCUMENTS = Gauge("active_documents", "Number of documents currently indexed")
VECTOR_STORE_SIZE = Gauge("vector_store_points", "Number of vectors currently indexed")


def render_metrics() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
