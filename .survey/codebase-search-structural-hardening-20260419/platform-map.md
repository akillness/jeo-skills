# Platform Map: codebase-search structural hardening

## Settings
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Repo-search entry surface | Claude-first orchestration can delegate exploration/search through team or specialist agents in `omc` | Codex-first orchestration exposes explicit repo exploration via `omx explore` and prompt/skill routing | Gemini / portable harness adoption in `ohmg` starts from `.agents/` and runtime selection rather than a single built-in repo-search verb | Search mode selection belongs in `settings`: choose one packet and one scope before searching |
| Runtime state / generated views | `omc` uses Claude runtime settings and optional experimental team env | `omx` adds launch flags and workflow/runtime layers around Codex CLI | `ohmg` keeps `.agents/` canonical and regenerates vendor views (`.gemini/agents`, `.claude/agents`, `.codex/agents`) | Vendor surfaces differ, but packet choice and repo-scope choice are portable |
| Search packet preference | Claude workflows often mix tool-driven exploration plus specialist delegation | Codex workflows explicitly expose explore + sparkshell + workflow skills | Gemini/portable harness workflows must route search through available runtime tools or portable agents | A vendor-neutral skill should own packet selection, not runtime-specific command catalogs |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| When search should stay local/discovery-only | `omc` guidance separates exploration from heavier execution/review lanes | `omx` distinguishes `explore` from heavier workflows like `$ralph` or `$team` | `ohmg` routes vendor-first orchestration questions back to `omc`/`omx` instead of pretending one runtime owns all flows | `codebase-search` should stay discovery-first and route diagnosis/refactoring/review away |
| Cross-vendor boundary handling | Claude-first runtime owns Claude-native orchestration concerns | Codex-first runtime owns Codex-native workflow/flag concerns | Portable-harness path owns `.agents/` adoption and routes vendor-native runtime work out | Boundary rules matter more than command lists |
| Search-to-next-step handoff | Exploration should hand off to debugging/refactoring/review after evidence is gathered | Same pattern, with explicit workflow routing in OMX | Same pattern, with portable-harness/runtime routing in OHMG | Common rules: choose one packet, narrow scope, return evidence map, route out aggressively once search is no longer the bottleneck |

## Hooks
| Lifecycle | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|-----------|---------------|-------------|---------------|--------------|
| Pre-search hook | pick the right agent/workflow before broad execution | pick `explore` / prompt skill / bounded shell path first | choose runtime ownership model first (`Gemini`, `Antigravity`, or portable harness) | normalize request into packet + scope + repo shape before searching |
| During search hook | specialist delegation or tool use depending on runtime | `omx explore` / sparkshell / prompt routing | portable-harness or runtime-native search path | narrow by path/file type/package before reading matches |
| Post-search hook | route to execution/review loop if needed | route to `$plan`, `$ralph`, `$code-review`, etc. | route to the right vendor/runtime or adjacent repo skill | output a compact evidence map and the next route-out |

## Platform Gaps
- Claude/OMC, Codex/OMX, and Gemini/OHMG expose different runtime commands and orchestration metaphors, but they still map cleanly onto the same portable abstraction: **settings = packet/scope choice, rules = discovery-only boundaries, hooks = pre-search normalization and post-search handoff**.
- The abstraction breaks down when a platform treats search as part of a larger autonomous orchestration mode instead of a bounded discovery step; the skill should resist absorbing those runtime-specific execution details.
- `codebase-search` should therefore stay vendor-neutral and smaller than `omc`, `omx`, or `ohmg`: it owns repo-search packet selection and evidence-map output, not runtime installation or autonomous multi-agent orchestration.
