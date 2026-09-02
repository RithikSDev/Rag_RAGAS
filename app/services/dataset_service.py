import csv
import io
import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.db_models import EvalQuestion

MAX_IMPORT_ROWS = 1000


def parse_import_rows(filename: str, content: bytes) -> list[dict]:
    suffix = Path(filename).suffix.lower()

    if suffix == ".json":
        data = json.loads(content.decode("utf-8"))
        rows = data if isinstance(data, list) else data.get("questions", [])
    elif suffix == ".csv":
        rows = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))
    else:
        raise ValueError("file must be .csv or .json")

    parsed = []

    for row in rows:
        user_input = (row.get("user_input") or "").strip()
        reference = (row.get("reference") or "").strip()

        if user_input and reference:
            parsed.append({"user_input": user_input, "reference": reference})

    return parsed


class DatasetService:
    def __init__(self, db: Session):
        self.db = db

    def seed_defaults(self, questions: list[dict]) -> None:
        if self.db.query(EvalQuestion).count() > 0:
            return

        for item in questions:
            self.db.add(
                EvalQuestion(
                    user_input=item["user_input"],
                    reference=item["reference"],
                    source="seed",
                    created_by="system",
                )
            )

        self.db.commit()

    def list_all(self) -> list[EvalQuestion]:
        return self.db.query(EvalQuestion).order_by(EvalQuestion.created_at.asc()).all()

    def get(self, question_id: str) -> EvalQuestion | None:
        return self.db.get(EvalQuestion, question_id)

    def create(self, user_input: str, reference: str, created_by: str, source: str = "manual") -> EvalQuestion:
        question = EvalQuestion(
            user_input=user_input,
            reference=reference,
            source=source,
            created_by=created_by,
        )
        self.db.add(question)
        self.db.commit()
        self.db.refresh(question)
        return question

    def update(self, question_id: str, user_input: str | None, reference: str | None) -> EvalQuestion | None:
        question = self.get(question_id)

        if question is None:
            return None

        if user_input is not None:
            question.user_input = user_input
        if reference is not None:
            question.reference = reference

        self.db.commit()
        self.db.refresh(question)
        return question

    def delete(self, question_id: str) -> bool:
        question = self.get(question_id)

        if question is None:
            return False

        self.db.delete(question)
        self.db.commit()
        return True

    def bulk_import(self, rows: list[dict], created_by: str) -> list[EvalQuestion]:
        rows = rows[:MAX_IMPORT_ROWS]
        created = []

        for row in rows:
            created.append(self.create(row["user_input"], row["reference"], created_by, source="upload"))

        return created

    def as_pipeline_input(self) -> list[dict]:
        return [{"user_input": q.user_input, "reference": q.reference} for q in self.list_all()]
