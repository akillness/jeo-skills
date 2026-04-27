# Platform Map: oh-my-skills hourly survey maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Retrieval transport | GitHub CLI fallback-capable | GitHub CLI fallback-capable | GitHub CLI fallback-capable | direct page retrieval + metadata enrichment |
| Artifact schema | survey markdown + evidence JSON | survey markdown + evidence JSON | survey markdown + evidence JSON | validator-enforced headings |
| Headless notes | direct write fallback | direct write fallback | direct write fallback | Obsidian vault compatibility |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Promotion gate | lane-fit + freshness + signal + license | same | same | deterministic promotion criteria |
| Provenance labels | include allowed label text | include allowed label text | include allowed label text | validator-compatible provenance |
| Merge policy | merge only after quality gates pass | same | same | PR checklist + checks |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | five-lane keyword sweep | five-lane keyword sweep | five-lane keyword sweep | mandatory lane coverage |
| Refinement | RTK + Graphify | RTK + Graphify | RTK + Graphify | evidence to knowledge artifacts |
| Delivery | PR + self-review | PR + self-review | PR + self-review | merge on green gates |

## Platform Gaps
1. Search noise can still dominate niche lanes.
2. License enrichment requires extra calls in sparse payloads.
3. Headless environments may fail URI-style note creation.
