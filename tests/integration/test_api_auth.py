def test_health_requires_no_auth(client):
    response = client.get("/health")
    assert response.status_code == 200


def test_protected_route_without_key_is_401(client):
    response = client.get("/documents")
    assert response.status_code == 401


def test_protected_route_with_unknown_key_is_401(client):
    response = client.get("/documents", headers={"X-API-Key": "not-a-real-key"})
    assert response.status_code == 401


def test_viewer_can_read_but_not_write(client, viewer_headers):
    read_response = client.get("/documents", headers=viewer_headers)
    write_response = client.post("/settings", json={"top_k": 3}, headers=viewer_headers)

    assert read_response.status_code == 200
    assert write_response.status_code == 403


def test_admin_can_read_and_write(client, admin_headers):
    read_response = client.get("/documents", headers=admin_headers)
    write_response = client.post("/settings", json={"top_k": 3}, headers=admin_headers)

    assert read_response.status_code == 200
    assert write_response.status_code == 200


def test_revoked_key_is_rejected(client, admin_headers):
    from app.db_models import ApiKey
    from app.security.auth import hash_key

    with client.app.state.app_state.session_factory() as db:
        row = db.query(ApiKey).filter(ApiKey.key_hash == hash_key("test-viewer-key")).one()
        row.revoked_at = row.created_at
        db.commit()

    response = client.get("/documents", headers={"X-API-Key": "test-viewer-key"})
    assert response.status_code == 401
