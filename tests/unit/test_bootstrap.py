import os

from app.bootstrap import build_app_state
from app.settings import Settings


def _settings(tmp_path, **overrides) -> Settings:
    defaults = dict(
        anthropic_api_key="test-key",
        admin_api_key="test-admin-key",
        viewer_api_key="test-viewer-key",
        database_url=f"sqlite:///{tmp_path / 'app.db'}",
        qdrant_path=str(tmp_path / "qdrant"),
        documents_dir=str(tmp_path / "documents"),
    )
    defaults.update(overrides)
    return Settings(**defaults)


def test_pipeline_config_persists_across_rebuilds(tmp_path, monkeypatch):
    import app.bootstrap as bootstrap_module

    from tests.fakes.fake_embedder import FakeEmbedder
    from tests.fakes.fake_generator import FakeGenerator

    monkeypatch.setattr(bootstrap_module, "Embedder", FakeEmbedder)
    monkeypatch.setattr(bootstrap_module, "Generator", lambda model=None: FakeGenerator(model))

    settings = _settings(tmp_path)

    first_state = build_app_state(settings)
    assert first_state.pipeline_config.top_k == 5  # default

    with first_state.session_factory() as db:
        from app.db_models import PipelineConfigState

        row = db.get(PipelineConfigState, 1)
        row.top_k = 15
        row.chunk_size = 900
        db.commit()

    first_state.engine.dispose()
    first_state.vector_store.client.close()  # release the qdrant on-disk lock

    # Simulate a real restart: brand new engine/session_factory against the
    # same on-disk DATABASE_URL.
    second_state = build_app_state(settings)

    assert second_state.pipeline_config.top_k == 15
    assert second_state.pipeline_config.chunk_size == 900


def test_bootstrap_skips_ingestion_when_documents_already_exist(tmp_path, monkeypatch):
    import app.bootstrap as bootstrap_module

    from tests.fakes.fake_embedder import FakeEmbedder
    from tests.fakes.fake_generator import FakeGenerator

    monkeypatch.setattr(bootstrap_module, "Embedder", FakeEmbedder)
    monkeypatch.setattr(bootstrap_module, "Generator", lambda model=None: FakeGenerator(model))

    settings = _settings(tmp_path)
    os.makedirs(settings.documents_dir, exist_ok=True)

    first_state = build_app_state(settings)  # empty documents dir, nothing to ingest
    assert first_state.pipeline_config  # sanity: state built fine with zero docs
    first_state.engine.dispose()
    first_state.vector_store.client.close()

    # A document appears on disk with no matching DB row (edge case) - bootstrap
    # only auto-ingests on a genuinely fresh DB (zero Document rows), so this
    # must NOT trigger a silent re-ingest of a file the DB doesn't know about.
    stray_pdf = tmp_path / "documents" / "stray.pdf"

    import pymupdf

    doc = pymupdf.open()
    doc.new_page()
    doc.save(str(stray_pdf))
    doc.close()

    with first_state.session_factory() as db:
        from app.db_models import Document

        db.add(
            Document(
                original_filename="already-known.pdf",
                stored_filename="already-known.pdf",
                sha256="a" * 64,
                file_size_bytes=1,
                chunk_count=1,
                chunking_strategy="fixed",
                chunk_size=500,
                chunk_overlap=50,
                semantic_threshold=0.75,
                ingested_by="test",
            )
        )
        db.commit()

    second_state = build_app_state(settings)

    with second_state.session_factory() as db:
        from app.db_models import Document

        names = [d.original_filename for d in db.query(Document).all()]

    assert names == ["already-known.pdf"]  # stray.pdf was NOT auto-ingested
