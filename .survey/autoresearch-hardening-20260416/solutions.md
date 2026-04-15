# Solution Landscape: autoresearch hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| karpathy/autoresearch | Real GPU training-loop search over `train.py` with fixed 300-second budget and `val_bpb` ratchet | Crisp single-metric loop; real training evidence; strong immutability contract | Hardware-heavy; narrow; not a general eval stack | Canonical upstream boundary. Source: https://raw.githubusercontent.com/karpathy/autoresearch/master/README.md |
| oh-my-skills `autoresearch` | Repo-native operator packet around upstream workflow with scripts + references | Bridges concept to action; includes hardware/program/run guidance | Missing eval harness on `main`; some trust gaps from stale/placeholder wording | Best bounded improvement target in this repo |
| oh-my-skills `skill-autoresearch` | Repo-local skill mutation loop with fixed prompts/evals and keep/revert scoring | Correct fit for `SKILL.md` optimization; low hardware barrier; clear git-friendly artifacts | Not for GPU training or `val_bpb` search | Must stay distinct from `autoresearch` |
| LangSmith Evaluation | Dataset/evaluator/tracing platform for offline + online LLM app evals | Strong for datasets, evaluators, experiment comparison, annotation queues | Solves app quality, not training-code search under fixed GPU budgets | Route-out for traces, app regressions, and review queues. Source: https://docs.langchain.com/langsmith/evaluation |
| Promptfoo | CLI/library for evaluating and red-teaming LLM apps | Strong CLI, CI/CD gating, prompt/model comparison, red teaming | Centers prompt/app evaluation, not training-loop search | Route-out for prompt CI and red teaming. Source: https://www.promptfoo.dev/docs/intro/ |
| Braintrust | AI observability/evals platform for production traces and release quality | Strong product/team workflow, trace-to-eval story, release confidence | Broader platform than needed; not a `train.py`/`val_bpb` ratchet | Route-out for productized AI systems. Source: https://www.braintrust.dev/ |
| DeepEval / Phoenix / Humanloop category | Judge-driven LLM app evaluation and observability | Good category evidence for app-level evals, regression gates, observability | Multi-objective app evals, not immutable training harnesses | Useful contrast, not the target lane |

## Categories
- **Canonical ML experiment loop:** `karpathy/autoresearch`
- **Repo-native operator wrapper for that loop:** oh-my-skills `autoresearch`
- **Repo-local skill optimization:** oh-my-skills `skill-autoresearch`
- **LLM app eval / observability platforms:** LangSmith, Promptfoo, Braintrust, DeepEval, Phoenix, Humanloop
- **Cluster / cloud execution wrappers:** SkyPilot-style execution and community forks for macOS/Windows/MLX

## What People Actually Use
People do not just “let the agent run.” They still write and revise `program.md`, verify CUDA/VRAM, tail `run.log`, inspect `results.tsv`, add result-analysis helpers, and use scripts to protect the keep/revert loop from crashy or inconsistent shell behavior. On non-H100 hardware they explicitly rescale the workload and often rely on community forks or hosted-job wrappers.

## Frequency Ranking
1. `karpathy/autoresearch` itself — the canonical pattern and source of terminology
2. Repo-native wrappers/scripts around the upstream loop — setup, hardware checks, run loop, results reporting
3. `skill-autoresearch` as the nearest internal confusion risk / neighboring lane
4. LangSmith / Promptfoo / Braintrust as the most recognizable adjacent product categories
5. Forks / cluster wrappers (macOS, Windows RTX, MLX, SkyPilot, HF jobs) for hardware portability and scaling

## Key Gaps
- No `evals/evals.json` for the repo’s `autoresearch` skill on current `main`
- Trigger/boundary wording can still blur with `skill-autoresearch`
- Some reference material has trust-eroding placeholders or under-specified boundary sentences
- The skill could surface hardware modes, immutable-harness rules, and route-outs more explicitly

## Contradictions
- Marketed story: autonomous overnight research with minimal human effort
- User reality: humans still curate `program.md`, monitor logs, tune VRAM settings, and add helper scripts/dashboards

- Marketed story from eval platforms: “experiments” as prompt/model/app comparison
- `autoresearch` reality: “experiment” means mutate training code, train for a fixed wall-clock budget, and keep only lower-loss results

## Key Insight
The best move is not to broaden `autoresearch` into a generic self-improvement or eval platform skill. Its value comes from being unmistakably specific: human-authored `program.md`, agent-edited `train.py`, immutable training harness, fixed 300-second GPU budget, scalar `val_bpb`, and git ratcheting. Everything that sounds like prompt evaluation, skill benchmarking, tracing, red teaming, or AI product observability should route out.
