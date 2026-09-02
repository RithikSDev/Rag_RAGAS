import logging
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import PipelineConfig
from app.db import Base, build_engine, build_session_factory
from app.db_models import PipelineConfigState
from app.generation.generator import Generator
from app.ingestion.embedder import Embedder
from app.rag_pipeline import RAGPipeline
from app.retrieval.reranker import Reranker
from app.retrieval.retriever import Retriever
from app.retrieval.vector_store import VectorStore
from app.security.auth import seed_api_keys
from app.services.dataset_service import DatasetService
from app.services.ingestion_service import IngestionService
from app.services.threshold_service import ThresholdService
from app.settings import Settings
from app.state import AppState

logger = logging.getLogger("app.bootstrap")


def _load_or_create_config(db: Session) -> PipelineConfig:
    row = db.get(PipelineConfigState, 1)

    if row is None:
        row = PipelineConfigState(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)

    return PipelineConfig(
        chunk_size=row.chunk_size,
        chunk_overlap=row.chunk_overlap,
        chunking_strategy=row.chunking_strategy,
        semantic_threshold=row.semantic_threshold,
        top_k=row.top_k,
    )


def build_app_state(settings: Settings) -> AppState:
    engine = build_engine(settings.database_url)
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as db:
        seed_api_keys(db, settings.admin_api_key, settings.viewer_api_key)
        pipeline_config = _load_or_create_config(db)
        ThresholdService(db).seed_defaults()

        from evaluation.create_dataset import QUESTIONS

        DatasetService(db).seed_defaults(QUESTIONS)

    embedder = Embedder()
    vector_store = VectorStore(path=settings.qdrant_path)
    retriever = Retriever(vector_store, embedder)
    generator = Generator(model=settings.anthropic_model)
    reranker = Reranker()
    pipeline = RAGPipeline(retriever, generator, top_k=pipeline_config.top_k)

    documents_dir = Path(settings.documents_dir)
    documents_dir.mkdir(parents=True, exist_ok=True)

    with session_factory() as db:
        ingestion = IngestionService(db, embedder, vector_store, pipeline_config, documents_dir)

        # Only bootstrap-ingest on a genuinely fresh DB (no Document rows yet).
        # A restart with an existing on-disk Qdrant store + DB should trust what's
        # already persisted, not re-embed everything on every boot.
        if not ingestion.list_documents() and any(documents_dir.glob("*.pdf")):
            logger.info("fresh database detected, bootstrap-ingesting seed documents")
            ingestion.rebuild_index(caller="system")

    return AppState(
        engine=engine,
        session_factory=session_factory,
        embedder=embedder,
        vector_store=vector_store,
        retriever=retriever,
        generator=generator,
        reranker=reranker,
        pipeline=pipeline,
        pipeline_config=pipeline_config,
        documents_dir=str(documents_dir),
        max_upload_mb=settings.max_upload_mb,
        running_tasks=set(),
    )
