# Platform Map: autoresearch structural hardening

## Settings
| Concern | `karpathy/autoresearch` | Adjacent eval / observability tools | Common Layer |
|---------|--------------------------|-------------------------------------|--------------|
| Primary goal | Improve `val_bpb` on a real training repo | Score, trace, compare, or gate outputs | `goal` / job-to-be-done |
| Mutable artifact | `train.py` | prompts, test cases, app versions, traces | mutable target |
| Fixed harness | `prepare.py` + fixed 300s budget + validation shard | eval datasets / regression suites / scoring rules | immutable evaluator |
| Output | kept/discarded commits + `results.tsv` | scorecards, traces, dashboards, reports | comparable result artifact |
| Budget | GPU time + VRAM | token, API, CI, or review budget | explicit run budget |

## Rules
| Concern | `autoresearch` | Adjacent tools | Common Layer |
|---------|----------------|----------------|--------------|
| Boundary | only real ML training search | prompt/app eval or observability | route-out policy |
| Fairness | never change `prepare.py` mid-session | freeze eval datasets/prompts per run | immutable-harness rule |
| Mutation style | one meaningful experiment at a time | one prompt / config / code change per comparison loop | clean-ablation rule |
| Acceptance | keep only lower `val_bpb` | keep only score-improving changes | keep-or-revert ratchet |
| Logging | append to `results.tsv` | append to experiment/eval history | append-only experiment log |

## Hooks
| Lifecycle | `autoresearch` | Adjacent tools | Common Layer |
|-----------|----------------|----------------|--------------|
| Preflight | hardware check, setup, baseline run | dataset/test prep, instrumentation | readiness hook |
| Authoring | write `program.md` | author evals / prompts / rubrics | intent-shaping hook |
| Run | execute `train.py` under fixed budget | run eval suite / CI / trace capture | execution hook |
| Compare | extract `val_bpb` and VRAM | aggregate scores / traces | comparison hook |
| Decide | keep or reset git commit | keep/revert prompt or app change | ratchet hook |
| Report | summarize `results.tsv` | emit report/dashboard | synthesis hook |

## Platform Gaps
- Hosted eval/observability tools do not expose the same low-level ML training-loop boundary as `karpathy/autoresearch`.
- `autoresearch` is better treated as a workflow pattern with a narrow ML-specific contract than as a generic research or eval platform.
- The front-door skill should keep only universal routing and boundary logic; backend-specific search/eval mechanics belong in references/scripts.
