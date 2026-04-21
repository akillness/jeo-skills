# Platform Map: survey evidence recovery hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Tool/network access for retrieval | Claude Code settings expose runtime/tool controls that can enable evidence recovery | Codex relies on config plus sandbox/approval controls | Gemini CLI similarly distributes retrieval capability across config and permission surfaces | Retrieval capability belongs in `settings` because it changes what the agent can do |
| Model/runtime cost of escalation | Claude can keep cheap retrieval before heavier browsing through settings + tool choices | Codex typically needs config/orchestrator discipline to preserve cheap-first escalation | Gemini also benefits from explicit cheap-first runtime defaults | Set the retrieval ladder to escalate from cheap primary fetches to heavier browser work |
| Persistent path for artifacts | `.survey/{slug}` remains portable across platforms | Same | Same | Artifact path is platform-neutral even when runtime settings differ |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Evidence before synthesis | Natural fit for repo instructions plus CLAUDE.md-style guidance | Natural fit for AGENTS.md-style repo rules | Natural fit for GEMINI.md/project instructions | Rule: unsupported claims must trigger recovery before final synthesis |
| Evidence labeling | Can require `direct page retrieval`, `indexed snippet`, and confidence notes | Same | Same | Rule: always label evidence type and downgrade confidence for indirect evidence |
| Link-drift handling | Prefer stable vendor/use-case pages when specific URLs 404 | Same | Same | Rule: do not grind indefinitely on dead links when a stronger durable source exists |
| Stop condition | If direct retrieval + browser/snippet recovery still fail, report thin evidence instead of bluffing | Same | Same | Rule: stop with an explicit uncertainty note rather than silent guesswork |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-research | Hook can normalize topic and choose retrieval strategy before lane work begins | Often handled by wrapper/orchestrator rather than a first-class hook | Often handled by wrapper/orchestrator rather than a first-class hook | `pre_research`: choose fallback ladder and artifact slug |
| Post-lane | Hook can merge lane notes and record evidence type automatically | Usually external orchestration or prompt discipline | Usually external orchestration or prompt discipline | `post_lane`: merge notes, record sources, stamp evidence confidence |
| Pre-final summary | Hook can check that unsupported claims are labeled before summary | Usually external orchestration or checklist | Usually external orchestration or checklist | `post_run`: verify artifacts and evidence labels before reporting |

## Platform Gaps
Claude has the cleanest first-class hook story, which makes automatic enforcement of evidence-recovery policy easier. Codex and Gemini can still implement the same behavior, but more of the enforcement tends to live in instruction files, wrappers, or orchestrators rather than native lifecycle hooks. That means the `survey` skill should describe the recovery ladder in a vendor-neutral way: `settings` enable retrieval, `rules` require evidence-backed escalation, and `hooks` describe where automation can enforce that policy when the platform supports it.
