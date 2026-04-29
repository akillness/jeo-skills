# Platform Map: hourly-skill-candidates

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Hourly survey storage | `.survey/<slug>/` artifacts | `.survey/<slug>/` artifacts | `.survey/<slug>/` artifacts | Stable artifact contract + validator |
| Evidence serialization | markdown + JSON | markdown + JSON | markdown + JSON | `evidence.json` + required markdown headings |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Required keyword families | same 5-family sweep | same 5-family sweep | same 5-family sweep | `agentic/web-frontend/web-backend/cli/game` |
| Quality gate | license/freshness/signal checks | license/freshness/signal checks | license/freshness/signal checks | identical recommendation gate |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-merge validation | optional shell hooks | optional shell hooks | optional shell hooks | `validate_survey_artifacts.py` PASS |
| Research fallback capture | command stderr persisted | command stderr persisted | command stderr persisted | auditable query transcript |

## Platform Gaps
1. CLI/SDK schema differences (search fields, result payloads) can make lanes appear empty.
2. Headless cron environments need file-write fallbacks when URI-based desktop integrations fail.
3. Tooling parity differs, but survey artifact schema remains portable.
