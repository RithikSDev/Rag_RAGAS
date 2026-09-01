from dataclasses import dataclass
from typing import Callable

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.config import PipelineConfig
from app.generation.generator import Generator
from app.ingestion.embedder import Embedder
from app.rag_pipeline import RAGPipeline
from app.retrieval.retriever import Retriever
from app.retrieval.vector_store import VectorStore


@dataclass
class AppState:
    engine: Engine
    session_factory: Callable[[], Session]
    embedder: Embedder
    vector_store: VectorStore
    retriever: Retriever
    generator: Generator
    pipeline: RAGPipeline
    pipeline_config: PipelineConfig
    documents_dir: str
    max_upload_mb: int
