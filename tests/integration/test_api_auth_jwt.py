def test_login_succeeds_with_seeded_admin_and_returns_a_usable_token(client):
    response = client.post("/auth/login", json={"username": "admin", "password": "test-admin-password123"})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"] == "admin"

    protected = client.get("/documents", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert protected.status_code == 200


def test_login_rejects_wrong_password(client):
    response = client.post("/auth/login", json={"username": "admin", "password": "wrong-password"})
    assert response.status_code == 401


def test_login_rejects_unknown_username(client):
    response = client.post("/auth/login", json={"username": "nobody", "password": "whatever123"})
    assert response.status_code == 401


def test_protected_route_rejects_invalid_bearer_token(client):
    response = client.get("/documents", headers={"Authorization": "Bearer not-a-real-token"})
    assert response.status_code == 401


def test_protected_route_rejects_token_signed_with_a_different_secret(client):
    import jwt

    token = jwt.encode({"sub": "admin", "role": "admin"}, "wrong-secret", algorithm="HS256")
    response = client.get("/documents", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_me_returns_the_logged_in_user(client, admin_jwt_headers):
    response = client.get("/auth/me", headers=admin_jwt_headers)

    assert response.status_code == 200
    assert response.json()["username"] == "admin"
    assert response.json()["role"] == "admin"


def test_me_works_for_api_key_principals_too(client, admin_headers):
    response = client.get("/auth/me", headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["role"] == "admin"


# --- User management (admin only) ------------------------------------------


def test_list_users_requires_admin(client, viewer_headers):
    response = client.get("/auth/users", headers=viewer_headers)
    assert response.status_code == 403


def test_admin_can_list_users(client, admin_jwt_headers):
    response = client.get("/auth/users", headers=admin_jwt_headers)

    assert response.status_code == 200
    usernames = [u["username"] for u in response.json()["users"]]
    assert "admin" in usernames


def test_admin_can_create_a_user(client, admin_jwt_headers):
    response = client.post(
        "/auth/users",
        headers=admin_jwt_headers,
        json={"username": "alice", "password": "password123", "role": "viewer"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["username"] == "alice"
    assert body["role"] == "viewer"
    assert body["created_by"] == "admin"

    login = client.post("/auth/login", json={"username": "alice", "password": "password123"})
    assert login.status_code == 200


def test_create_user_rejects_duplicate_username(client, admin_jwt_headers):
    client.post(
        "/auth/users", headers=admin_jwt_headers, json={"username": "alice", "password": "password123", "role": "viewer"}
    )
    response = client.post(
        "/auth/users", headers=admin_jwt_headers, json={"username": "alice", "password": "password123", "role": "viewer"}
    )

    assert response.status_code == 409


def test_create_user_rejects_short_password(client, admin_jwt_headers):
    response = client.post(
        "/auth/users", headers=admin_jwt_headers, json={"username": "alice", "password": "abc", "role": "viewer"}
    )
    assert response.status_code == 422


def test_create_user_rejects_invalid_role(client, admin_jwt_headers):
    response = client.post(
        "/auth/users",
        headers=admin_jwt_headers,
        json={"username": "alice", "password": "password123", "role": "superuser"},
    )
    assert response.status_code == 422


def test_create_user_requires_admin(client, viewer_headers):
    response = client.post(
        "/auth/users", headers=viewer_headers, json={"username": "alice", "password": "password123", "role": "viewer"}
    )
    assert response.status_code == 403


def test_admin_can_update_a_users_role(client, admin_jwt_headers):
    created = client.post(
        "/auth/users", headers=admin_jwt_headers, json={"username": "alice", "password": "password123", "role": "viewer"}
    ).json()

    response = client.patch(f"/auth/users/{created['id']}", headers=admin_jwt_headers, json={"role": "admin"})

    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_admin_can_deactivate_a_user(client, admin_jwt_headers):
    created = client.post(
        "/auth/users", headers=admin_jwt_headers, json={"username": "alice", "password": "password123", "role": "viewer"}
    ).json()

    response = client.patch(f"/auth/users/{created['id']}", headers=admin_jwt_headers, json={"is_active": False})
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    login = client.post("/auth/login", json={"username": "alice", "password": "password123"})
    assert login.status_code == 401


def test_update_unknown_user_is_404(client, admin_jwt_headers):
    response = client.patch("/auth/users/does-not-exist", headers=admin_jwt_headers, json={"role": "admin"})
    assert response.status_code == 404


def test_cannot_demote_the_last_admin(client, admin_jwt_headers):
    me = client.get("/auth/me", headers=admin_jwt_headers).json()

    response = client.patch(f"/auth/users/{me['id']}", headers=admin_jwt_headers, json={"role": "viewer"})

    assert response.status_code == 409


def test_admin_can_delete_a_user(client, admin_jwt_headers):
    created = client.post(
        "/auth/users", headers=admin_jwt_headers, json={"username": "alice", "password": "password123", "role": "viewer"}
    ).json()

    response = client.delete(f"/auth/users/{created['id']}", headers=admin_jwt_headers)

    assert response.status_code == 200
    assert client.get("/auth/users", headers=admin_jwt_headers).json()["users"]
    assert not any(u["id"] == created["id"] for u in client.get("/auth/users", headers=admin_jwt_headers).json()["users"])


def test_cannot_delete_your_own_account(client, admin_jwt_headers):
    me = client.get("/auth/me", headers=admin_jwt_headers).json()

    response = client.delete(f"/auth/users/{me['id']}", headers=admin_jwt_headers)

    assert response.status_code == 400


def test_delete_unknown_user_is_404(client, admin_jwt_headers):
    response = client.delete("/auth/users/does-not-exist", headers=admin_jwt_headers)
    assert response.status_code == 404


def test_delete_requires_admin(client, viewer_headers):
    response = client.delete("/auth/users/whatever", headers=viewer_headers)
    assert response.status_code == 403
