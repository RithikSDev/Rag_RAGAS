from app.rag_pipeline import RAGPipeline
from tests.fakes.fake_generator import FakeGenerator


class StubRetriever:
    def __init__(self, contexts):
        self.contexts = contexts
        self.calls = []

    def search(self, query, top_k=5):
        self.calls.append((query, top_k))
        return self.contexts[:top_k]


def test_run_uses_instance_top_k_by_default():
    retriever = StubRetriever([{"text": f"chunk {i}"} for i in range(10)])
    generator = FakeGenerator()
    pipeline = RAGPipeline(retriever, generator, top_k=3)

    result = pipeline.run("question?")

    assert retriever.calls == [("question?", 3)]
    assert len(result["contexts"]) == 3
    assert result["answer"] == "Fake answer to: question?"
    assert result["question"] == "question?"


def test_run_override_top_k_takes_precedence():
    retriever = StubRetriever([{"text": f"chunk {i}"} for i in range(10)])
    pipeline = RAGPipeline(retriever, FakeGenerator(), top_k=3)

    pipeline.run("question?", top_k=7)

    assert retriever.calls == [("question?", 7)]


def test_top_k_mutation_takes_effect_on_next_call():
    retriever = StubRetriever([{"text": f"chunk {i}"} for i in range(10)])
    pipeline = RAGPipeline(retriever, FakeGenerator(), top_k=3)

    pipeline.top_k = 5
    pipeline.run("question?")

    assert retriever.calls == [("question?", 5)]


def test_generator_receives_retrieved_contexts():
    contexts = [{"text": "only chunk"}]
    generator = FakeGenerator()
    pipeline = RAGPipeline(StubRetriever(contexts), generator, top_k=1)

    pipeline.run("question?")

    assert generator.calls == [("question?", contexts)]
