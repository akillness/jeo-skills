# Platform Map: bmad modernization

## Settings
| Concern | Claude / OMC side | Codex / OMX side | Gemini / OHMG side | Common Layer |
|---------|-------------------|------------------|--------------------|--------------|
| Core instructions file | `CLAUDE.md`, Claude plugin/runtime settings | `AGENTS.md` injection and OMX env/config flags | `.agents/` canonical source, generated Gemini views | `bmad` should avoid owning vendor config and instead point to the correct runtime overlay |
| Runtime entry | OMC commands / team runtime | `omx --madmax --high`, workflow skills like `$plan` | `oma link`, generated agents, Gemini-native or fallback path | `bmad` chooses the workflow phase, not the vendor runtime bootstrap |
| Model/runtime tuning | Claude settings / hooks config | Codex approval/sandbox/reasoning flags | Gemini-native generated agents / Antigravity compatibility | Treat these as runtime settings, not core BMAD logic |
| State files | project docs + local status artifacts | `.omx/` runtime state plus project files | `.agents/` plus generated vendor views | `bmad` should describe artifact/state expectations at a vendor-neutral level |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Phase advancement | Can rely on hooks / structured team flow | Can rely on workflow skills / tmux team / AGENTS rules | Can rely on generated agents or fallback CLI workflows | Do not advance phases without the required artifact and visible state |
| Boundary enforcement | Route runtime-specific execution to OMC | Route Codex-first workflow details to OMX | Route portable harness adoption to OHMG | `bmad` should own only BMAD phase logic and routing boundaries |
| Review gates | `plannotator` / human review before advancement | same human-review concept, runtime-agnostic | same human-review concept, runtime-agnostic | Approval logic belongs in the rule layer; `bmad` should call it out but not absorb all review-tool detail |
| Specialist depth | route to task/planning/review specialists | route to workflow/runtime specialists | route to portable-harness / generated-agent specialists | core skill stays narrow; specialists own deeper action patterns |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-run context injection | Claude hooks / plugin setup | AGENTS injection / OMX hook plugins | generated agent files from `.agents/` | `bmad` can assume project instructions exist but should not teach every hook detail inline |
| On phase artifact completion | possible hook-driven review trigger | possible scripted/workflow follow-up | possible generated-agent/fallback follow-up | recommend a review / status update after each major artifact |
| Stop / notify / callback | OMC stop callbacks and hook toggles | OMX hook/plugin status and tmux workflow controls | OHMG / `oma` regeneration and portable harness refresh | keep these runtime-hook concerns in overlay references |
| Error / drift recovery | rerun setup, refresh hooks, inspect CLAUDE.md | rerun hook init/validate, inspect AGENTS.md | rerun `oma link`, refresh generated files | `bmad` should route recovery to the runtime overlay when the issue is setup-specific |

## Platform Gaps
- `bmad` currently mixes common-layer BMAD logic with Claude/Codex/Gemini-specific setup details.
- The repo already has a cleaner separation available: `bmad` for phase orchestration, `plannotator` for approval gates, and `omc` / `omx` / `ohmg` for runtime overlays.
- A modernized `bmad` should keep the **common layer** stable:
  - choose level,
  - inspect current phase status,
  - recommend the next artifact,
  - name the correct downstream overlay or specialist skill.
- Vendor/runtime details belong in references or neighboring runtime skills, not the core BMAD trigger surface.
