import app.services.evaluation_service as evaluation_service_module
from tests.fakes.fake_metrics import fake_metrics_factory


def _stub_ragas(monkeypatch):
    monkeypatch.setattr(evaluation_service_module, "build_metrics", fake_metrics_factory)


def test_evaluate_requires_admin(client, viewer_headers):
    response = client.post("/evaluate", headers=viewer_headers)
    assert response.status_code == 403


def test_evaluate_returns_immediately_with_a_run_id(client, admin_headers, monkeypatch):
    _stub_ragas(monkeypatch)

    response = client.post("/evaluate", headers=admin_headers)

    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "running"
    assert body["run_id"]


def test_progress_reaches_completed_and_persists_results(client, admin_headers, monkeypatch, wait_for_run):
    _stub_ragas(monkeypatch)

    run_id = client.post("/evaluate", headers=admin_headers).json()["run_id"]

    final = wait_for_run(client, admin_headers, run_id)

    assert final["status"] == "completed"
    assert final["total_questions"] == 5  # the seeded fixed 5-question set
    assert final["completed_questions"] == 5

    run = client.get(f"/ragas/runs/{run_id}", headers=admin_headers).json()
    assert run["average"]["faithfulness"] == 1.0
    assert len(run["results"]) == 5
    assert run["config"]["chunking_strategy"] == "fixed"

    from app.db_models import EvaluationResult, EvaluationRun

    with client.app.state.app_state.session_factory() as db:
        runs = db.query(EvaluationRun).all()
        results = db.query(EvaluationResult).all()

    assert len(runs) == 1
    assert len(results) == 5


def test_progress_unknown_run_is_404(client, admin_headers):
    response = client.get("/evaluate/does-not-exist/progress", headers=admin_headers)
    assert response.status_code == 404


def test_run_detail_unknown_run_is_404(client, admin_headers):
    response = client.get("/ragas/runs/does-not-exist", headers=admin_headers)
    assert response.status_code == 404


def test_evaluate_with_empty_dataset_fails_gracefully(client, admin_headers, monkeypatch, wait_for_run):
    _stub_ragas(monkeypatch)

    for question in client.get("/dataset", headers=admin_headers).json()["questions"]:
        client.delete(f"/dataset/{question['id']}", headers=admin_headers)

    run_id = client.post("/evaluate", headers=admin_headers).json()["run_id"]
    final = wait_for_run(client, admin_headers, run_id)

    assert final["status"] == "failed"
    assert "no evaluation questions" in final["error_message"]


def test_ragas_returns_latest_completed_run(client, admin_headers, monkeypatch, wait_for_run):
    _stub_ragas(monkeypatch)

    assert client.get("/ragas", headers=admin_headers).json()["results"] == []

    run_id = client.post("/evaluate", headers=admin_headers).json()["run_id"]
    wait_for_run(client, admin_headers, run_id)

    response = client.get("/ragas", headers=admin_headers)
    assert len(response.json()["results"]) == 5


def test_ragas_runs_lists_history_newest_first(client, admin_headers, monkeypatch, wait_for_run):
    _stub_ragas(monkeypatch)

    first_id = client.post("/evaluate", headers=admin_headers).json()["run_id"]
    wait_for_run(client, admin_headers, first_id)

    second_id = client.post("/evaluate", headers=admin_headers).json()["run_id"]
    wait_for_run(client, admin_headers, second_id)

    response = client.get("/ragas/runs", headers=admin_headers)
    runs = response.json()["runs"]

    assert len(runs) == 2
    assert runs[0]["id"] == second_id
    assert runs[1]["id"] == first_id
    assert all(r["status"] == "completed" for r in runs)


def test_label_run(client, admin_headers, monkeypatch, wait_for_run):
    _stub_ragas(monkeypatch)

    run_id = client.post("/evaluate", headers=admin_headers).json()["run_id"]
    wait_for_run(client, admin_headers, run_id)

    response = client.patch(
        f"/ragas/runs/{run_id}",
        json={"label": "Experiment #1", "notes": "baseline"},
        headers=admin_headers,
    )

    assert response.status_code == 200
    assert response.json()["label"] == "Experiment #1"
    assert response.json()["notes"] == "baseline"

    listed = client.get("/ragas/runs", headers=admin_headers).json()["runs"]
    assert listed[0]["label"] == "Experiment #1"


def test_label_run_requires_admin(client, viewer_headers, admin_headers, monkeypatch, wait_for_run):
    _stub_ragas(monkeypatch)

    run_id = client.post("/evaluate", headers=admin_headers).json()["run_id"]
    wait_for_run(client, admin_headers, run_id)

    response = client.patch(f"/ragas/runs/{run_id}", json={"label": "x"}, headers=viewer_headers)
    assert response.status_code == 403


def test_label_unknown_run_is_404(client, admin_headers):
    response = client.patch("/ragas/runs/does-not-exist", json={"label": "x"}, headers=admin_headers)
    assert response.status_code == 404
