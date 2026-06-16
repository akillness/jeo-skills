---
name: survey
description: >
  Run a bounded cross-platform landscape scan before planning or implementation.
  Use when the real job is researching what exists, how people work around it,
  which solutions repeat, or how platform/tooling patterns map before deciding
  what to build. Produce reusable `.survey/{slug}/` artifacts, validate the
  artifact contract, and route planning or execution outward only after the
  survey is done.
allowed-tools: Read Write Bash Grep Glob WebFetch
compatibility: >
  Best for repo-maintenance research, workflow discovery, agent-platform
  comparisons, and market/problem-space scans that should leave reusable markdown
  artifacts. This is research mode, not implementation mode.
license: MIT
metadata:
  tags: survey, landscape-scan, research, discovery, groundwork, omc, omx, ohmg, claude, codex, gemini, hooks, rules, settings
  platforms: Claude Code, Codex, Gemini-CLI, OpenCode
  keyword: survey
  version: "2.1.7"
  source: akillness/jeo-skills
  modernization: 2026-04-12
  hardening: 2026-04-27
---

# Survey

Use this skill when the job is **discovering the landscape before committing to a plan**.

`survey` stays portable by doing four things well:
1. freeze one bounded research question,
2. run the same 4 research lanes every time,
3. save reusable `.survey/{slug}/` artifacts with fixed headings,
4. validate the artifact contract before handing off to planning or execution.

Read these support docs before running unfamiliar survey work:
- [references/evidence-recovery-ladder.md](references/evidence-recovery-ladder.md)
- [references/platform-adapter-and-artifact-contract.md](references/platform-adapter-and-artifact-contract.md)
- [references/output-templates-and-validator.md](references/output-templates-and-validator.md)
- [references/keyword-sweep-and-relevance-rescue.md](references/keyword-sweep-and-relevance-rescue.md)
- [references/gh-search-empty-lane-recovery-playbook.md](references/gh-search-empty-lane-recovery-playbook.md)

## When to use this skill
- The user asks what exists, what people actually use, or what the current solution landscape looks like.
- A feature, workflow, tooling choice, or operational pain needs context before planning or implementation.
- The topic spans multiple platforms or vendors and needs a vendor-neutral comparison.
- Repo maintenance needs one bounded research pass before rewriting a skill, SOP, or reusable workflow.
- The right next step depends on understanding workarounds, repeated complaints, and structural gaps rather than writing code immediately.

## When not to use this skill
- **The solution is already known and the user wants implementation now** → implement or route to the execution skill directly.
- **The task is a small bug fix, narrow code change, or single-file edit** → do not force a survey first.
- **The user needs an architecture plan, task plan, or immutable spec more than market/workflow discovery** → `plan`, `jeo`, or `ralph`.
- **The request is mainly a live browse-and-click task** → use a browser/operator skill instead of pretending the work is a survey.

## Artifact contract
Keep the output package stable:

```text
.survey/{slug}/
├── triage.md
├── context.md
├── solutions.md
└── platform-map.md    # required for agent/tooling/platform topics
```

Required meanings:
- `triage.md` = problem, audience, why now
- `context.md` = workflow context, affected users, workarounds, adjacent problems, user voices
- `solutions.md` = solution list, categories, actual behavior, frequency, gaps, contradictions, key insight
- `platform-map.md` = `settings`, `rules`, `hooks`, `platform gaps` normalized across Claude / Codex / Gemini when relevant

Do not invent alternate filenames or free-form artifact shapes unless the user explicitly asks.
Use `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py <path>` after writing files whenever the survey output is meant to be reusable.

## Instructions

### Step 1: Classify one primary survey mode
Normalize the request before researching:

```yaml
survey_run:
  primary_mode: market-landscape | workflow-landscape | repo-maintenance | platform-comparison
  scope: narrow | medium | broad
  evidence_floor: primary-pages-first | indexed-snippets-allowed | thin-evidence-ok
  output_language: repo-default | user-language
  needs_platform_map: true | false
  reuse_existing: true | false | unknown
```

