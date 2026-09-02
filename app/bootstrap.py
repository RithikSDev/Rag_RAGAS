import logging
import secrets
from pathlib import Path

from sqlalchemy.orm import Session

from app.config import PipelineConfig
from app.db import Base, build_engine, build_session_factory, ensure_columns
from app.db_models import PipelineConfigState
from app.generation.generator import Generator
from app.ingestion.embedder import Embedder
from app.ingestion.loader import LOADERS
from app.rag_pipeline import RAGPipeline
from app.retrieval.reranker import Reranker
from app.retrieval.retriever import Retriever
from app.retrieval.vector_store import VectorStore
from app.security.auth import seed_api_keys
from app.services.dataset_service import DatasetService
from app.services.ingestion_service import IngestionService
from app.services.threshold_service import ThresholdService
from app.services.user_service import UserService
from app.settings import Settings
from app.state import AppState

logger = logging.getLogger("app.bootstrap")


def _seed_initial_admin(db: Session, settings: Settings) -> None:
    users = UserService(db)

    if users.list_all():
        return  # a real login system already exists - never overwrite it

    password = settings.initial_admin_password or secrets.token_urlsafe(16)
    users.create(settings.initial_admin_username, password, role="admin", created_by="system")

    if settings.initial_admin_password:
        logger.info("seeded initial admin user %r from INITIAL_ADMIN_PASSWORD", settings.initial_admin_username)
    else:
        # Logged once, not persisted anywhere - this is the only place this
        # password is ever visible. Change it via the Users panel after login.
        logger.warning(
            "No INITIAL_ADMIN_PASSWORD set - generated a one-time admin password. "
            "username=%r password=%r (change this after logging in)",
            settings.initial_admin_username,
            password,
        )


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
    ensure_columns(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as db:
        seed_api_keys(db, settings.admin_api_key, settings.viewer_api_key)
        _seed_initial_admin(db, settings)
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
        has_seed_documents = any(p.suffix.lower() in LOADERS for p in documents_dir.iterdir())

        if not ingestion.list_documents() and has_seed_documents:
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
