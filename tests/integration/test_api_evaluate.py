import evaluation.run_evaluation as run_evaluation_module
from tests.fakes.fake_metrics import fake_metrics_factory


def _stub_ragas(monkeypatch):
    monkeypatch.setattr(run_evaluation_module, "build_metrics", fake_metrics_factory)


def test_evaluate_requires_admin(client, viewer_headers):
    response = client.post("/evaluate", headers=viewer_headers)
    assert response.status_code == 403


def test_evaluate_persists_run_and_results(client, admin_headers, monkeypatch):
    _stub_ragas(monkeypatch)

    response = client.post("/evaluate", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["average"]["faithfulness"] == 1.0
    assert len(body["results"]) == 5  # the fixed 5-question eval set
    assert body["config"]["chunking_strategy"] == "fixed"

    from app.db_models import EvaluationResult, EvaluationRun

    with client.app.state.app_state.session_factory() as db:
        runs = db.query(EvaluationRun).all()
        results = db.query(EvaluationResult).all()

    assert len(runs) == 1
    assert len(results) == 5


def test_ragas_returns_latest_run(client, admin_headers, monkeypatch):
    _stub_ragas(monkeypatch)

    assert client.get("/ragas", headers=admin_headers).json()["results"] == []

    client.post("/evaluate", headers=admin_headers)

    response = client.get("/ragas", headers=admin_headers)
    assert len(response.json()["results"]) == 5


def test_ragas_runs_lists_history(client, admin_headers, monkeypatch):
    _stub_ragas(monkeypatch)

    client.post("/evaluate", headers=admin_headers)
    client.post("/evaluate", headers=admin_headers)

    response = client.get("/ragas/runs", headers=admin_headers)
    runs = response.json()["runs"]

    assert len(runs) == 2
    assert runs[0]["started_at"] >= runs[1]["started_at"]  # newest first
