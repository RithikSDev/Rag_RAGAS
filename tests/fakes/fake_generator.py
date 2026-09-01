class FakeGenerator:
    """Canned answer, no Anthropic call."""

    def __init__(self, model: str = None):
        self.model = model or "fake-model"
        self.calls = []

    def generate(self, question, contexts):
        self.calls.append((question, contexts))
        return f"Fake answer to: {question}"