Mode guide:
- `market-landscape` → products, categories, competitors, packaging, complaints
- `workflow-landscape` → how people do the job now, workarounds, operational rituals
- `repo-maintenance` → bounded research to improve an existing skill, SOP, or reusable workflow
- `platform-comparison` → normalize Claude / Codex / Gemini differences into `settings`, `rules`, `hooks`

Choose **one primary mode** even if the topic touches more than one.

### Step 2: Freeze the evidence contract
Before searching, make the rules explicit:
- search broadly in English unless the user requires another language
- write artifacts in the repo default or user language
- keep claims source-backed
- label downgraded evidence clearly: `direct page retrieval`, `indexed snippet`, `browser-rendered indexed snippet`, `feed recovery`, or `thin evidence`
- keep the task in research mode only

Use the cheap-first recovery order from [references/evidence-recovery-ladder.md](references/evidence-recovery-ladder.md):
1. direct primary-page retrieval
2. stable official substitution
3. feed recovery
4. browser-rendered retrieval
5. indexed snippets
6. thin-evidence stop

### Step 3: Triage the request and check reuse
Parse:
- `what` — the pain point, idea, or capability to survey
- `who` — who feels it or operates the workflow
- `why` — why it matters now

Then check whether `.survey/{slug}/triage.md` already exists.
- If it exists and the user is present, ask whether to reuse or overwrite.
- In unattended loops, reuse when the existing artifact still matches the same question; overwrite only when the scope has clearly changed.

Write `triage.md` with:
- `# Triage`
- `- Problem:`
- `- Audience:`
- `- Why now:`

### Step 4: Run the 4 lanes in parallel
Keep the lanes separate even if one is thinner.

#### Lane A — Context
Return:
- `## Workflow Context`
- `## Affected Users`
- `## Current Workarounds`
- `## Adjacent Problems`
- `## User Voices`

#### Lane B — Solutions
Return:
- `## Solutions`
- `## Frequency Ranking`
- `## Categories`
- `## Curated Sources`

#### Lane C — Actual behavior
Return:
- `## What People Actually Use`
- `## Common Workarounds`
- `## Pain Points With Current Solutions`
- `## Sources`

#### Lane D — Alternatives or platform map
Default mode:
- JTBD alternatives
- indirect substitutes
- cross-industry parallels

For agent/tooling/platform topics, replace that with:
- `## Settings`
- `## Rules`
- `## Hooks`
- `## Platform Gaps`

Use `settings / rules / hooks` as the common layer whenever Claude / Codex / Gemini differences are relevant.

### Step 4.5: Apply a relevance gate for repo-maintenance surveys
When `primary_mode: repo-maintenance`, do not trust keyword hits at face value.

Run a compact gate before writing final recommendations:
- **Positive signals (keep):** clear relation to the target capability, recent maintenance, explicit license, concrete docs/examples.
- **Negative signals (drop or mark risk):** spam-like description, irrelevant domain despite keyword match, assessment/homework-only repos, stale/archived repos without strong justification, missing basic metadata, or unknown license without explicit justification.
- **Metadata minimum:** capture `license`, `pushed_at`, `archived`, `open_issues`, `forks`, and one-line fit rationale for every candidate you keep. If first-pass metadata returns null/unknown license (for example GraphQL `licenseInfo`), retry once via GitHub REST (`gh api repos/<owner>/<repo> --jq .license.spdx_id`) before classifying unknown-license. Unknown/missing license after fallback should be excluded by default unless a concrete exception rationale is documented. If `open_issues`/`forks` are unavailable from the first pass, hydrate once via `gh api repos/<owner>/<repo> --jq '{open_issues: .open_issues_count, forks: .forks_count}'` and record retrieval provenance.
- **Freshness floor (recommendation-grade keep list):** exclude candidates whose latest `pushed_at` is older than 24 months by default. Keep stale candidates only with explicit exception rationale and risk note.

If search/extract tooling is degraded, fallback to direct GitHub API retrieval and mark provenance/risk explicitly instead of pretending confidence.

### Step 4.6: Hourly candidate sweep (repo-maintenance cron loops)
When the survey is part of a recurring skill-maintenance loop, run one explicit keyword sweep before final recommendations.

Required keyword families:
- `agentic ai skill`
- `web frontend skill`
- `web backend skill`
- `cli open source skill`
- `game development skill`

