import pytest
from pydantic import ValidationError

from app.config import PipelineConfig
from app.schemas import SettingsUpdate, validate_settings_merge


def test_pipeline_config_defaults():
    config = PipelineConfig()

    assert config.chunk_size == 500
    assert config.chunk_overlap == 50
    assert config.chunking_strategy == "fixed"
    assert config.top_k == 5


def test_pipeline_config_update_mutates_in_place():
    config = PipelineConfig()
    config.update(chunk_size=800, top_k=None)

    assert config.chunk_size == 800
    assert config.top_k == 5  # None values are ignored, not applied


def test_pipeline_config_to_dict_roundtrip():
    config = PipelineConfig(chunk_size=300)
    data = config.to_dict()

    assert data["chunk_size"] == 300
    assert set(data) == {
        "chunk_size",
        "chunk_overlap",
        "chunking_strategy",
        "semantic_threshold",
        "top_k",
    }


@pytest.mark.parametrize(
    "field,value",
    [
        ("chunking_strategy", "not-a-real-strategy"),
        ("chunk_size", 10),
        ("chunk_overlap", -5),
        ("semantic_threshold", 1.5),
        ("top_k", 0),
        ("top_k", 21),
    ],
)
def test_settings_update_rejects_invalid_values(field, value):
    with pytest.raises(ValidationError):
        SettingsUpdate(**{field: value})


def test_settings_update_allows_partial_payload():
    update = SettingsUpdate(top_k=10)

    assert update.top_k == 10
    assert update.chunk_size is None


def test_validate_settings_merge_rejects_overlap_ge_chunk_size():
    with pytest.raises(ValueError):
        validate_settings_merge({"chunk_size": 100, "chunk_overlap": 100})


def test_validate_settings_merge_accepts_valid_merge():
    validate_settings_merge({"chunk_size": 500, "chunk_overlap": 50})
