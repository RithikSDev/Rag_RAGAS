def test_health_ok_when_dependencies_are_up(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_returns_503_when_vector_store_unreachable(client):
    # Realistic failure mode: the vector store check inside health()'s own
    # try/except fails after the DB dependency has already resolved fine.
    client.app.state.app_state.vector_store.client.close()

    response = client.get("/health")

    assert response.status_code == 503


def test_metrics_requires_auth(client):
    response = client.get("/metrics")
    assert response.status_code == 401


def test_metrics_returns_prometheus_text(client, viewer_headers):
    client.post("/ask", json={"question": "warm up a metric"}, headers=viewer_headers)

    response = client.get("/metrics", headers=viewer_headers)

    assert response.status_code == 200
    assert "rag_query_total" in response.text
