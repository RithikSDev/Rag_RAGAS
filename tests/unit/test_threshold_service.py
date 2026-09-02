import pytest
from pydantic import ValidationError

from app.db import Base, build_engine, build_session_factory
from app.schemas import ThresholdsUpdate
from app.services.threshold_service import DEFAULT_GOOD, DEFAULT_WARNING, KNOWN_METRICS, ThresholdService


@pytest.fixture
def db_session(tmp_path):
    engine = build_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    session_factory = build_session_factory(engine)

    with session_factory() as db:
        yield db


def test_seed_defaults_creates_all_known_metrics(db_session):
    service = ThresholdService(db_session)
    service.seed_defaults()

    thresholds = service.get_all()

    assert set(thresholds) == set(KNOWN_METRICS)
    for entry in thresholds.values():
        assert entry == {"good": DEFAULT_GOOD, "warning": DEFAULT_WARNING}


def test_seed_defaults_is_idempotent(db_session):
    service = ThresholdService(db_session)
    service.seed_defaults()
    service.update({"faithfulness": {"good": 0.95, "warning": 0.6}}, updated_by="admin")

    service.seed_defaults()  # must not overwrite the customized value

    assert service.get_all()["faithfulness"] == {"good": 0.95, "warning": 0.6}


def test_update_persists_new_values(db_session):
    service = ThresholdService(db_session)
    service.seed_defaults()

    result = service.update({"context_recall": {"good": 0.9, "warning": 0.4}}, updated_by="admin")

    assert result["context_recall"] == {"good": 0.9, "warning": 0.4}
    assert service.get_all()["context_recall"] == {"good": 0.9, "warning": 0.4}


def test_classify_uses_persisted_thresholds(db_session):
    service = ThresholdService(db_session)
    service.seed_defaults()
    service.update({"faithfulness": {"good": 0.9, "warning": 0.6}}, updated_by="admin")

    assert service.classify("faithfulness", 0.95) == "good"
    assert service.classify("faithfulness", 0.7) == "warning"
    assert service.classify("faithfulness", 0.5) == "critical"


def test_classify_falls_back_to_defaults_for_unseeded_metric(db_session):
    service = ThresholdService(db_session)

    assert service.classify("faithfulness", 0.85) == "good"
    assert service.classify("faithfulness", 0.6) == "warning"
    assert service.classify("faithfulness", 0.3) == "critical"


@pytest.mark.parametrize(
    "entry",
    [
        {"good": 0.5, "warning": 0.5},  # good must be strictly greater than warning
        {"good": 0.4, "warning": 0.6},
        {"good": 1.5, "warning": 0.5},
        {"good": 0.8, "warning": -0.1},
    ],
)
def test_thresholds_update_schema_rejects_invalid_entries(entry):
    with pytest.raises(ValidationError):
        ThresholdsUpdate(thresholds={"faithfulness": entry})


def test_thresholds_update_schema_rejects_unknown_metric():
    with pytest.raises(ValidationError):
        ThresholdsUpdate(thresholds={"not_a_real_metric": {"good": 0.8, "warning": 0.5}})


def test_thresholds_update_schema_accepts_valid_payload():
    update = ThresholdsUpdate(thresholds={"faithfulness": {"good": 0.9, "warning": 0.6}})
    assert update.thresholds["faithfulness"].good == 0.9
