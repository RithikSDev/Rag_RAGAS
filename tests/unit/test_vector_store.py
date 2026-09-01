import numpy as np

from app.retrieval.vector_store import VectorStore


def _fake_vectors(n, dim=384):
    return np.array([np.ones(dim) * (i + 1) for i in range(n)])


def test_in_memory_store_add_and_search():
    store = VectorStore()
    chunks = [{"text": "a", "page": 1}, {"text": "b", "page": 2}]

    store.add_documents(chunks, _fake_vectors(2))

    results = store.client.query_points(
        collection_name=store.collection_name,
        query=_fake_vectors(1)[0].tolist(),
        limit=2,
    ).points

    assert len(results) == 2


def test_reset_clears_previous_points():
    store = VectorStore()
    store.add_documents([{"text": "a", "page": 1}], _fake_vectors(1))

    store.reset()

    count = store.client.count(store.collection_name).count
    assert count == 0


def test_persistent_store_survives_reopen(tmp_path):
    path = str(tmp_path / "qdrant")

    store = VectorStore(path=path)
    store.add_documents([{"text": "persisted", "page": 1}], _fake_vectors(1))
    store.client.close()

    reopened = VectorStore(path=path)
    count = reopened.client.count(reopened.collection_name).count

    assert count == 1


def test_add_documents_uses_unique_ids_across_calls():
    store = VectorStore()

    store.add_documents([{"text": "a", "page": 1}], _fake_vectors(1))
    store.add_documents([{"text": "b", "page": 1}], _fake_vectors(1))

    count = store.client.count(store.collection_name).count
    assert count == 2  # would be 1 if point IDs collided
