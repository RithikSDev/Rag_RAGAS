import hashlib
import logging
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import PipelineConfig
from app.db_models import Document
from app.ingestion.chunker import chunk_document
from app.ingestion.embedder import Embedder
from app.ingestion.loader import load_pdf
from app.observability.metrics import ACTIVE_DOCUMENTS, INGESTION_COUNT, VECTOR_STORE_SIZE
from app.retrieval.vector_store import VectorStore
from app.security.uploads import generate_stored_filename, read_and_validate_upload

logger = logging.getLogger("app.ingestion")


class IngestionService:
    def __init__(
        self,
        db: Session,
        embedder: Embedder,
        vector_store: VectorStore,
        config: PipelineConfig,
        documents_dir: Path,
    ):
        self.db = db
        self.embedder = embedder
        self.vector_store = vector_store
        self.config = config
        self.documents_dir = Path(documents_dir)

    def ingest_file(self, path: Path, original_filename: str, sha256: str, file_size: int, caller: str) -> Document:
        pages = load_pdf(str(path))
        chunks = chunk_document(pages, self.config, self.embedder)

        # Document row is created *before* the chunks are written so each
        # chunk's payload can be tagged with its real document_id (needed for
        # per-document chunk browsing) - if the embed/index step below then
        # fails, the compensating delete keeps the DB and vector store from
        # drifting out of sync.
        document = Document(
            original_filename=original_filename,
            stored_filename=path.name,
            sha256=sha256,
            file_size_bytes=file_size,
            chunk_count=len(chunks),
            chunking_strategy=self.config.chunking_strategy,
            chunk_size=self.config.chunk_size,
            chunk_overlap=self.config.chunk_overlap,
            semantic_threshold=self.config.semantic_threshold,
            ingested_by=caller,
        )

        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)

        try:
            tagged_chunks = [{**chunk, "document_id": document.id} for chunk in chunks]
            vectors = self.embedder.embed([chunk["text"] for chunk in chunks])
            self.vector_store.add_documents(tagged_chunks, vectors)
        except Exception:
            self.db.delete(document)
            self.db.commit()
            raise

        INGESTION_COUNT.inc()
        self._refresh_gauges()

        logger.info("document ingested", extra={"file": original_filename, "chunks": len(chunks)})

        return document

    async def save_upload(self, file: UploadFile, max_upload_mb: int, caller: str) -> Document:
        raw_bytes, sha256 = await read_and_validate_upload(file, max_upload_mb)

        stored_filename = generate_stored_filename()
        path = self.documents_dir / stored_filename
        self.documents_dir.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw_bytes)

        try:
            return self.ingest_file(path, file.filename, sha256, len(raw_bytes), caller)
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning(
                "ingestion failed, discarding upload",
                extra={"file": file.filename, "error": str(exc)},
            )

            try:
                path.unlink(missing_ok=True)
            except OSError:
                # Best-effort - e.g. on Windows a failed pymupdf parse can leave
                # the file handle not-yet-released; don't let cleanup mask the
                # real error response.
                logger.warning("could not remove failed upload artifact", extra={"path": str(path)})

            raise HTTPException(
                status_code=400, detail="Could not process file as a valid PDF"
            ) from exc

    def rebuild_index(self, caller: str) -> list[Document]:
        self.vector_store.reset()
        self.db.query(Document).delete()
        self.db.commit()

        documents = []

        for pdf_path in sorted(self.documents_dir.glob("*.pdf")):
            raw_bytes = pdf_path.read_bytes()
            sha256 = hashlib.sha256(raw_bytes).hexdigest()

            try:
                documents.append(
                    self.ingest_file(pdf_path, pdf_path.name, sha256, len(raw_bytes), caller)
                )
            except Exception as exc:
                # One corrupt file on disk shouldn't take down a re-index of
                # every other document - skip it and keep going.
                logger.warning(
                    "skipping unparseable document during reindex",
                    extra={"file": pdf_path.name, "error": str(exc)},
                )

        return documents

    def list_documents(self) -> list[Document]:
        return self.db.query(Document).order_by(Document.ingested_at.desc()).all()

    def get_document(self, document_id: str) -> Document | None:
        return self.db.get(Document, document_id)

    def get_chunks(self, document_id: str) -> list[dict]:
        """Chunks for documents ingested before document_id-tagging existed
        (or re-tagged docs pending a reindex) simply return empty - matches
        the existing expectation that a chunking-config change requires a
        reindex to take effect everywhere."""
        return sorted(
            self.vector_store.scroll_by_document_id(document_id),
            key=lambda chunk: chunk.get("page", 0),
        )

    def _refresh_gauges(self) -> None:
        ACTIVE_DOCUMENTS.set(self.db.query(Document).count())

        try:
            info = self.vector_store.client.get_collection(self.vector_store.collection_name)
            VECTOR_STORE_SIZE.set(info.points_count or 0)
        except Exception:
            pass
