# Platform Map: opencontext modernization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Session context loading | Load AGENTS/skills and external context before coding | Load AGENTS plus repo/file context before execution | Load workflow guide / research context before analysis | `settings.context_sources` |
| Project memory backend | OpenContext CLI/MCP or local markdown/wiki | OpenContext CLI/MCP or local markdown/wiki | OpenContext CLI/MCP or local markdown/wiki | `settings.memory_backend` |
| Search depth | Manifest + targeted doc search | Search + shell-assisted retrieval | Search + large-context synthesis | `settings.retrieval_budget` |
| Persistent artifact choice | OpenContext docs vs wiki pages vs graph artifacts | Same | Same | `settings.memory_layer` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Capture before acting | Load context before implementation | Inspect stored docs before shell/code work | Gather context before synthesis/planning | `rules.load_before_do` |
| Route to the right memory layer | Use wiki for compounding narratives, graph for structure | Same | Same | `rules.memory_route_outs` |
| Avoid context drift | Store conclusions after meaningful work | Store results and commands after execution | Store synthesized findings after research | `rules.store_after_run` |
| Avoid noisy duplication | Update existing docs when possible | Same | Same | `rules.update_instead_of_duplicate` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-run | Load AGENTS + OpenContext manifest | Load repo context + manifest | Load workflow docs + manifest | `hooks.pre_run_context_load` |
| Mid-run search | Search docs for prior decisions | Search docs during code execution | Search docs during research synthesis | `hooks.mid_run_lookup` |
| Post-run capture | Append conclusions and citations | Store execution outcome and follow-ups | Store research summary and links | `hooks.post_run_capture` |
| Cross-agent handoff | Share stable links / manifest snippets | Same | Same | `hooks.handoff_packet` |

## Platform Gaps
- OpenContext is the clearest project-memory layer, but the current repo skill did not normalize its role against wiki and graph layers.
- Claude/Codex/Gemini differ in orchestration ergonomics, but their memory needs map cleanly into the same load/search/store lifecycle.
- The real gap is instructional, not platform capability: operators need a decision packet for choosing OpenContext vs wiki vs graph, not another provider-specific memory wrapper.
