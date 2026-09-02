import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import (
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
    Distance,
)


class VectorStore:

    def __init__(
        self,
        collection_name="documents",
        vector_size=384,
        path: str | None = None,
    ):

        self.client = QdrantClient(path=path) if path else QdrantClient(":memory:")

        self.collection_name = collection_name
        self.vector_size = vector_size

        self._ensure_collection()

    def _ensure_collection(self) -> None:
        if not self.client.collection_exists(self.collection_name):
            self._create_collection()

    def _create_collection(self) -> None:
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(
                size=self.vector_size,
                distance=Distance.COSINE,
            ),
        )

    def reset(self) -> None:
        self.client.delete_collection(self.collection_name)
        self._create_collection()

    def add_documents(self, chunks, vectors):

        points = []

        for chunk, vector in zip(chunks, vectors):

            points.append(
                PointStruct(
                    id=str(uuid.uuid4()),
                    vector=vector.tolist(),
                    payload=chunk,
                )
            )

        self.client.upsert(
            collection_name=self.collection_name,
            points=points,
        )

    def scroll_all(self) -> list[dict]:
        """Enumerates every point's id + payload. Used to build the BM25 index -
        fine at this corpus scale; would need a persistent index for a large one."""

        records = []
        offset = None

        while True:
            batch, offset = self.client.scroll(
                collection_name=self.collection_name,
                limit=256,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )

            records.extend({"id": record.id, **record.payload} for record in batch)

            if offset is None:
                break

        return records

    def scroll_by_document_id(self, document_id: str) -> list[dict]:
        records = []
        offset = None
        scroll_filter = Filter(
            must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
        )

        while True:
            batch, offset = self.client.scroll(
                collection_name=self.collection_name,
                scroll_filter=scroll_filter,
                limit=256,
                offset=offset,
                with_payload=True,
                with_vectors=False,
            )

            records.extend({"id": record.id, **record.payload} for record in batch)

            if offset is None:
                break

        return records
