def test_list_dataset_returns_seeded_defaults(client, viewer_headers):
    response = client.get("/dataset", headers=viewer_headers)

    assert response.status_code == 200
    questions = response.json()["questions"]
    assert len(questions) == 5  # the seeded fixed 5-question default set
    assert all(q["source"] == "seed" for q in questions)


def test_create_question_requires_admin(client, viewer_headers):
    response = client.post(
        "/dataset", json={"user_input": "New?", "reference": "Answer"}, headers=viewer_headers
    )
    assert response.status_code == 403


def test_create_question(client, admin_headers):
    response = client.post(
        "/dataset", json={"user_input": "New question?", "reference": "New answer"}, headers=admin_headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user_input"] == "New question?"
    assert body["source"] == "manual"
    assert body["created_by"] == "admin (env-seeded)"


def test_create_question_rejects_empty_fields(client, admin_headers):
    response = client.post("/dataset", json={"user_input": "  ", "reference": "x"}, headers=admin_headers)
    assert response.status_code == 422


def test_update_question(client, admin_headers):
    created = client.post(
        "/dataset", json={"user_input": "Old?", "reference": "Old answer"}, headers=admin_headers
    ).json()

    response = client.put(f"/dataset/{created['id']}", json={"user_input": "New?"}, headers=admin_headers)

    assert response.status_code == 200
    assert response.json()["user_input"] == "New?"
    assert response.json()["reference"] == "Old answer"


def test_update_nonexistent_question_is_404(client, admin_headers):
    response = client.put("/dataset/does-not-exist", json={"user_input": "x"}, headers=admin_headers)
    assert response.status_code == 404


def test_delete_question(client, admin_headers):
    created = client.post(
        "/dataset", json={"user_input": "Temp?", "reference": "Temp answer"}, headers=admin_headers
    ).json()

    response = client.delete(f"/dataset/{created['id']}", headers=admin_headers)
    assert response.status_code == 200

    remaining_ids = [q["id"] for q in client.get("/dataset", headers=admin_headers).json()["questions"]]
    assert created["id"] not in remaining_ids


def test_delete_nonexistent_question_is_404(client, admin_headers):
    response = client.delete("/dataset/does-not-exist", headers=admin_headers)
    assert response.status_code == 404


def test_import_json_file(client, admin_headers):
    content = b'[{"user_input": "Imported?", "reference": "Imported answer"}]'

    response = client.post(
        "/dataset/import",
        headers=admin_headers,
        files={"file": ("questions.json", content, "application/json")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["imported"] == 1
    assert body["questions"][0]["source"] == "upload"


def test_import_csv_file(client, admin_headers):
    content = b"user_input,reference\nImported CSV?,CSV answer\n"

    response = client.post(
        "/dataset/import",
        headers=admin_headers,
        files={"file": ("questions.csv", content, "text/csv")},
    )

    assert response.status_code == 200
    assert response.json()["imported"] == 1


def test_import_rejects_bad_extension(client, admin_headers):
    response = client.post(
        "/dataset/import",
        headers=admin_headers,
        files={"file": ("questions.txt", b"not valid", "text/plain")},
    )
    assert response.status_code == 400


def test_import_rejects_malformed_json(client, admin_headers):
    response = client.post(
        "/dataset/import",
        headers=admin_headers,
        files={"file": ("questions.json", b"{not valid json", "application/json")},
    )
    assert response.status_code == 400


def test_import_with_no_valid_rows_is_400(client, admin_headers):
    response = client.post(
        "/dataset/import",
        headers=admin_headers,
        files={"file": ("questions.json", b"[]", "application/json")},
    )
    assert response.status_code == 400


def test_import_requires_admin(client, viewer_headers):
    response = client.post(
        "/dataset/import",
        headers=viewer_headers,
        files={"file": ("questions.json", b"[]", "application/json")},
    )
    assert response.status_code == 403
