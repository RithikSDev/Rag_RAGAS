import pytest

from app.db import Base, build_engine, build_session_factory
from app.services.dataset_service import DatasetService, parse_import_rows


@pytest.fixture
def db_session(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as db:
        yield db


SEED = [
    {"user_input": "Q1?", "reference": "A1"},
    {"user_input": "Q2?", "reference": "A2"},
]


def test_seed_defaults_populates_empty_dataset(db_session):
    service = DatasetService(db_session)
    service.seed_defaults(SEED)

    questions = service.list_all()
    assert [q.user_input for q in questions] == ["Q1?", "Q2?"]
    assert all(q.source == "seed" for q in questions)


def test_seed_defaults_is_a_noop_when_dataset_already_has_rows(db_session):
    service = DatasetService(db_session)
    service.create("Existing?", "Existing answer", created_by="user")

    service.seed_defaults(SEED)

    assert len(service.list_all()) == 1


def test_create_update_delete_roundtrip(db_session):
    service = DatasetService(db_session)

    created = service.create("Original?", "Original answer", created_by="admin")
    assert created.source == "manual"

    updated = service.update(created.id, "Edited?", None)
    assert updated.user_input == "Edited?"
    assert updated.reference == "Original answer"  # untouched

    assert service.delete(created.id) is True
    assert service.get(created.id) is None


def test_update_nonexistent_returns_none(db_session):
    assert DatasetService(db_session).update("does-not-exist", "x", "y") is None


def test_delete_nonexistent_returns_false(db_session):
    assert DatasetService(db_session).delete("does-not-exist") is False


def test_bulk_import_creates_questions_with_upload_source(db_session):
    service = DatasetService(db_session)

    created = service.bulk_import(SEED, created_by="admin")

    assert len(created) == 2
    assert all(q.source == "upload" for q in created)


def test_bulk_import_caps_at_max_rows(db_session):
    service = DatasetService(db_session)
    rows = [{"user_input": f"Q{i}", "reference": f"A{i}"} for i in range(1500)]

    created = service.bulk_import(rows, created_by="admin")

    assert len(created) == 1000


def test_as_pipeline_input_shape(db_session):
    service = DatasetService(db_session)
    service.seed_defaults(SEED)

    assert service.as_pipeline_input() == SEED


def test_parse_import_rows_json_list():
    content = b'[{"user_input": "Q1?", "reference": "A1"}]'
    assert parse_import_rows("questions.json", content) == [{"user_input": "Q1?", "reference": "A1"}]


def test_parse_import_rows_json_wrapped_object():
    content = b'{"questions": [{"user_input": "Q1?", "reference": "A1"}]}'
    assert parse_import_rows("questions.json", content) == [{"user_input": "Q1?", "reference": "A1"}]


def test_parse_import_rows_csv():
    content = b"user_input,reference\nQ1?,A1\nQ2?,A2\n"
    assert parse_import_rows("questions.csv", content) == [
        {"user_input": "Q1?", "reference": "A1"},
        {"user_input": "Q2?", "reference": "A2"},
    ]


def test_parse_import_rows_skips_incomplete_rows():
    content = b'[{"user_input": "Q1?", "reference": "A1"}, {"user_input": "  "}]'
    assert parse_import_rows("questions.json", content) == [{"user_input": "Q1?", "reference": "A1"}]


def test_parse_import_rows_rejects_unknown_extension():
    with pytest.raises(ValueError):
        parse_import_rows("questions.txt", b"whatever")
