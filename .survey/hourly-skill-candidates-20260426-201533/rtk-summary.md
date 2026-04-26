# RTK Summary (hourly-skill-candidates-20260426-201533)

generated_at: 2026-04-26T20:18:00.547451Z
provenance: direct page retrieval

## triage.md
- rtk_exit_code: 0

# Triage
- Problem: Hourly repo-maintenance survey loop needs a low-risk, evidence-backed ratchet to improve candidate quality consistency.
- Audience: Maintainers of akillness/oh-my-skills hourly skill-survey automation.
- Why now: Recurring hourly runs continue to generate noisy discovery lanes, requiring stronger deterministic quality guards.

## context.md
- rtk_exit_code: 0

# Context
## Workflow Context
Hourly loop: sync repo -> survey keyword lanes -> collect evidence -> choose one low-risk skill change -> PR + self-review + merge.

## Affected Users
- Maintainers reviewing hourly PRs
- Agents depending on stable survey quality gates

## Current Workarounds
- Manual triage of noisy lanes
- Repeated ad-hoc tweaks to degraded-cause reporting

## Adjacent Problems
- Open-PR accumulation from partially merged hourly runs
- Recommendation quality drift when raw discovery is dominated by low-signal repos

## User Voices
- Requires survey-based candidate search each run with evidence
- Requires PR lifecycle to include review and merge when quality gate passes

## Lane Health Snapshot
- agentic ai skill: lane_status=pass, kept_count=3, raw_count=20, median_stars_raw=0, zero_star_raw=12
- web frontend skill: lane_status=degraded, kept_count=0, raw_count=4, median_stars_raw=0, zero_star_raw=3
- web backend skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- cli open source skill: lane_status=degraded, kept_count=0, raw_count=0, median_stars_raw=0, zero_star_raw=0
- game development skill: lane_status=pass, kept_count=1, raw_count=20, median_stars_raw=2, zero_star_raw=10
- single_lane_concentration: false (recommended_lane_count=2)
- Provenance: indexed snippet (gh search) + direct page retrieval (gh api repos/<owner>/<repo>)

## solutions.md
- rtk_exit_code: 0

# Solutions
## Solution List
1. Ratchet raw-quality collapse trigger in keyword sweep reference (selected).
2. Keep current gates unchanged and rely on manual reviewer judgment.
3. Increase minimum star threshold globally (higher risk of false negatives).

## Categories
- selected: low-risk documentation/process ratchet
- fallback: no-change/manual-only
- high-risk: stricter threshold policy

## What People Actually Use
- In practice, maintainer loops keep deterministic guardrails in survey reference docs and avoid code-path churn.
- GitHub search + gh api metadata fallback is the stable data path in unattended cron runs.

## Frequency Ranking
1) deterministic guardrails in reference docs
2) degraded-cause reporting refinements
3) threshold policy overhauls

## Key Gaps
- Existing gates can still pass noisy raw discovery if counts look healthy but quality is low.

## Contradictions
- Higher strictness improves precision but may reduce discovery breadth; keep ratchet narrow and reversible.

## Key Insight
- Aggregate zero-star ratio was 0.57; add an explicit collapse trigger to prevent count-only false confidence.

## Curated Sources
- agentic ai skill | AbdelhakRazi/flutter-bloc-clean-architecture-skill | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill | provenance: indexed snippet
- agentic ai skill | iwe-org/skills | https://github.com/iwe-org/skills | provenance: indexed snippet
- game development skill | tjboudreaux/cc-plugin-unity-gamedev | https://github.com/tjboudreaux/cc-plugin-unity-gamedev | provenance: indexed snippet

## platform-map.md
- rtk_exit_code: 0

# Platform Map
## Settings
- Keyword families fixed to five required lanes for hourly repo-maintenance surveys.
- Rolling freshness floor: pushed_at within 24 months.

## Rules
- Recommendation-grade keep requires non-archived, known license, freshness, and basic signal.
- Degraded lanes must carry explicit degraded causes.

## Hooks
- gh search repos for indexed discovery.
- gh api repos/<owner>/<repo> for license fallback.

## Platform Gaps
- Search quality drift can hide behind raw-count metrics without cross-lane quality checks.

## Provenance
- indexed snippet
- direct page retrieval
