# TruLens RAG Triad and Feedback Functions Reference

## 1. The RAG Triad Concept

The RAG Triad provides a comprehensive framework to isolate and quantify the failure modes of Retrieval-Augmented Generation (RAG) systems:

```
          [Query / Prompt]
             /        \
 Context    /          \  Answer
 Relevance /            \ Relevance
          v              v
      [Context] ------> [Response]
            Groundedness
```

### Context Relevance
- **Question:** Is the retrieved context relevant to the user query?
- **Failure Mode:** Hallucination or irrelevant answer caused by bad retrieval chunks.
- **Feedback Implementation:** Compares the query string against each retrieved chunk text. Scores between 0.0 (completely irrelevant) and 1.0 (highly relevant).
- **TruLens API:** `provider.context_relevance(prompt, context)` or `provider.context_relevance_with_cot_reasons(prompt, context)`.

### Groundedness (Faithfulness)
- **Question:** Is the generated response supported by the retrieved context?
- **Failure Mode:** Extrapolative hallucination where the LLM introduces facts absent from the context.
- **Feedback Implementation:** Employs Natural Language Inference (NLI) or Chain-of-Thought (CoT) prompting to verify each claim in the response against source chunks.
- **TruLens API:** `groundedness.groundedness_measure_with_cot_reasons(context, response)` via `Groundedness(groundedness_provider=provider)`.

### Answer Relevance
- **Question:** Does the generated response directly address the user query?
- **Failure Mode:** Evasive answers, off-topic ramblings, or partial completions.
- **Feedback Implementation:** Compares the response text against the original query.
- **TruLens API:** `provider.relevance(prompt, response)` or `provider.relevance_with_cot_reasons(prompt, response)`.

---

## 2. Supported Feedback Providers

### Snowflake Cortex Provider (`trulens-providers-cortex`)
Evaluates responses directly inside Snowflake infrastructure without data egress:
```python
from trulens.providers.cortex import Cortex

provider = Cortex(model_engine="llama3.1-70b")
```

### OpenAI Provider (`trulens-providers-openai`)
Uses OpenAI models for Chain-of-Thought evaluation:
```python
from trulens.providers.openai import OpenAI

provider = OpenAI(model_engine="gpt-4o")
```

### Bedrock Provider (`trulens-providers-bedrock`)
Leverages Amazon Bedrock foundation models (Claude, Titan, Llama):
```python
from trulens.providers.bedrock import Bedrock

provider = Bedrock(model_id="anthropic.claude-3-5-sonnet-20241022-v2:0")
```

### LiteLLM Provider (`trulens-providers-litellm`)
Connects to 100+ LLM backends via LiteLLM:
```python
from trulens.providers.litellm import LiteLLM

provider = LiteLLM(model_engine="ollama/llama3.2")
```

### HuggingFace Provider (`trulens-providers-huggingface`)
Executes local NLI, sentiment, or toxicity models offline without API costs:
```python
from trulens.providers.huggingface import HuggingFace

provider = HuggingFace()
```

---

## 3. Custom Feedback Functions

Custom evaluation logic can be authored by wrapping any Python scoring function in a TruLens `Feedback` specification:

```python
import numpy as np
from trulens.core import Feedback

def custom_conciseness(response: str) -> float:
    # Score 1.0 for under 200 words, linearly decreasing to 0.0 at 1000 words
    word_count = len(response.split())
    if word_count <= 200:
        return 1.0
    return max(0.0, 1.0 - (word_count - 200) / 800)

f_conciseness = (
    Feedback(custom_conciseness, name="Conciseness")
    .on_output()
)
```

### Selectors and Argument Extraction
TruLens uses `Select` paths to extract inputs, intermediate steps, and outputs from instrumented call trees:
- `Select.RecordCalls.<method>.args.<arg_name>`: Extract input arguments.
- `Select.RecordCalls.<method>.rets`: Extract method return values.
- `Select.RecordInput`: Root user query string.
- `Select.RecordOutput`: Final application response string.
