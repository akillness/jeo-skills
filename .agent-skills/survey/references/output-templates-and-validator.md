# Output Templates and Validator for `survey`

Use this note when writing or checking `.survey/{slug}/` artifacts.

## Required output package

```text
.survey/{slug}/
├── triage.md
├── context.md
├── solutions.md
└── platform-map.md   # required for agent/tooling/platform topics
```

## Required headings

### `triage.md`

```markdown
# Triage
- Problem: ...
- Audience: ...
- Why now: ...
```

### `context.md`

```markdown
# Context: {project name}

## Workflow Context
...

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| ... | ... | ... |

## Current Workarounds
1. ...

## Adjacent Problems
- ...

## User Voices
- "..." — source
```

### `solutions.md`

```markdown
# Solution Landscape: {project name}

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| ... | ... | ... | ... | ... |

## Categories
...

## What People Actually Use
...

## Frequency Ranking
1. ...

## Key Gaps
- ...

## Contradictions
- ...

## Key Insight
...
```

### `platform-map.md`

```markdown
# Platform Map: {project name}

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| ... | ... | ... | ... | ... |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| ... | ... | ... | ... | ... |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| ... | ... | ... | ... | ... |

## Platform Gaps
1. ...
```

## Validator commands

Default survey artifact check:

```bash
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug>
```

Require `platform-map.md` plus its headings:

```bash
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug> --platform-topic
```

Require at least one survey provenance label somewhere in the artifacts:

```bash
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug> --require-provenance
```

Emit JSON for automation:

```bash
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug> --json
```

## What the validator checks
- target folder exists
- required files exist
- required headings exist in `triage.md`, `context.md`, and `solutions.md`
- `platform-map.md` exists and contains `Settings / Rules / Hooks / Platform Gaps` when `--platform-topic` is used
- provenance labels appear somewhere when `--require-provenance` is used

## Provenance labels accepted by the validator
- `direct page retrieval`
- `feed recovery`
- `browser-rendered retrieval`
- `indexed snippet`
- `browser-rendered indexed snippet`
- `thin evidence`

## Scope guardrails
- The validator checks structure and basic provenance only.
- It does **not** score whether the research is strategically good.
- Keep strategic judgment in the survey lanes and the frozen evaluation harness, not in the script.

## Run-slug guard (hourly automation)
- Always persist the current run slug once (for example `.survey/LATEST_SLUG`) and pass it explicitly to every generator script via environment variable or argv.
- Do not discover slug by listing `.survey/` directories; mixed historical folders can silently target the wrong run and contaminate artifacts.
- After generation, verify `git status --short` only touches `.survey/<current-slug>/` paths before proceeding to PR.
