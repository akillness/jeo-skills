# Platform Map: hourly candidate sweep metadata hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey keyword sweep execution | Supported via shell + web tooling | Supported via shell + web tooling | Supported via shell + web tooling | Run all five keyword families and preserve raw evidence |
| License metadata field availability | May depend on chosen GitHub retrieval path | Same | Same | If `license` is null in first-pass metadata, run deterministic REST fallback |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Recommendation-grade license gate | Keep only explicit license by default | Keep only explicit license by default | Keep only explicit license by default | Apply same gate after fallback retrieval |
| Degraded-cause taxonomy | `license|stale|low-fit|archived|low-signal` | Same | Same | Do not mark `license` degraded until fallback attempt is exhausted |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Candidate metadata fetch | `gh repo view --json` first | `gh repo view --json` first | `gh repo view --json` first | fallback to `gh api repos/<owner>/<repo>` for null license |
| Evidence persistence | Write `.survey/<slug>/evidence.json` | Same | Same | Keep provenance labels + lane metrics |

## Platform Gaps
1. GraphQL `licenseInfo` can be null even when REST endpoint returns SPDX data.
2. Without fallback, cross-platform automation over-reports `license` degradation.

Provenance: direct page retrieval, indexed snippet
