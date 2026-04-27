# Platform Map: hourly transport-error path portability ratchet

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact path recording | Agent-managed JSON/markdown outputs | Agent-managed JSON/markdown outputs | Agent-managed JSON/markdown outputs | Keep `.survey/<slug>/...` relative path contract |
| Search transport fallback | May degrade on API key/rate issues | May degrade on API key/rate issues | May degrade on API key/rate issues | Persist fallback cause + deterministic error log path |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | Use validator allowlist labels | Use validator allowlist labels | Use validator allowlist labels | `direct page retrieval` / `indexed snippet` labels required |
| Error-log path form | Prefer repo-relative `.survey/<slug>/...` | Prefer repo-relative `.survey/<slug>/...` | Prefer repo-relative `.survey/<slug>/...` | Forbid host-absolute path in new hourly artifacts |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR validation | Run survey artifact validator | Run survey artifact validator | Run survey artifact validator | Ensure heading + provenance + path contract pass |
| Post-fallback logging | Persist transport cause and log path | Persist transport cause and log path | Persist transport cause and log path | Keep fallback evidence diffable cross-run |

## Platform Gaps
1. Some environments expose different absolute workspace prefixes, so allowing absolute path storage can create cross-platform noise.
2. Transport failure surface is similar, but path normalization policy must be explicitly documented to remain consistent.
