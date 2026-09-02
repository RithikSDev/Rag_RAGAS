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
    get_dataset_service,
    get_db_session,
    get_evaluation_service,
    get_hybrid_retrieval_service,
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
from app.schemas import (
    EvalQuestionCreate,
    EvalQuestionUpdate,
    Question,
    RetrievalDebugRequest,
    RunLabelUpdate,
    SettingsUpdate,
    ThresholdsUpdate,
    validate_settings_merge,
)
from app.security.rate_limit import limiter
from app.services.dataset_service import DatasetService, parse_import_rows
from app.services.evaluation_service import EvaluationService
from app.services.hybrid_retrieval_service import HybridRetrievalService
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


@app.post("/retrieval/debug")
@limiter.limit("10/minute")
def retrieval_debug(
    request: Request,
    payload: RetrievalDebugRequest,
    hybrid: HybridRetrievalService = Depends(get_hybrid_retrieval_service),
    principal=Depends(require_role("viewer", "admin")),
):
    return hybrid.debug_search(
        payload.query,
        top_k_initial=payload.top_k_initial,
        top_k_final=payload.top_k_final,
        vector_weight=payload.vector_weight,
        bm25_weight=payload.bm25_weight,
        use_reranker=payload.use_reranker,
    )


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


@app.get("/ragas/runs/{run_id}")
def ragas_run_detail(
    run_id: str,
    evaluation: EvaluationService = Depends(get_evaluation_service),
    principal=Depends(require_role("viewer", "admin")),
):
    run = evaluation.get_run(run_id)

    if run is None:
        raise HTTPException(status_code=404, detail="run not found")

    return run


@app.patch("/ragas/runs/{run_id}")
@limiter.limit("20/minute")
def label_run(
    request: Request,
    run_id: str,
    payload: RunLabelUpdate,
    evaluation: EvaluationService = Depends(get_evaluation_service),
    principal=Depends(require_role("admin")),
):
    run = evaluation.set_label(run_id, payload.label, payload.notes)

    if run is None:
        raise HTTPException(status_code=404, detail="run not found")

    return run


@app.post("/evaluate", status_code=202)
@limiter.limit("2/minute")
async def evaluate(
    request: Request,
    evaluation: EvaluationService = Depends(get_evaluation_service),
    principal=Depends(require_role("admin")),
):
    # Must be async (not run_in_threadpool'd like a sync def route) so that
    # start_run()'s asyncio.create_task() has an actual running loop to
    # attach the background evaluation task to.
    run_id = evaluation.start_run(caller=principal.label)
    return {"run_id": run_id, "status": "running"}


@app.get("/evaluate/{run_id}/progress")
def evaluate_progress(
    run_id: str,
    evaluation: EvaluationService = Depends(get_evaluation_service),
    principal=Depends(require_role("viewer", "admin")),
):
    progress = evaluation.progress(run_id)

    if progress is None:
        raise HTTPException(status_code=404, detail="run not found")

    return progress


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


def _question_out(question) -> dict:
    return {
        "id": question.id,
        "user_input": question.user_input,
        "reference": question.reference,
        "source": question.source,
        "created_at": question.created_at.isoformat(),
        "created_by": question.created_by,
    }


@app.get("/dataset")
def list_dataset(
    dataset: DatasetService = Depends(get_dataset_service),
    principal=Depends(require_role("viewer", "admin")),
):
    return {"questions": [_question_out(q) for q in dataset.list_all()]}


@app.post("/dataset")
@limiter.limit("20/minute")
def create_dataset_question(
    request: Request,
    payload: EvalQuestionCreate,
    dataset: DatasetService = Depends(get_dataset_service),
    principal=Depends(require_role("admin")),
):
    question = dataset.create(payload.user_input, payload.reference, created_by=principal.label)
    return _question_out(question)


@app.put("/dataset/{question_id}")
@limiter.limit("20/minute")
def update_dataset_question(
    request: Request,
    question_id: str,
    payload: EvalQuestionUpdate,
    dataset: DatasetService = Depends(get_dataset_service),
    principal=Depends(require_role("admin")),
):
    question = dataset.update(question_id, payload.user_input, payload.reference)

    if question is None:
        raise HTTPException(status_code=404, detail="question not found")

    return _question_out(question)


@app.delete("/dataset/{question_id}")
@limiter.limit("20/minute")
def delete_dataset_question(
    request: Request,
    question_id: str,
    dataset: DatasetService = Depends(get_dataset_service),
    principal=Depends(require_role("admin")),
):
    if not dataset.delete(question_id):
        raise HTTPException(status_code=404, detail="question not found")

    return {"deleted": question_id}


@app.post("/dataset/import")
@limiter.limit("5/minute")
async def import_dataset(
    request: Request,
    file: UploadFile = File(...),
    dataset: DatasetService = Depends(get_dataset_service),
    settings: Settings = Depends(get_settings),
    principal=Depends(require_role("admin")),
):
    content = await file.read()

    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_mb}MB limit")

    try:
        # json.JSONDecodeError subclasses ValueError, so this also covers malformed JSON.
        rows = parse_import_rows(file.filename or "", content)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail=f"Could not parse import file: {exc}") from exc

    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found (need user_input + reference columns)")

    created = dataset.bulk_import(rows, created_by=principal.label)

    return {"imported": len(created), "questions": [_question_out(q) for q in created]}
