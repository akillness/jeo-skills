# Platform Map: gh-search empty payload fallback ratchet

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Repo search transport | CLI/web toolchain may degrade | CLI/web toolchain may degrade | CLI/web toolchain may degrade | Guard empty payload and switch to API fallback |
| Error-log contract | Artifact-based evidence | Artifact-based evidence | Artifact-based evidence | Keep repo-relative `.survey/<slug>/web-search-error.log` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Empty search result handling | Do not accept `[]` as healthy by default | Same | Same | Retry with deterministic API endpoint and label provenance |
| Candidate promotion | Relevance + freshness + license + signal gates | Same | Same | Keep degraded causes explicit (`license|stale|low-fit|archived|low-signal|transport`) |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Survey lane execution | Run primary + staged recovery | Run primary + staged recovery | Run primary + staged recovery | Add empty-payload guard before final lane_status |
| Pre-PR quality gate | Validate artifacts | Validate artifacts | Validate artifacts | Require validator PASS with provenance labels |

## Platform Gaps
1. Search backends can differ in behavior; one platform may emit empty-success payloads while another returns populated search results.
2. Fallback endpoint syntax compatibility (`gh api "search/repositories?..."`) is not consistently documented in existing repo guidance.
