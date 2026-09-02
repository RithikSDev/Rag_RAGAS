def _ingest_sample(client, admin_headers, valid_pdf_bytes):
    client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("handbook.pdf", valid_pdf_bytes, "application/pdf")},
    )


def test_retrieval_debug_requires_auth(client):
    response = client.post("/retrieval/debug", json={"query": "leave policy"})
    assert response.status_code == 401


def test_retrieval_debug_viewer_allowed(client, viewer_headers, admin_headers, valid_pdf_bytes):
    _ingest_sample(client, admin_headers, valid_pdf_bytes)

    response = client.post("/retrieval/debug", json={"query": "leave"}, headers=viewer_headers)

    assert response.status_code == 200


def test_retrieval_debug_returns_all_stages(client, admin_headers, valid_pdf_bytes):
    _ingest_sample(client, admin_headers, valid_pdf_bytes)

    response = client.post(
        "/retrieval/debug",
        json={"query": "annual leave", "top_k_initial": 10, "top_k_final": 3},
        headers=admin_headers,
    )

    body = response.json()
    assert response.status_code == 200
    for key in ("vector_results", "bm25_results", "hybrid_results", "reranked_results", "final_context"):
        assert key in body
    assert len(body["final_context"]) <= 3


def test_retrieval_debug_without_reranker_skips_rerank_stage(client, admin_headers, valid_pdf_bytes):
    _ingest_sample(client, admin_headers, valid_pdf_bytes)

    response = client.post(
        "/retrieval/debug",
        json={"query": "annual leave", "use_reranker": False},
        headers=admin_headers,
    )

    assert response.json()["reranked_results"] == []


def test_retrieval_debug_on_empty_corpus_returns_empty_results(client, admin_headers):
    response = client.post("/retrieval/debug", json={"query": "anything"}, headers=admin_headers)

    body = response.json()
    assert response.status_code == 200
    assert body["vector_results"] == []
    assert body["bm25_results"] == []
    assert body["final_context"] == []


def test_retrieval_debug_rejects_empty_query(client, admin_headers):
    response = client.post("/retrieval/debug", json={"query": "   "}, headers=admin_headers)
    assert response.status_code == 422


def test_retrieval_debug_rejects_top_k_final_over_initial(client, admin_headers):
    response = client.post(
        "/retrieval/debug",
        json={"query": "leave", "top_k_initial": 5, "top_k_final": 10},
        headers=admin_headers,
    )
    assert response.status_code == 422


def test_retrieval_debug_rejects_invalid_weight(client, admin_headers):
    response = client.post(
        "/retrieval/debug",
        json={"query": "leave", "vector_weight": 1.5},
        headers=admin_headers,
    )
    assert response.status_code == 422
