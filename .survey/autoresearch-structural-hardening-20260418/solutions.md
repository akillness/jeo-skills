# Solution Landscape: autoresearch structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `karpathy/autoresearch` | Closed-loop ML repo with `program.md`, `train.py`, fixed harness, and keep/revert git ratchet | Closest match to the repo skill’s real job; clear immutable-harness model | Easy to blur with generic eval tooling if the front door is too broad | Canonical upstream anchor |
| OpenAI Evals | Fixed evaluation harness | Clear benchmark mental model | Not a full autonomous search loop | Adjacent judge, not the loop |
| promptfoo | Prompt/app regression testing | Practical keep/revert CI framing | Prompt/app focused, not GPU training search | Good route-out example |
| LangSmith | Tracing + evals + observability | Strong for agent/app debugging | Observability infra, not the optimizer | Explicit route-out for non-ML jobs |
| Braintrust / Weave / Humanloop | Experiment + eval platforms | Good comparison/reporting substrate | More platform overhead, not the training-loop owner | Adjacent support layer |
| DSPy | Metrics-driven optimization of LM programs | Conceptually close to automatic improvement | Different abstraction from `train.py` + `val_bpb` ML search | Useful contrast, not a direct substitute |

## Categories
- **Autoresearch proper**: closed-loop mutation + fixed harness + keep/revert ratchet (`karpathy/autoresearch`).
- **Evaluation harnesses**: OpenAI Evals, promptfoo, Inspect AI, DeepEval, LM Evaluation Harness.
- **Experiment / observability platforms**: LangSmith, Braintrust, Weave, Humanloop.
- **Conceptual cousins**: DSPy and similar optimizer-style systems.

## What People Actually Use
In practice, people still mix notebooks, shell scripts, repo-local markdown, and experiment trackers. That means the front-door skill should mostly classify the job, call out the immutable constraints, and route the user to the smallest useful reference or script instead of embedding everything inline.

## Frequency Ranking
1. `karpathy/autoresearch` as the canonical workflow for this skill.
2. LangSmith / promptfoo / OpenAI Evals as the most likely confusion set.
3. Braintrust / Weave / Humanloop as adjacent experiment platforms.
4. DSPy as the closest “automatic improvement” cousin with a different abstraction.

## Key Gaps
- The market has many eval and observability tools, but fewer tools that cleanly explain the boundary between **closed-loop ML training search** and **prompt/app eval infrastructure**.
- Real users still need decision-first routing for setup vs program authoring vs monitoring vs interpretation.
- Support material is valuable only if the front door stays small enough to make the correct route obvious.

## Contradictions
- Vendors often imply full autonomy, but practical workflows remain human-guided and script-heavy.
- Tracking platforms are strong at run comparison but weak at capturing the decision record for what to try next.
- Static eval harnesses support fairness but do not themselves explain the ML-specific `program.md` / `train.py` / `val_bpb` boundary.

## Key Insight
The bounded win is not adding another eval wrapper or expanding `autoresearch` into hosted-platform comparisons. It is shrinking `autoresearch` into a routing-first ML search front door that makes the immutable-harness contract obvious, picks one operating mode, and pushes deep setup/architecture/hardware details into focused references and scripts.
