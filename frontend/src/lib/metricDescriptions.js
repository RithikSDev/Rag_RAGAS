// Plain-language explanation of how each RAGAS metric is calculated, shown as
// a hover tooltip anywhere a metric score is displayed (Overview, Evaluation).
export const METRIC_DESCRIPTIONS = {
  faithfulness:
    'The judge LLM breaks the answer into individual factual claims, then checks each one against the retrieved chunks. Score = claims supported by context ÷ total claims. Low score = the answer says things the context does not back up.',
  answer_relevancy:
    "The judge LLM generates several hypothetical questions the answer would be answering, embeds them, and compares their similarity to the actual question asked. Doesn't check factual accuracy — only whether the answer is on-topic and complete.",
  context_precision:
    'For each retrieved chunk, the judge LLM decides (using the reference answer) whether it is relevant, then scores how well relevant chunks are ranked near the top vs. buried or displaced by irrelevant ones.',
  context_recall:
    'The reference answer is split into claims; the judge LLM checks whether each one is backed by something in the retrieved chunks. Score = reference claims covered ÷ total. Low score = retrieval missed information needed for the correct answer.',
  context_relevance:
    'The judge LLM rates directly (no reference needed) what fraction of the retrieved chunks are actually pertinent to the question — a raw signal-to-noise measure on retrieval.',
  answer_correctness:
    "Blends two sub-scores: factual overlap/contradiction between the answer and the reference (via the judge LLM), and embedding similarity between the two texts. Weighted average of both.",
}
