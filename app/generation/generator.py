import os

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

SYSTEM_PROMPT = """
You are a document question-answering assistant.

Answer the question using only the provided context.

If the answer cannot be found in the context,
say that the information is not available.
"""


class Generator:

    def __init__(self, model: str = None):
        self.client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY") or None)
        self.model = model or os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5")

    def generate(self, question, contexts):

        context_text = "\n\n".join(
            item["text"]
            for item in contexts
        )

        prompt = f"""Context:

{context_text}

Question:

{question}

Answer using only the context.
"""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": prompt},
            ],
        )

        return next(
            block.text
            for block in response.content
            if block.type == "text"
        )