Execution rules:
- Use a recency-first query window for hourly runs: default to `pushed` within the last 24h~7d, then widen only through documented recovery stages.
- Keep the raw keyword scan as discovery evidence (usually `browser-rendered retrieval` when done through search pages).
- Apply the Step 4.5 relevance gate before keeping any candidate.
- For each kept candidate, record at least: `license`, `pushed_at/updated`, `archived`, `open_issues`, `forks`, and one-line fit rationale.
- For recommendation-grade keeps, apply a default freshness floor (`pushed_at` within the last 24 months). If kept despite staleness, document exception rationale and explicit risk.
- Apply a default signal floor for recommendation-grade keeps: require at least one traction signal (for example, stars >= 3, or explicit maintainer/community adoption evidence with rationale). Keep broad discovery evidence even when the recommendation-grade list is stricter.
- For the `agentic ai skill` lane, treat generic personal catch-all repositories named only like `*/skills` as low-fit by default unless there is explicit workflow documentation + traction; keep them in raw evidence but do not promote to TOP recommendations without an exception rationale.
- Apply a negation-aware intent guard before recommendation-grade promotion: when lane-intent token overlap appears only inside explicit negation phrases (for example `no cli`, `without cli`, `not a cli`, `non-cli`), classify as `low-fit` by default, keep in raw discovery evidence, and require an explicit exception rationale to promote.
- If direct web search/extract tooling fails (auth/rate-limit/transport), switch to GitHub-native retrieval (`gh search` + `gh api` or `gh repo view`) and label provenance clearly.
- Guard for GH CLI JSON-field drift in unattended loops: prefer `gh search repos --json fullName,...` (or compose identity from `owner` + `name`) instead of unsupported fields like `nameWithOwner`; if a field mismatch occurs, preserve stderr in evidence and rerun with supported fields before final lane status.
- Guard for `gh search repos` empty-success payloads in unattended loops: if exit code is 0 but payload is unexpectedly `[]` (or trivially empty) for a known-populated probe/query, treat this as degraded transport and rerun via GitHub REST search before final lane status.
- For the REST fallback path, prefer endpoint form `gh api "search/repositories?q=<query>&per_page=<n>&sort=updated&order=desc"` and capture stderr artifacts; avoid relying on incompatible forms that can 404 in some environments.
- In markdown artifacts validated with `--require-provenance`, map GitHub search result evidence to validator-supported labels (`indexed snippet` for search-result listings, `direct page retrieval` for repo/API detail fetches) instead of ad-hoc labels like `github search api`.
- If keyword hits are noisy or sparse, run lane-specific recovery templates from `references/keyword-sweep-and-relevance-rescue.md` before finalizing recommendations.
- Use objective recovery triggers after the primary query (`raw_count < 8`, `kept_count == 0`, or `zero_star_raw/raw_count >= 0.70`) so lane rescue is deterministic in unattended cron loops.
- **Metric integrity gate (mandatory):** after each recovery query selection, recompute lane metrics from the final selected result set before writing artifacts (`raw_count`, `zero_star_raw`, `median_stars_raw`, `kept_count`). Never emit impossible combinations like `kept_count > raw_count`.
- If a lane still has `raw_count == 0` after stage-1 recovery, run exactly one documented stage-2 recovery query for that lane before finalizing `lane_status`.
- For noisy lanes where raw hits exist but recommendation-grade keeps remain `kept_count == 0` after stage-1 recovery, run exactly one documented stage-2 recovery query before finalizing degraded status.
- If a lane still ends with `raw_count == 0` after documented recovery, set/report `degraded_causes` with explicit `no-results` (do not leave it empty).
- Recommendation thresholds after relevance gate: aim for at least 1 keep per lane where feasible, and `cli open source skill` should target 3+ kept entries for spotlight quality.
- Emit explicit lane-level status in markdown (`lane_status: pass|degraded`). If thresholds are missed, keep evidence and report `degraded_causes` with compact taxonomy (`license`, `stale`, `low-fit`, `archived`, `low-signal`, `no-results`) plus examples/counts.
- When a lane remains `raw_count == 0` even after the documented stage-2 recovery query, set and report `degraded_causes` including `no-results` (do not leave degraded causes empty).
- Alongside `lane_status`, include compact lane-health metrics (`kept_count`, `raw_count`, `median_stars_raw`, `zero_star_raw`) so reviewers can track quality drift across hourly runs.
- Add a cross-lane concentration check for recommendation-grade keeps: if `recommended_lane_count < 2`, mark the run as `single_lane_concentration: true`, keep degraded-lane evidence explicit, and avoid claiming broad coverage health.
- Add a cross-lane recommendation dedup gate before final ranking: preserve raw discovery evidence unchanged, but compute a deduplicated recommendation-grade set keyed by repository identity (`fullName` or `owner/name`) and report both raw and dedup coverage metrics.

