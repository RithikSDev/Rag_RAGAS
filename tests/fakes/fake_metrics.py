from dataclasses import dataclass


@dataclass
class FakeResult:
    value: float
    reason: str | None = None


class FakeMetric:
    def __init__(self, value: float):
        self.value = value

    def score(self, **kwargs):
        return FakeResult(value=self.value)

    async def ascore(self, **kwargs):
        return FakeResult(value=self.value)


def fake_metrics_factory(model: str = None) -> dict:
    """Stands in for evaluation.metrics.build_metrics - no real Anthropic
    LLM-judge calls, deterministic canned scores."""
    return {
        "faithfulness": FakeMetric(1.0),
        "answer_relevancy": FakeMetric(0.8),
        "context_precision": FakeMetric(1.0),
        "context_recall": FakeMetric(0.9),
        "context_relevance": FakeMetric(0.85),
        "answer_correctness": FakeMetric(0.75),
    }
