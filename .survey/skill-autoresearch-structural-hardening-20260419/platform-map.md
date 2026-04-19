# Platform Map: skill-autoresearch structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Mutable artifact | `SKILL.md` plus optional support files in repo | same | same | one primary mutable artifact |
| Eval inputs | prompts, eval assertions, repo validators, dry-run checks | same | same | frozen evaluation harness |
| Output artifacts | markdown + JSON/TSV/files in repo | same | same | append-only run package |
| Comparison scope | branch/PR diff plus local files | same | same | repo-local keep/revert truth |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Judge drift | do not change prompts/evals mid-run | same | same | start a new comparison track if the evaluator changes |
| Mutation size | one meaningful change per iteration | same | same | attributable ablations |
| Boundary control | route hosted eval/tracing asks outward | same | same | repo-local skill ratcheting stays distinct from app-scale eval platforms |
| Surface sync timing | sync README/setup/manifests only after the main ratchet is justified | same | same | support-surface updates are secondary work |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-run | read target skill/support files, freeze charter | same | same | baseline before edits |
| Iteration | rerun the same harness after one mutation | same | same | keep-or-revert loop |
| Post-iteration | append score/result to results + changelog | same | same | append-only experiment memory |
| Post-run | sync discovery surfaces if needed and report baseline-to-final delta | same | same | durable artifact handoff |

## Platform Gaps
- The core abstraction aligns well because the real contract is repo-local, not vendor-specific.
- Differences mostly appear in where prompts/evals are executed or how traces are inspected, which should route to external eval platforms rather than expand this skill.
- `skill-autoresearch` should own the markdown/git ratchet; runtime-specific tracing, hosted dashboards, and app telemetry should stay outside the skill boundary.
