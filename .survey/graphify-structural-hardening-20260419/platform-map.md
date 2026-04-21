# Platform Map: graphify structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Install surface | Assistant-native `/graphify` or `graphify claude install` according to upstream README | `graphify codex install` | `graphify gemini install` | Assistant install exists, but the skill should verify whether always-on integration is actually needed before recommending it |
| Graph scope | Repo root or smallest relevant subtree | Repo root or smallest relevant subtree | Repo root or smallest relevant subtree | Start with the smallest path that answers the question; add `.graphifyignore` for noisy folders |
| Output artifacts | `GRAPH_REPORT.md`, `graph.json`, `graph.html`, optional wiki export | Same | Same | Durable artifact contract should stay identical across platforms |
| Local automation path | Hermes/browser/terminal contexts may need Python API or structural fallback instead of assistant-native UX | Same | Same | Local/non-native environments need a truthful fallback path rather than pretending the assistant command is enough |
| Update cadence | Rebuild/update when structure changed materially | Same | Same | Prefer incremental refresh where supported; otherwise re-run the bounded pipeline on changed scope |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| When to claim graphify | When the user explicitly wants graph artifacts, graph queries, architecture discovery, or mixed-corpus graphing | Same | Same | `graphify` owns durable structure and graph-backed path tracing |
| When to route out | Use search/repo-map skills for simple locate/reference work | Same | Same | Route to `codebase-search` for search-first work, `llm-wiki` for narrative synthesis, `OpenContext` for project memory |
| Trust boundary | Do not promise a semantic graph build if the corpus or tool state only supports a structural fallback | Same | Same | Label fallback outputs honestly (`graphify-style structural graph fallback`) |
| Large-repo behavior | Avoid whole-repo default if compact/runtime cost is likely to explode | Same | Same | Smallest useful scope first; ignore noisy/generated trees |
| Artifact reporting | Tell the user which artifacts were built and what method was used | Same | Same | Output format should always state scope, output dir, success/fallback mode, and key structural findings |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-run | Verify install needs, choose path scope, inspect existing graph outputs | Same | Same | Start from current graph state before rebuilding blindly |
| Build | Assistant-native `/graphify` if available and appropriate | Assistant-native install/command if available | Assistant-native install/command if available | Otherwise use local Python pipeline or structural fallback |
| Post-build | Read `GRAPH_REPORT.md` first, then query/path/explain as needed | Same | Same | Never dump raw `graph.json` into prompts if a report or focused query will do |
| Incremental maintenance | Refresh only the changed scope when possible | Same | Same | Reuse graph artifacts where practical instead of full rebuilds every time |
| Failure hook | If native extraction yields a 0-node or misleading graph, switch to deterministic structural fallback | Same | Same | Failure handling should preserve durable artifacts, not silently abort |

## Platform Gaps
- Upstream Graphify blurs assistant-native UX and raw local execution in a way that is fine for power users but too fuzzy for a routing-first skill.
- The biggest abstraction mismatch is not Claude vs Codex vs Gemini; it is assistant-native installs versus local/Hermes automation, where a Python API or structural fallback is often the truthful path.
- Because the artifact contract is stable across platforms, the skill should be smaller at the front door and push detailed mode/fallback logic into support references rather than repeating full command catalogs in `SKILL.md`.
