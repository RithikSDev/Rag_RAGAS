from sqlalchemy.orm import Session

from app.db_models import MetricThreshold

KNOWN_METRICS = (
    "faithfulness",
    "answer_relevancy",
    "context_precision",
    "context_recall",
    "context_relevance",
    "answer_correctness",
)

DEFAULT_GOOD = 0.8
DEFAULT_WARNING = 0.5


class ThresholdService:
    def __init__(self, db: Session):
        self.db = db

    def seed_defaults(self) -> None:
        for metric in KNOWN_METRICS:
            if self.db.get(MetricThreshold, metric) is None:
                self.db.add(MetricThreshold(metric=metric, good=DEFAULT_GOOD, warning=DEFAULT_WARNING))
        self.db.commit()

    def get_all(self) -> dict[str, dict]:
        rows = self.db.query(MetricThreshold).all()
        return {row.metric: {"good": row.good, "warning": row.warning} for row in rows}

    def update(self, updates: dict[str, dict], updated_by: str) -> dict[str, dict]:
        for metric, values in updates.items():
            row = self.db.get(MetricThreshold, metric)

            if row is None:
                row = MetricThreshold(metric=metric)
                self.db.add(row)

            row.good = values["good"]
            row.warning = values["warning"]
            row.updated_by = updated_by

        self.db.commit()

        return self.get_all()

    def classify(self, metric: str, value: float) -> str:
        row = self.db.get(MetricThreshold, metric)
        good = row.good if row else DEFAULT_GOOD
        warning = row.warning if row else DEFAULT_WARNING

        if value >= good:
            return "good"
        if value >= warning:
            return "warning"
        return "critical"
