# Context: autoresearch hardening

## Workflow Context
Karpathy-style autoresearch shows up in a very specific workflow: a human writes `program.md`, an agent edits `train.py`, every run uses a fixed 300-second budget, the evaluation harness stays immutable, and the loop keeps or reverts each change by `val_bpb` in git-backed history. In practice, users still do substantial operator work around that loop: they verify hardware and CUDA readiness first, hand-author and update `program.md`, watch `run.log`, inspect `results.tsv`, and tune sequence length / eval token budgets for their actual GPU instead of treating the system as pure “push button overnight science.”

The upstream README and `program.md` make the core boundary clear: this is a training-loop search system for real GPU experiments, not a generic prompt-eval or skill-eval framework.

Sources:
- GitHub raw primary-source retrieval: https://raw.githubusercontent.com/karpathy/autoresearch/master/README.md
- GitHub raw primary-source retrieval: https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md
- GitHub API primary-source retrieval: https://api.github.com/repos/karpathy/autoresearch
- Browser-rendered primary page evidence: https://docs.langchain.com/langsmith/evaluation
- Browser-rendered primary page evidence: https://www.promptfoo.dev/docs/intro/
- Browser-rendered primary page evidence: https://www.braintrust.dev/
- SkyPilot scaling write-up: https://blog.skypilot.co/scaling-autoresearch/

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| ML researcher / solo builder | Define `program.md`, choose search directions, interpret retained improvements | Advanced |
| GPU operator / infra-minded experimenter | Verify CUDA/VRAM readiness, adjust seq length and eval budgets, keep runs resumable | Advanced |
| AI-agent maintainer | Keep the evaluator immutable, preserve keep/revert history, prevent metric drift or git-state chaos | Advanced |
| Repo maintainer for `.agent-skills` | Keep `autoresearch` clearly distinct from `skill-autoresearch` and generic eval/observability lanes | Advanced |

## Current Workarounds
1. Users add wrapper scripts around the upstream loop for setup, single-run execution, keep/revert ratcheting, and result summaries instead of relying on prose alone.
2. Users downscale `MAX_SEQ_LEN`, `EVAL_TOKENS`, model size, or dataset scope for 24GB / 12GB / 6GB hardware and accept that cross-hardware results are not directly comparable.
3. Users tail logs and parse `results.tsv` manually because overnight runs still need human monitoring and later analysis.
4. Users add scratch-memory artifacts like notes, blacklists, or dashboards because `results.tsv` alone is too thin for long search sessions.
5. Users rely on hosted or cluster wrappers such as SkyPilot jobs when they need multi-machine execution, but still preserve a local experiment ledger and explicit research directions.

## Adjacent Problems
- Eval integrity and holdout leakage: if the immutable harness is not protected by design, the loop can optimize the wrong thing.
- Logging brittleness: malformed TSV rows, carriage-return-heavy logs, and crash states make later analysis harder.
- Hardware portability: macOS/MLX, Windows RTX, and consumer GPUs need separate recipes, not just a smaller checkbox in the README.
- Trust and review: users still want a human-readable explanation of what improved, what regressed, and what failed repeatedly.
- Boundary confusion: the repo now contains both `autoresearch` and `skill-autoresearch`, which share the keep/revert metaphor but serve different jobs.

## User Voices
- “The core idea is simple: instead of touching Python, humans write the `program.md` files…” — upstream `karpathy/autoresearch` README. Source: https://raw.githubusercontent.com/karpathy/autoresearch/master/README.md
- “Immutable by instruction is not enough. Must be immutable by design.” — user report on a holdout-leakage failure in an autoresearch-style loop. Source: https://github.com/karpathy/autoresearch/issues/491
- Greyforge’s critique describes the upstream loop as a strong demo but not the full operational research stack, highlighting the need for supervision, durable artifacts, and bounded execution. Source: https://github.com/karpathy/autoresearch/issues/501
- Multiple issue/PR threads show recurring needs for dashboards, TSV analysis helpers, checkpointing-before-eval, and crash-safe wrappers rather than pure autonomous prompting. Sources: https://github.com/karpathy/autoresearch/issues/476 , https://github.com/karpathy/autoresearch/pull/114 , https://github.com/karpathy/autoresearch/pull/193