Reference: [references/keyword-sweep-and-relevance-rescue.md](references/keyword-sweep-and-relevance-rescue.md)

### Step 5: Synthesize the artifacts
Keep the written files compact and schema-stable.
- Use the exact markdown templates in [references/output-templates-and-validator.md](references/output-templates-and-validator.md).
- Keep the required filenames and headings unchanged.
- Preserve honest provenance labels when evidence is weak.
- For platform topics, make `platform-map.md` explicit instead of burying platform differences in `solutions.md`.
- For `repo-maintenance`, show why each kept candidate passed the relevance gate (fit + metadata + risk).

### Step 6: Validate the artifact contract
Run the validator after writing the files:

```bash
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug>
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug> --platform-topic
```

Use `--platform-topic` when `platform-map.md` is required.
If provenance labels matter for the run, also use:

```bash
python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/<slug> --require-provenance
```

If the validator fails, fix the artifact files before handing off to planning or implementation.

### Step 7: End with a factual survey summary
Return a short summary only after files are written and validated:
- `## Survey complete: {slug}`
- 1-2 context bullets including the main workaround
- 1-2 solution-landscape bullets including the key insight and key gap
- file list for the generated artifacts

Do **not** slide into planning or implementation unless the user explicitly asks for the next step.

## Output rules
- Facts first, recommendations second only if requested.
- One bounded question per survey artifact.
- Keep solution names deduplicated, and deduplicate recommendation-grade repositories across lanes before final ranking while preserving raw evidence.
- Preserve evidence labels when sources are weak or indirect.
- Keep the output artifact schema identical across platforms.
- Route architecture/planning/execution work outward once the survey is done.

## Examples

### Example 1: Repo-maintenance survey
**Input**
> survey which existing skill in this repo is the best bounded maintenance target next

**Good output direction**
- mode: `repo-maintenance`
- checks existing `.survey/{slug}` first
- uses repo-local graph/wiki evidence plus any necessary primary-source retrieval
- writes triage/context/solutions and a factual summary
- validates the output folder before any skill rewrite starts

### Example 2: Platform comparison
**Input**
> survey how Claude Code, Codex, and Gemini CLI differ for hooks, approvals, and research workers

**Good output direction**
- mode: `platform-comparison`
- writes `platform-map.md`
- normalizes differences into `settings`, `rules`, `hooks`
- validates with `--platform-topic`
- records portability gaps without treating vendor-specific features as the artifact contract

## Best practices
1. Keep the front door small: classify mode, freeze evidence rules, run the 4 lanes, validate, and save the artifacts.
2. Push slow-changing retrieval/platform/template detail into references instead of bloating the main skill.
3. Prefer direct primary sources, but label every downgrade honestly.
4. Preserve the same artifact filenames and headings across Claude / Codex / Gemini runs.
5. If evidence is thin, narrow the claim instead of bluffing certainty.
6. Treat hook systems as accelerators around the validator, not replacements for checked-in artifact rules.

## References
- `references/evidence-recovery-ladder.md` — fallback ladder and provenance labels for weak search/extract environments
- `references/platform-adapter-and-artifact-contract.md` — portability rules for `settings`, `rules`, `hooks`, and identical artifact output across platforms
- `references/output-templates-and-validator.md` — exact file templates plus validator usage for `.survey/{slug}/`
- `references/keyword-sweep-and-relevance-rescue.md` — required five-keyword sweep and noisy-query rescue gate for recurring repo-maintenance loops
- `scripts/validate_survey_artifacts.py` — artifact-contract validator for survey output folders
