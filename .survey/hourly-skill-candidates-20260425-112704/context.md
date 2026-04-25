# Context: oh-my-skills hourly survey run hourly-skill-candidates-20260425-112704

## Workflow Context
- Hourly cron run executed five mandatory keyword families and persisted lane evidence to `.survey/hourly-skill-candidates-20260425-112704/evidence.json`.
- Retrieval path used GitHub-native search/API with provenance label `direct page retrieval` because the task is repository-centric.
- Backlog check found one open PR (`#169`) requiring review/merge decision in this run.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | approves quality gates and merge decisions | advanced |
| Automation operator | executes recurring survey pipeline and artifacts | advanced |
| Skill consumers | rely on accurate, low-noise skill recommendations | mixed |

## Current Workarounds
1. Use signal/freshness/license gates to suppress low-quality keyword hits.
2. Add lane-level health metrics and degraded-cause taxonomy in artifacts.
3. Use direct markdown file writes when Obsidian CLI headless URI calls fail.

## Adjacent Problems
- Agentic keyword lane has many personal `skills` repos with weak traction, inflating raw counts.
- CLI lane can appear healthy while other lanes degrade from low-fit or missing license.
- Branch/PR collisions can happen in hourly loops without unique timestamped branch names.

## User Voices
- "Survey contract strictness ... include provenance labels in markdown text (not only in JSON)." — `.agent-skills/survey/SKILL.md` (direct page retrieval)
- "Apply a default signal floor ... stars >= 3 ... document exceptions." — `.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md` (direct page retrieval)
- "Merge only if quality gates pass; otherwise leave PR open with failure analysis." — `oh-my-skills-hourly-survey-pr-loop` skill (direct page retrieval)

### Lane Health Snapshot
- agentic ai skill: lane_status=pass, kept_count=6, raw_count=33, median_stars_raw=0, zero_star_raw=21, degraded_causes=low-signal:27, license:20 (provenance: direct page retrieval)
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=4, median_stars_raw=0.0, zero_star_raw=3, degraded_causes=license:3, stale:1, low-signal:3 (provenance: direct page retrieval)
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0, degraded_causes=none (provenance: direct page retrieval)
- cli open source skill: lane_status=degraded, kept_count=1, raw_count=1, median_stars_raw=9062, zero_star_raw=0, degraded_causes=none (provenance: direct page retrieval)
- game development skill: lane_status=pass, kept_count=1, raw_count=30, median_stars_raw=0.0, zero_star_raw=17, degraded_causes=stale:14, license:21, low-signal:22, archived:1 (provenance: direct page retrieval)
