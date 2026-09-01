def test_ask_returns_answer_and_contexts(client, viewer_headers):
    response = client.post("/ask", json={"question": "How many leave days?"}, headers=viewer_headers)

    assert response.status_code == 200

    body = response.json()
    assert body["question"] == "How many leave days?"
    assert body["answer"].startswith("Fake answer to:")
    assert isinstance(body["contexts"], list)


def test_ask_logs_query(client, viewer_headers):
    from app.db_models import QueryLog

    client.post("/ask", json={"question": "logged question"}, headers=viewer_headers)

    with client.app.state.app_state.session_factory() as db:
        log = db.query(QueryLog).filter(QueryLog.question == "logged question").one()

    assert log.status_code == 200
    assert log.caller == "viewer (env-seeded)"
    assert log.answer.startswith("Fake answer to:")


def test_ask_admin_also_allowed(client, admin_headers):
    response = client.post("/ask", json={"question": "hi"}, headers=admin_headers)
    assert response.status_code == 200


def test_ask_rejects_missing_question_field(client, viewer_headers):
    response = client.post("/ask", json={}, headers=viewer_headers)
    assert response.status_code == 422
