from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import PipelineConfig
from app.db_models import EvaluationResult, EvaluationRun
from app.observability.metrics import EVALUATION_RUNS
from app.rag_pipeline import RAGPipeline
from evaluation.run_evaluation import run_evaluation


class EvaluationService:
    def __init__(self, db: Session, pipeline: RAGPipeline, config: PipelineConfig):
        self.db = db
        self.pipeline = pipeline
        self.config = config

    def run_and_record(self, caller: str, metrics_factory=None) -> dict:
        started = datetime.now(timezone.utc)

        output = run_evaluation(self.pipeline, self.config, metrics_factory=metrics_factory)

        run = EvaluationRun(
            started_at=started,
            completed_at=datetime.now(timezone.utc),
            config_snapshot=output.get("config", {}),
            metrics_summary=output["average"],
            triggered_by=caller,
        )
        self.db.add(run)
        self.db.flush()

        for result in output["results"]:
            self.db.add(
                EvaluationResult(
                    run_id=run.id,
                    user_input=result["user_input"],
                    response=result["response"],
                    reference=result["reference"],
                    retrieved_contexts=result["retrieved_contexts"],
                    scores=result["scores"],
                )
            )

        self.db.commit()
        EVALUATION_RUNS.inc()

        return self._shape_run(run)

    def latest(self) -> dict | None:
        run = (
            self.db.query(EvaluationRun)
            .order_by(EvaluationRun.started_at.desc())
            .first()
        )
        return self._shape_run(run) if run else None

    def list_runs(self) -> list[dict]:
        runs = (
            self.db.query(EvaluationRun)
            .order_by(EvaluationRun.started_at.desc())
            .all()
        )
        return [
            {
                "id": run.id,
                "started_at": run.started_at,
                "completed_at": run.completed_at,
                "average": run.metrics_summary,
                "config": run.config_snapshot,
                "triggered_by": run.triggered_by,
            }
            for run in runs
        ]

    def _shape_run(self, run: EvaluationRun) -> dict:
        return {
            "id": run.id,
            "metrics": list(run.metrics_summary.keys()),
            "average": run.metrics_summary,
            "config": run.config_snapshot,
            "results": [
                {
                    "user_input": result.user_input,
                    "response": result.response,
                    "reference": result.reference,
                    "retrieved_contexts": result.retrieved_contexts,
                    "scores": result.scores,
                }
                for result in run.results
            ],
        }
