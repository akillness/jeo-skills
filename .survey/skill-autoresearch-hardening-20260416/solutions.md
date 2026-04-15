# Solution Landscape: skill-autoresearch hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Promptfoo | CLI eval harness + CI gating | Practical datasets, assertions, regression checks, CI-friendly | Not a markdown-skill mutation system | Closest lightweight benchmark analogue |
| DeepEval | Pytest-like LLM eval framework | Familiar test mental model, ready-made metrics | Judge/cost noise, code-first workflow | Good model for repo-local eval discipline |
| OpenAI Evals | Benchmark/eval framework | Strong precedent for custom offline eval suites | More framework than workflow | Useful for evaluator/data separation |
| LangSmith | Dataset + experiment comparison + annotation | Mature experiment comparison and audit flow | Hosted platform, not repo-local prompt ratchet | Good reference for frozen datasets and regression review |
| Braintrust | Eval/tracing platform | Strong task/data/score pattern | Platform dependency | Good for experiment structure, less for skill-doc mutation |
| Weave | Evaluation + experiment tracking | Clean evaluation object model | More observability than mutation loop | Useful dashboard/reference inspiration |
| TruLens | Evaluation + experiment tracking | Good systematic experiment history | Less directly about skill mutation | Fits broader tracking lane |
| DSPy / MIPROv2 | Programmatic optimization | Metric-driven instruction/example search | Assumes programmable pipelines, can overfit | Strong conceptual inspiration for mutation hypotheses |
| PromptWizard | Self-evolving prompt optimizer | Explicit iterative generate/critique/refine loop | Research-style, not repo-local maintainer flow | Good mutation inspiration |
| TextGrad | Textual-gradient optimizer | Failure-directed prompt optimization | Experimental feel, easy to overfit | Good for targeted hypothesis language |
| AdalFlow | Auto-optimizing LM workflows | Agent/workflow optimization framing | Heavier framework | Useful adjacent evidence, not direct template |

## Categories
1. **Eval harnesses / benchmark runners** — Promptfoo, DeepEval, OpenAI Evals.
2. **Experiment tracking / observability** — LangSmith, Braintrust, Weave, TruLens.
3. **Automatic prompt/program optimizers** — DSPy/MIPROv2, PromptWizard, TextGrad, AdalFlow.
4. **Repo-local mutation-loop gap** — very few tools combine frozen evals, one-change-at-a-time `SKILL.md` editing, append-only logs, and explicit keep/revert decisions.

## What People Actually Use
In practice teams blend small eval sets, manual labels, PR comments, spreadsheets, and a lightweight tool such as Promptfoo or Langfuse rather than fully committing to a single platform. The durable pattern is simple: collect real failures, rerun them after each change, and compare pass/fail results. What is usually missing is a clean artifact package for rejected mutations and frozen-run criteria.

## Frequency Ranking
1. Eval harness / benchmark runner
2. Experiment dashboard / dataset comparison
3. Manual script + spreadsheet loop
4. Automatic optimizer / search framework

## Key Gaps
- No strong standard workflow for optimizing markdown skills instead of prompts/functions.
- Few solutions preserve discard history well enough for maintainers.
- Hosted platforms solve tracking better than they solve local mutation discipline.
- Optimization frameworks are powerful, but often too heavy for a bounded repo-maintenance run.

## Contradictions
- Marketed reality: “optimize prompts automatically.”
- User reality: many teams still prefer tiny eval suites, manual labels, and simple pass/fail loops.

- Marketed reality: experiment dashboards are the answer.
- User reality: dashboards help, but maintainers still need repo-native artifacts they can review, diff, and keep/revert in git.

## Key Insight
`skill-autoresearch` should not try to imitate the whole hosted eval ecosystem. Its strongest niche is narrower: a repo-local ratcheting workflow for reusable agent instructions that freezes the evaluator for a run, repeats tests enough to absorb non-determinism, records both wins and failed mutations, and leaves behind auditable artifacts that another maintainer can reuse tomorrow.

## Curated Sources
- https://github.com/promptfoo/promptfoo
- https://github.com/confident-ai/deepeval
- https://github.com/openai/evals
- https://docs.langchain.com/langsmith/evaluation
- https://github.com/braintrustdata/braintrust-sdk-python
- https://docs.wandb.ai/weave/guides/core-types/evaluations
- https://github.com/truera/trulens
- https://dspy.ai/learn/optimization/overview/
- https://dspy.ai/api/optimizers/MIPROv2/
- https://github.com/microsoft/PromptWizard
- https://github.com/zou-group/textgrad
- https://github.com/SylphAI-Inc/AdalFlow
