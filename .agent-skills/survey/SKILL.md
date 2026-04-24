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
  version: "2.1.1"
  source: akillness/oh-my-skills
  modernization: 2026-04-12
  hardening: 2026-04-19
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
- **Negative signals (drop or mark risk):** spam-like description, irrelevant domain despite keyword match, stale/archived repo without strong justification, missing basic metadata.
- **Metadata minimum:** capture `license`, `pushed_at`, `archived`, and one-line fit rationale for every candidate you keep.

If search/extract tooling is degraded, fallback to direct GitHub API retrieval and mark provenance/risk explicitly instead of pretending confidence.

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
- Keep solution names deduplicated.
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
- `scripts/validate_survey_artifacts.py` — artifact-contract validator for survey output folders
