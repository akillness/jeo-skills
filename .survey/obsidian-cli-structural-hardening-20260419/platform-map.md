# Platform Map: obsidian-cli structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Runtime target | Prefer explicit note-automation intent before assuming desktop control | Same | Same | `provider=obsidian-cli | obsidian-uri | plugin-api | headless | filesystem` |
| Desktop availability | Must know whether local desktop Obsidian is available | Same | Same | `desktop_required=true/false` |
| Vault targeting | Prefer explicit vault and note selectors | Same | Same | `vault.selector=id|name`, `note.selector=path|file|active` |
| Plugin prerequisites | Must check Daily notes / Unique note creator before using dependent flows | Same | Same | `plugin_requirements` |
| Output shape | Prefer structured command output or callback contract | Same | Same | `capture.mode=create|append|read|search|command|developer`, `output_shape=text|clipboard|callback|structured` |
| Fallback backend | Do not force desktop-only flows into headless/server contexts | Same | Same | `fallback.note_backend=filesystem|headless|adjacent-cli` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Desktop-only truthfulness | Do not present CLI as a generic note backend | Same | Same | `obsidian-cli` only when desktop Obsidian is the intended runtime |
| Deterministic targeting | Avoid active-vault/active-file defaults for agent runs | Same | Same | require explicit `vault=` when ambiguity matters; prefer exact `path=` |
| Plugin-aware safety | Check plugin prerequisites before `daily` / `unique` | Same | Same | gate plugin-dependent actions |
| URI safety | Encode params and respect desktop-only panes/callback behavior | Same | Same | URI normalization and validation |
| Route-outs | Send sync-only or unattended jobs elsewhere | Same | Same | route to Obsidian Headless, filesystem writes, or adjacent CLI notes tools |
| Developer command caution | Treat `plugin:reload`, `eval`, `dev:screenshot`, `devtools` as stateful | Same | Same | privileged developer-mode operations |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Preflight | classify job and environment before choosing CLI vs URI | same | same | normalize provider, vault, note target, plugin requirements |
| Validation | check desktop readiness, CLI enabled, exact path/vault, URI encoding | same | same | readiness + targeting validation |
| Execution | run CLI one-shot command, open URI, or downgrade to filesystem/headless route | same | same | provider-specific execution hook |
| Callback / handoff | capture `x-success` / `x-error` payloads when URI flow is used | same | same | callback handoff hook |
| Post-action | record stateful dev actions and avoid promising UI state changes when using filesystem fallback | same | same | post-run truthfulness hook |

## Platform Gaps
- None of the agent platforms change the underlying Obsidian constraint: the first important branch is **desktop control vs URI handoff vs plugin/API extension vs headless route-out**.
- The gap is not platform-specific orchestration syntax. The gap is a missing front-door contract inside the skill itself.
- Because no dedicated `obsidian-headless` or `local-rest-api` skill exists in this repo yet, `obsidian-cli` must explicitly document route-outs without pretending those workflows are covered in depth.
