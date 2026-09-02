import os
import time

# Must be set before `api` (or anything importing app.settings) is first
# imported anywhere in the pytest session, since api.py reads settings once
# at module import for logging/CORS setup.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key")
os.environ.setdefault("VIEWER_API_KEY", "test-viewer-key")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient

from app.security.auth import hash_key
from app.security.rate_limit import limiter
from app.settings import get_settings_cached
from tests.fakes.fake_embedder import FakeEmbedder
from tests.fakes.fake_generator import FakeGenerator
from tests.fakes.fake_reranker import FakeReranker


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-anthropic-key")
    monkeypatch.setenv("ADMIN_API_KEY", "test-admin-key")
    monkeypatch.setenv("VIEWER_API_KEY", "test-viewer-key")
    # A real (if temp) file, not :memory: - :memory: forces StaticPool (one
    # shared raw connection for the whole process), which conflicts once a
    # background task (see EvaluationService._execute) opens its own session
    # concurrently with a request-scoped one ("cannot commit - no transaction
    # is active"). A temp file uses normal per-checkout pooled connections,
    # same as production, and avoids that whole class of issue.
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    monkeypatch.setenv("QDRANT_PATH", str(tmp_path / "qdrant"))
    monkeypatch.setenv("DOCUMENTS_DIR", str(tmp_path / "documents"))
    (tmp_path / "documents").mkdir()

    get_settings_cached.cache_clear()

    import app.bootstrap as bootstrap_module

    monkeypatch.setattr(bootstrap_module, "Embedder", FakeEmbedder)
    monkeypatch.setattr(bootstrap_module, "Generator", lambda model=None: FakeGenerator(model))
    monkeypatch.setattr(bootstrap_module, "Reranker", FakeReranker)

    # The rate limiter's storage is a process-wide singleton (module-level in
    # app.security.rate_limit), so without a reset here, quota consumed by one
    # test would carry over and spuriously 429 the next one.
    limiter.reset()

    import api

    with TestClient(api.app) as test_client:
        yield test_client

    get_settings_cached.cache_clear()


@pytest.fixture
def admin_headers():
    return {"X-API-Key": "test-admin-key"}


@pytest.fixture
def viewer_headers():
    return {"X-API-Key": "test-viewer-key"}


@pytest.fixture
def seeded_api_key_hash():
    """Exposed for tests that want to assert on the hashing scheme directly."""
    return hash_key


@pytest.fixture
def wait_for_run():
    """/evaluate now starts a background task and returns immediately - tests
    poll the progress endpoint instead of asserting on a synchronous body.
    Fakes are fast, so this should resolve in well under a second."""

    def _wait(client, headers, run_id, timeout=10.0, interval=0.02):
        deadline = time.monotonic() + timeout

        while time.monotonic() < deadline:
            response = client.get(f"/evaluate/{run_id}/progress", headers=headers)
            body = response.json()

            if body["status"] != "running":
                return body

            time.sleep(interval)

        raise TimeoutError(f"run {run_id} did not complete within {timeout}s")

    return _wait


@pytest.fixture
def valid_pdf_bytes() -> bytes:
    """A genuinely parseable single-page PDF, generated on the fly with the
    same pymupdf the app uses to read uploads - not a hand-crafted fixture
    that could silently drift from what real PDFs look like."""
    import pymupdf

    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Employees receive 20 days of annual leave per year.")
    data = doc.tobytes()
    doc.close()

    return data
