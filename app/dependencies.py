from typing import Iterator

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.security.auth import Principal, resolve_principal
from app.services.dataset_service import DatasetService
from app.services.evaluation_service import EvaluationService
from app.services.hybrid_retrieval_service import HybridRetrievalService
from app.services.ingestion_service import IngestionService
from app.services.threshold_service import ThresholdService
from app.settings import Settings, get_settings_cached
from app.state import AppState


def get_settings() -> Settings:
    return get_settings_cached()


def get_app_state(request: Request) -> AppState:
    return request.app.state.app_state


def get_db_session(app_state: AppState = Depends(get_app_state)) -> Iterator[Session]:
    db = app_state.session_factory()
    try:
        yield db
    finally:
        db.close()


def get_embedder(app_state: AppState = Depends(get_app_state)):
    return app_state.embedder


def get_vector_store(app_state: AppState = Depends(get_app_state)):
    return app_state.vector_store


def get_generator(app_state: AppState = Depends(get_app_state)):
    return app_state.generator


def get_pipeline(app_state: AppState = Depends(get_app_state)):
    return app_state.pipeline


def get_pipeline_config(app_state: AppState = Depends(get_app_state)):
    return app_state.pipeline_config


def get_principal(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db_session),
) -> Principal:
    return resolve_principal(db, x_api_key)


def require_role(*allowed_roles: str):
    def _dependency(principal: Principal = Depends(get_principal)) -> Principal:
        if principal.role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Requires role: {' or '.join(allowed_roles)}",
            )
        return principal

    return _dependency


def get_ingestion_service(
    db: Session = Depends(get_db_session),
    app_state: AppState = Depends(get_app_state),
) -> IngestionService:
    return IngestionService(
        db,
        app_state.embedder,
        app_state.vector_store,
        app_state.pipeline_config,
        app_state.documents_dir,
    )


def get_dataset_service(db: Session = Depends(get_db_session)) -> DatasetService:
    return DatasetService(db)


def get_evaluation_service(
    db: Session = Depends(get_db_session),
    app_state: AppState = Depends(get_app_state),
    dataset_service: DatasetService = Depends(get_dataset_service),
) -> EvaluationService:
    return EvaluationService(
        db,
        app_state.pipeline,
        app_state.pipeline_config,
        dataset_service,
        app_state.session_factory,
        app_state.running_tasks,
    )


def get_threshold_service(db: Session = Depends(get_db_session)) -> ThresholdService:
    return ThresholdService(db)


def get_hybrid_retrieval_service(
    app_state: AppState = Depends(get_app_state),
) -> HybridRetrievalService:
    return HybridRetrievalService(app_state.retriever, app_state.vector_store, app_state.reranker)
