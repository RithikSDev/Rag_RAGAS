def test_get_settings_returns_defaults(client, viewer_headers):
    response = client.get("/settings", headers=viewer_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["chunk_size"] == 500
    assert body["chunking_strategy"] == "fixed"
    assert body["top_k"] == 5


def test_update_top_k_does_not_require_reindex(client, admin_headers, valid_pdf_bytes):
    client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("handbook.pdf", valid_pdf_bytes, "application/pdf")},
    )

    response = client.post("/settings", json={"top_k": 8}, headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["config"]["top_k"] == 8
    # the previously-ingested document must still be there, untouched
    assert len(body["documents"]) == 1


def test_update_chunk_size_triggers_reindex(client, admin_headers, valid_pdf_bytes):
    client.post(
        "/documents",
        headers=admin_headers,
        files={"file": ("handbook.pdf", valid_pdf_bytes, "application/pdf")},
    )

    response = client.post("/settings", json={"chunk_size": 100, "chunk_overlap": 10}, headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["config"]["chunk_size"] == 100
    assert len(body["documents"]) == 1  # re-ingested, not lost


def test_invalid_field_value_is_422(client, admin_headers):
    response = client.post("/settings", json={"top_k": 999}, headers=admin_headers)
    assert response.status_code == 422


def test_overlap_greater_than_chunk_size_is_400(client, admin_headers):
    response = client.post(
        "/settings", json={"chunk_size": 100, "chunk_overlap": 200}, headers=admin_headers
    )
    assert response.status_code == 400


def test_settings_write_through_to_db_row(client, admin_headers):
    """/settings must upsert PipelineConfigState, not just the in-memory
    PipelineConfig - that in-memory-only bug (config lost on restart) is
    exactly what this pillar fixed. Cross-restart persistence itself (against
    a real file-backed DB, not the :memory: DB this fixture uses for speed)
    is covered in tests/unit/test_bootstrap.py."""
    from app.db_models import PipelineConfigState

    client.post("/settings", json={"top_k": 12}, headers=admin_headers)

    with client.app.state.app_state.session_factory() as db:
        row = db.get(PipelineConfigState, 1)

    assert row.top_k == 12
