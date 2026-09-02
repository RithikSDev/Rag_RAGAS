def test_metrics_summary_requires_auth(client):
    response = client.get("/metrics/summary")
    assert response.status_code == 401


def test_metrics_summary_on_fresh_state(client, viewer_headers):
    response = client.get("/metrics/summary", headers=viewer_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["documents"] == 0
    assert body["chunks"] == 0
    assert body["eval_questions"] == 5  # seeded default dataset
    assert body["avg_retrieval_ms"] is None
    assert body["avg_generation_ms"] is None


def test_metrics_summary_reflects_documents_and_latency(client, admin_headers, valid_pdf_bytes):
    client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("handbook.pdf", valid_pdf_bytes, "application/pdf")},
    )
    client.post("/ask", json={"question": "How many leave days?"}, headers=admin_headers)

    response = client.get("/metrics/summary", headers=admin_headers)
    body = response.json()

    assert body["documents"] == 1
    assert body["chunks"] >= 1
    assert body["avg_retrieval_ms"] is not None
    assert body["avg_generation_ms"] is not None
