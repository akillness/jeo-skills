# Platform Map: testing-strategies modernization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Test-layer taxonomy | Project instructions / skill text can define unit, integration, contract, E2E, smoke, exploratory, and release checks | Repo instructions / skill text can define the same taxonomy | Repo instructions / skill text can define the same taxonomy | `testing-strategies` should own the vocabulary and layer definitions, not framework syntax |
| Risk classification | Can be expressed as instructions or pre-task guidance | Can be expressed as repo policy / AGENTS guidance | Can be expressed as repo workflow guidance | Skill should classify changes by risk and map them to validation depth |
| Merge / release confidence threshold | Can be encoded in instructions and handoff expectations | Can be encoded in repo policy and CI conventions | Can be encoded in repo workflow conventions | Skill should define what counts as sufficient evidence before merge/release |
| Exceptions policy | Can require explicit rationale when tests are skipped | Same | Same | Skill should define when omissions are acceptable and what explanation is required |
| Coverage metrics | Platform can read tool output but does not define strategy itself | Same | Same | Treat coverage as a supporting signal, not the strategy |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Change-based validation selection | Skill/rules can require different validation by feature, migration, API, UI, or bugfix type | Same | Same | Decide **what validation should exist for this change** |
| Lowest-cost convincing check | Rules can prefer lower-cost unit/service/contract checks before escalating to E2E | Same | Same | Prefer the cheapest layer that still provides credible confidence |
| Critical-path regression policy | Rules can require stronger validation for auth, billing, persistence, permissions, and migrations | Same | Same | Critical paths need explicit regression protection |
| Flaky-test handling | Rules can quarantine, fix, or de-block flaky checks instead of silently normalizing reruns | Same | Same | Flake is a strategy/policy problem, not just a CI annoyance |
| Boundary with neighboring skills | Rules can route implementation to `backend-testing`, TDD workflow to `test-driven-development`, failures to `debugging`, and review judgment to `code-review` | Same | Same | Keep `testing-strategies` as policy/orchestration, not implementation or diagnosis |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Task start / planning | Natural place to classify risk and propose required validation layers | Same via repo instructions / workflow guidance | Same via workflow guidance | Hook intent: identify validation plan before implementation starts |
| Pre-edit / pre-commit | Warn when risky work has no test plan | Same | Same | Ensure a validation plan exists before heavy edits are finalized |
| Pre-PR / finalize | Compare changed surface area to claimed evidence | Same | Same | Verify that required validation was actually exercised |
| CI / merge | Blocking checks and waivers can be enforced in existing automation | Same | Same | Merge gate should reflect strategy, not just raw command success |
| Release | Run narrower but stronger release/smoke checks for critical paths | Same | Same | Release confidence requires its own hook, not only PR checks |
| Incident / bugfix follow-up | Require a regression-test decision after escape or production issue | Same | Same | Route to `debugging` first if root cause is unknown, then back to implementation |

## Platform Gaps
- Platforms are good at **running commands** but weak at deciding **which tests are sufficient** for a given change.
- Hook syntax varies, but the intent is stable: task-start planning, pre-finalize validation, merge gating, and release gating.
- Without explicit boundaries, `testing-strategies` easily bloats into implementation (`backend-testing`), workflow discipline (`test-driven-development`), diagnosis (`debugging`), or review judgment (`code-review`).
- Teams often use inconsistent meanings for “integration test,” “smoke test,” and “regression test,” so the skill needs to normalize vocabulary before it can be useful.
- Coverage tools, CI providers, and framework docs provide metrics or mechanics, but they do not substitute for a reusable policy layer.
