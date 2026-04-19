# Platform Map: opencontext structural hardening

## Settings
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Initial context load | `CLAUDE.md`, memory files, repo instructions, OMC skill/runtime overlays | AGENTS/instructions plus OMX prompt/runtime overlays | `.agents/` source-of-truth with generated Gemini surfaces plus OHMG routing | OpenContext manifests and stable links can tell any runtime what to read first |
| Search depth | Keyword docs/instructions first; deeper memory/search as needed | Repo exploration and prompt/runtime lookup first; heavier workflows when needed | Portable harness / generated agent docs first; runtime-specific routing second | Prefer keyword search + manifest before expensive indexing |
| Persistence target | Claude memory files + repo docs + OMC runtime state | Repo docs + Codex/OMX runtime state | `.agents/` + generated vendor files + portable docs | OpenContext stores active project memory outside one vendor runtime |
| Output artifact | Memory/instruction files and team/runtime packets | Role prompts, workflow packets, runtime overlays | Portable harness docs and generated agent views | Manifest, stable link, decision log, handoff packet |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Approval / guardrail surface | Claude memory/rules files and OMC mode choices constrain behavior | Codex instructions plus OMX workflow/mode selection constrain behavior | OHMG routes vendor-first runtime questions outward and keeps `.agents/` canonical | OpenContext should store constraints/decisions as searchable project memory, not replace vendor guardrails |
| When to use repo memory | Fresh-session or multi-agent handoff needs current repo/project context | Same need during plan/execute/review loops in Codex workflows | Same need when portable harness adoption needs current repo context | Use OpenContext when the main question is “what should the next agent load/search/store?” |
| When to route out | Long-lived wiki, structural graph, human-authored vault, or pure repo packer job | Same | Same | Route narrative synthesis to `llm-wiki`, structure maps to `graphify`, note workflows to vault skills, one-shot repo packing to context packers |
| Update policy | Update existing memory docs before creating duplicates | Same | Same | Load existing docs first, then extend instead of forking parallel notes |

## Hooks
| Lifecycle | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|-----------|---------------|-------------|---------------|--------------|
| Pre-work hook | Load repo instructions and current task context | Load instructions/runtime prompts and inspect repo | Load `.agents/` / generated views and current project context | `oc folder ls` / `oc context manifest` / targeted search before doing work |
| Mid-work hook | Search prior decisions/pitfalls when uncertainty appears | Search repo memory during planning/execution/review | Search portable project memory during harness/runtime work | Keyword search for prior decisions, constraints, incidents, acceptance notes |
| Post-work hook | Leave handoff or decision note for next Claude/OMC session | Leave handoff or decision note for next Codex/OMX session | Leave handoff or decision note for next Gemini/OHMG session | Store reusable conclusions, evidence, and next checks in OpenContext docs |
| Cross-agent handoff | OMC team/runtime can share a packet | OMX workflows can hand off plan/review state | OHMG portable harness can point multiple runtimes at the same project packet | Stable links + manifest provide the smallest truthful handoff surface |

## Platform Gaps
- Vendor runtimes differ in how they express memory, rules, and orchestration, but none cleanly standardize a portable **project-memory packet**.
- Claude/Codex/Gemini surfaces all have instruction layers, yet those layers are not the same thing as searchable active project memory.
- Portable `.agents/` style harnesses help with agent roles, but they still benefit from OpenContext-style manifests and stable links for what to read now.
- This is the clean abstraction: **settings** choose how the runtime starts, **rules** constrain what it may do, and **hooks** decide when to load/search/store project memory. OpenContext belongs primarily in the hookable project-memory layer that sits beside vendor-specific runtime settings and rules.
