import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.bootstrap import build_app_state
from app.db_models import PipelineConfigState, QueryLog
from app.dependencies import (
    get_db_session,
    get_evaluation_service,
    get_ingestion_service,
    get_pipeline,
    get_pipeline_config,
    get_principal,
    get_settings,
    get_threshold_service,
    get_vector_store,
    require_role,
)
from app.observability.logging_config import setup_logging
from app.observability.metrics import RAG_QUERY_COUNT, RAG_QUERY_LATENCY, render_metrics
from app.observability.middleware import RequestContextMiddleware
from app.schemas import Question, SettingsUpdate, ThresholdsUpdate, validate_settings_merge
from app.security.rate_limit import limiter
from app.services.evaluation_service import EvaluationService
from app.services.ingestion_service import IngestionService
from app.services.threshold_service import ThresholdService
from app.settings import Settings, get_settings_cached

settings = get_settings_cached()
setup_logging(settings.log_level, settings.log_format)

logger = logging.getLogger("app.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Re-resolved (not the module-level `settings`) so tests can monkeypatch env
    # vars + clear the settings cache per-test and get a fresh AppState per
    # TestClient lifespan cycle, rather than one fixed at first import.
    app.state.app_state = build_app_state(get_settings_cached())
    logger.info("application startup complete")

    yield

    app.state.app_state.engine.dispose()
    app.state.app_state.vector_store.client.close()
    logger.info("application shutdown complete")


app = FastAPI(lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestContextMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)


def _document_out(document) -> dict:
    return {
        "name": document.original_filename,
        "chunks": document.chunk_count,
        "ingested_at": document.ingested_at.isoformat(),
        "status": document.status,
    }


@app.get("/health")
def health(db: Session = Depends(get_db_session), vector_store=Depends(get_vector_store)):
    try:
        db.execute(text("SELECT 1"))
        vector_store.client.get_collections()
    except Exception as exc:
        logger.error("health check failed", extra={"error": str(exc)})
        raise HTTPException(status_code=503, detail="Service unavailable") from exc

    return {"status": "ok"}


@app.get("/metrics")
def metrics(principal=Depends(get_principal)):
    body, content_type = render_metrics()
    return Response(content=body, media_type=content_type)


@app.post("/ask")
@limiter.limit("10/minute")
def ask(
    request: Request,
    payload: Question,
    pipeline=Depends(get_pipeline),
    db: Session = Depends(get_db_session),
    principal=Depends(require_role("viewer", "admin")),
):
    started = time.perf_counter()

    try:
        result = pipeline.run(payload.question)
    except Exception as exc:
        db.add(
            QueryLog(
                question=payload.question,
                caller=principal.label,
                status_code=502,
                error=str(exc),
            )
        )
        db.commit()
        logger.exception("ask failed")
        raise HTTPException(status_code=502, detail="Generation failed") from exc

    latency_ms = (time.perf_counter() - started) * 1000

    db.add(
        QueryLog(
            question=payload.question,
            answer=result["answer"],
            contexts_count=len(result["contexts"]),
            latency_ms=latency_ms,
            caller=principal.label,
            status_code=200,
        )
    )
    db.commit()

    RAG_QUERY_COUNT.inc()
    RAG_QUERY_LATENCY.observe(latency_ms / 1000)

    return result


@app.get("/documents")
def list_documents(
    ingestion: IngestionService = Depends(get_ingestion_service),
    principal=Depends(require_role("viewer", "admin")),
):
    return {"documents": [_document_out(doc) for doc in ingestion.list_documents()]}


@app.post("/documents")
@limiter.limit("5/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    ingestion: IngestionService = Depends(get_ingestion_service),
    settings: Settings = Depends(get_settings),
    principal=Depends(require_role("admin")),
):
    document = await ingestion.save_upload(file, settings.max_upload_mb, principal.label)
    return _document_out(document)


@app.get("/ragas")
def ragas_scores(
    evaluation: EvaluationService = Depends(get_evaluation_service),
    principal=Depends(require_role("viewer", "admin")),
):
    return evaluation.latest() or {"metrics": [], "average": {}, "results": [], "config": {}}


@app.get("/ragas/runs")
def ragas_runs(
    evaluation: EvaluationService = Depends(get_evaluation_service),
    principal=Depends(require_role("viewer", "admin")),
):
    return {"runs": evaluation.list_runs()}


@app.post("/evaluate")
@limiter.limit("2/minute")
def evaluate(
    request: Request,
    evaluation: EvaluationService = Depends(get_evaluation_service),
    principal=Depends(require_role("admin")),
):
    return evaluation.run_and_record(caller=principal.label)


@app.get("/settings")
def get_settings_route(
    config=Depends(get_pipeline_config),
    principal=Depends(require_role("viewer", "admin")),
):
    return config.to_dict()


@app.post("/settings")
@limiter.limit("10/minute")
def update_settings(
    request: Request,
    payload: SettingsUpdate,
    db: Session = Depends(get_db_session),
    ingestion: IngestionService = Depends(get_ingestion_service),
    config=Depends(get_pipeline_config),
    pipeline=Depends(get_pipeline),
    principal=Depends(require_role("admin")),
):
    updates = payload.model_dump(exclude_none=True)
    merged = {**config.to_dict(), **updates}

    try:
        validate_settings_merge(merged)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    config.update(**updates)
    pipeline.top_k = config.top_k

    row = db.get(PipelineConfigState, 1)
    for key, value in updates.items():
        setattr(row, key, value)
    row.updated_by = principal.label
    db.commit()

    reindex_keys = {"chunk_size", "chunk_overlap", "chunking_strategy", "semantic_threshold"}
    documents = ingestion.list_documents()

    if reindex_keys & updates.keys():
        documents = ingestion.rebuild_index(caller=principal.label)

    return {
        "config": config.to_dict(),
        "documents": [_document_out(doc) for doc in documents],
    }


@app.get("/settings/thresholds")
def get_thresholds(
    thresholds: ThresholdService = Depends(get_threshold_service),
    principal=Depends(require_role("viewer", "admin")),
):
    return {"thresholds": thresholds.get_all()}


@app.post("/settings/thresholds")
@limiter.limit("10/minute")
def update_thresholds(
    request: Request,
    payload: ThresholdsUpdate,
    thresholds: ThresholdService = Depends(get_threshold_service),
    principal=Depends(require_role("admin")),
):
    updates = {
        metric: {"good": entry.good, "warning": entry.warning}
        for metric, entry in payload.thresholds.items()
    }
    return {"thresholds": thresholds.update(updates, updated_by=principal.label)}
