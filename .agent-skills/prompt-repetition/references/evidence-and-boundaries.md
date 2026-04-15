# Prompt Repetition — Evidence and Boundaries

## Strongest evidence
- The main primary-source claim is the arXiv paper **"Prompt Repetition Improves Non-Reasoning LLMs"** ([arXiv 2512.14982](https://arxiv.org/abs/2512.14982)). Its abstract says that when not using reasoning, repeating the input prompt improves performance for Gemini, GPT, Claude, and DeepSeek models **without increasing the number of generated tokens or latency**.
- The paper is strongest evidence for **non-reasoning** use. Do not stretch it into a general claim about all prompting, all agent workflows, or all model classes.

## What the evidence supports well
1. **Long-context retrieval-like prompts** where the question appears late.
2. **Options-first multiple choice** where the actual ask is easy to lose.
3. **Position-sensitive / index-sensitive tasks** where ordered details are easy to miss.

## What the evidence does not support strongly
- blanket auto-application to every lightweight model request
- reasoning-heavy synthesis or planning work
- tool-heavy agent prompts with many policies/actions
- broad claims about NPC dialogue, creative writing, or general conversation quality

## Why broader context work still matters
The broader prompt ecosystem keeps framing the real job as **context engineering**: improving what information the model sees and how it is arranged. See the Prompt Engineering Guide's [Context Engineering Guide](https://www.promptingguide.ai/guides/context-engineering-guide).

A related long-context paper explores **emulating RAG through prompt engineering** rather than merely duplicating the whole prompt, which reinforces that repetition is one option inside a larger design space ([arXiv 2502.12462](https://arxiv.org/html/2502.12462v1)).

## Practical boundary rule
Use prompt repetition when:
- the task is non-reasoning
- the failure is tied to late prompt information, option ordering, or index-heavy lookup
- the context budget still tolerates duplication

Do not use it when:
- the real problem is retrieval quality, source selection, or prompt bloat
- the model needs deeper reasoning rather than stronger late-context recall
- the prompt already sits near the context window limit
