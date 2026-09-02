import asyncio
import logging
from datetime import datetime, timezone
from typing import Callable

from sqlalchemy.orm import Session

from app.config import PipelineConfig
from app.db_models import EvaluationResult, EvaluationRun
from app.observability.metrics import EVALUATION_RUNS
from app.rag_pipeline import RAGPipeline
from app.services.dataset_service import DatasetService
from evaluation.metrics import build_metrics
from evaluation.run_evaluation import METRIC_INPUTS

logger = logging.getLogger("app.evaluation_service")


class EvaluationService:
    def __init__(
        self,
        db: Session,
        pipeline: RAGPipeline,
        config: PipelineConfig,
        dataset_service: DatasetService,
        session_factory: Callable[[], Session],
        running_tasks: set,
    ):
        self.db = db
        self.pipeline = pipeline
        self.config = config
        self.dataset_service = dataset_service
        self.session_factory = session_factory
        self.running_tasks = running_tasks

    def start_run(self, caller: str, metrics_factory=None) -> str:
        """Creates the run row and schedules scoring as a background task,
        returning immediately - the caller polls progress()/get_run() rather
        than blocking on the (potentially long) evaluation."""

        run = EvaluationRun(
            config_snapshot=self.config.to_dict(),
            triggered_by=caller,
            status="running",
        )
        self.db.add(run)
        self.db.commit()
        self.db.refresh(run)

        task = asyncio.create_task(self._execute(run.id, metrics_factory))
        self.running_tasks.add(task)
        task.add_done_callback(self.running_tasks.discard)

        return run.id

    async def _execute(self, run_id: str, metrics_factory=None) -> None:
        # A background task outlives the request that spawned it, so it needs
        # its own DB session - the request-scoped `self.db` is closed as soon
        # as start_run()'s response goes out.
        db = self.session_factory()

        try:
            run = db.get(EvaluationRun, run_id)
            questions = DatasetService(db).as_pipeline_input()

            run.total_questions = len(questions)
            db.commit()

            if not questions:
                run.status = "failed"
                run.error_message = "no evaluation questions in the dataset"
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                return

            metrics = (metrics_factory or build_metrics)()
            per_metric_values: dict[str, list[float]] = {name: [] for name in METRIC_INPUTS}

            for item in questions:
                run.current_question = item["user_input"]
                db.commit()

                result = await asyncio.to_thread(self.pipeline.run, item["user_input"])

                sample = {
                    "user_input": item["user_input"],
                    "response": result["answer"],
                    "retrieved_contexts": [context["text"] for context in result["contexts"]],
                    "reference": item["reference"],
                }

                scores = {}
                for name, metric in metrics.items():
                    inputs = {key: sample[key] for key in METRIC_INPUTS[name]}
                    score_result = await metric.ascore(**inputs)
                    scores[name] = {"value": score_result.value, "reason": score_result.reason}
                    per_metric_values[name].append(score_result.value)

                db.add(
                    EvaluationResult(
                        run_id=run_id,
                        user_input=sample["user_input"],
                        response=sample["response"],
                        reference=sample["reference"],
                        retrieved_contexts=sample["retrieved_contexts"],
                        scores=scores,
                    )
                )

                run.completed_questions += 1
                db.commit()

                logger.info("scored eval sample", extra={"run_id": run_id, "question": item["user_input"]})

            run.metrics_summary = {
                name: sum(values) / len(values) for name, values in per_metric_values.items()
            }
            run.status = "completed"
            run.current_question = None
            run.completed_at = datetime.now(timezone.utc)
            db.commit()

            EVALUATION_RUNS.inc()

        except Exception as exc:
            db.rollback()
            run = db.get(EvaluationRun, run_id)
            if run is not None:
                run.status = "failed"
                run.error_message = str(exc)
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
            logger.exception("evaluation run failed", extra={"run_id": run_id})
        finally:
            db.close()

    def progress(self, run_id: str) -> dict | None:
        run = self.db.get(EvaluationRun, run_id)

        if run is None:
            return None

        return {
            "run_id": run.id,
            "status": run.status,
            "total_questions": run.total_questions,
            "completed_questions": run.completed_questions,
            "current_question": run.current_question,
            "error_message": run.error_message,
        }

    def get_run(self, run_id: str) -> dict | None:
        run = self.db.get(EvaluationRun, run_id)
        return self._shape_run(run) if run else None

    def set_label(self, run_id: str, label: str | None, notes: str | None) -> dict | None:
        run = self.db.get(EvaluationRun, run_id)

        if run is None:
            return None

        if label is not None:
            run.label = label
        if notes is not None:
            run.notes = notes

        self.db.commit()

        return self._shape_run(run)

    def latest(self) -> dict | None:
        run = (
            self.db.query(EvaluationRun)
            .filter(EvaluationRun.status == "completed")
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
                "status": run.status,
                "label": run.label,
                "started_at": run.started_at,
                "completed_at": run.completed_at,
                "average": run.metrics_summary,
                "config": run.config_snapshot,
                "triggered_by": run.triggered_by,
                "total_questions": run.total_questions,
                "completed_questions": run.completed_questions,
            }
            for run in runs
        ]

    def _shape_run(self, run: EvaluationRun) -> dict:
        return {
            "id": run.id,
            "status": run.status,
            "label": run.label,
            "notes": run.notes,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
            "triggered_by": run.triggered_by,
            "metrics": list(run.metrics_summary.keys()) if run.metrics_summary else [],
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
