import json
import logging
from pathlib import Path

from evaluation.metrics import build_metrics

DATASET_PATH = Path("results/evaluation_dataset.json")

METRIC_INPUTS = {
    "faithfulness": ["user_input", "response", "retrieved_contexts"],
    "answer_relevancy": ["user_input", "response"],
    "context_precision": ["user_input", "reference", "retrieved_contexts"],
    "context_recall": ["user_input", "retrieved_contexts", "reference"],
    "context_relevance": ["user_input", "retrieved_contexts"],
    "answer_correctness": ["user_input", "response", "reference"],
}

logger = logging.getLogger("app.evaluation")


def score_sample(sample: dict, metrics: dict) -> dict:

    scores = {}

    for name, metric in metrics.items():
        inputs = {key: sample[key] for key in METRIC_INPUTS[name]}
        result = metric.score(**inputs)

        scores[name] = {
            "value": result.value,
            "reason": result.reason,
        }

    return scores


def run_evaluation(pipeline=None, config=None, metrics_factory=None, questions=None) -> dict:
    """Pure function: scores an eval dataset with RAGAS and returns the result
    dict. No file I/O - the caller (EvaluationService) is responsible for
    persisting the output. If `pipeline` is given, the dataset is regenerated
    live against it (using `questions` if given, else the CLI's hardcoded
    fixture list); otherwise falls back to the flat-file fixture for
    standalone/CLI use."""

    if pipeline is not None:
        from evaluation.create_dataset import build_dataset_from_pipeline

        dataset = build_dataset_from_pipeline(pipeline, questions)
    else:
        dataset = json.loads(DATASET_PATH.read_text())

    metrics = (metrics_factory or build_metrics)()

    results = []

    for sample in dataset:
        scores = score_sample(sample, metrics)

        results.append(
            {
                "user_input": sample["user_input"],
                "response": sample["response"],
                "reference": sample["reference"],
                "retrieved_contexts": sample["retrieved_contexts"],
                "scores": scores,
            }
        )

        logger.info("scored eval sample", extra={"question": sample["user_input"]})

    averages = {
        name: sum(r["scores"][name]["value"] for r in results) / len(results)
        for name in METRIC_INPUTS
    }

    output = {
        "metrics": list(METRIC_INPUTS),
        "average": averages,
        "results": results,
    }

    if config is not None:
        output["config"] = config.to_dict()

    return output


def main():

    output = run_evaluation()

    print(output["average"])


if __name__ == "__main__":
    main()
