import os
import sys
import types

# ragas 0.4.3 unconditionally imports langchain_community.chat_models.vertexai,
# a submodule langchain-community 0.4.x removed when it split VertexAI out into
# its own package. We never use VertexAI, so stub the import instead of pinning
# an older, less compatible langchain-community.
_vertexai_shim = types.ModuleType("langchain_community.chat_models.vertexai")
_vertexai_shim.ChatVertexAI = type("ChatVertexAI", (), {})
sys.modules.setdefault("langchain_community.chat_models.vertexai", _vertexai_shim)

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from ragas.embeddings import HuggingFaceEmbeddings
from ragas.llms import llm_factory
from ragas.metrics.collections import (
    AnswerRelevancy,
    ContextPrecision,
    ContextRecall,
    Faithfulness,
)

load_dotenv()


def build_metrics(model: str = None):

    llm = llm_factory(
        model or os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5"),
        provider="anthropic",
        client=AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY") or None),
    )

    # ragas defaults temperature/top_p onto every instructor LLM, but the
    # current anthropic SDK dropped both as accepted create() kwargs - strip
    # them or every judge call fails with a TypeError before it's sent.
    llm.model_args.pop("temperature", None)
    llm.model_args.pop("top_p", None)

    embeddings = HuggingFaceEmbeddings(model="BAAI/bge-small-en-v1.5")

    return {
        "faithfulness": Faithfulness(llm=llm),
        "answer_relevancy": AnswerRelevancy(llm=llm, embeddings=embeddings),
        "context_precision": ContextPrecision(llm=llm),
        "context_recall": ContextRecall(llm=llm),
    }
