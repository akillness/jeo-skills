# Keyword Sweep and Relevance Rescue (Hourly Repo-Maintenance)

Use this guide when a `survey` run is part of recurring skill maintenance (for example, hourly cron loops).

## Required keyword families (hourly maintenance loop)

Run all five keyword families before final recommendations:

1. `agentic ai skill`
2. `web frontend skill`
3. `web backend skill`
4. `cli open source skill`
5. `game development skill`

Keep the raw sweep output as discovery evidence.

## Why this exists

Broad keyword sweeps improve recall but can produce noisy or sparse results.
Without a relevance gate, low-fit repositories pollute recommendations.
Without a rescue path, empty lanes can be misread as ecosystem absence.

## Compact relevance gate

For each candidate you keep, capture at minimum:

- `license` (normalize payload shapes first: `license.spdx_id`, `license.spdxId`, `license.key`, `license.name`; if still null/unknown or empty-object like `{"key":"","name":""}`, enrich once with `gh repo view <owner>/<repo> --json licenseInfo` and then fallback to `gh api repos/<owner>/<repo> --jq .license.spdx_id`)
- `pushed_at` or `updated_at`
- `archived`
- `open_issues`
- `forks`
- one-line fit rationale
- if `open_issues`/`forks` are unavailable in first-pass metadata, hydrate once via `gh api repos/<owner>/<repo> --jq '{open_issues: .open_issues_count, forks: .forks_count}'`

Positive keep signals:

- Clearly related to the target capability
- Recently maintained
- Explicit license
- Concrete docs/examples

Freshness default for recommendation-grade keeps:

- Keep if `pushed_at` is within the last 24 months.
- Compute and record `months_since_push` (or equivalent age bucket) for each recommendation-grade keep candidate so stale filtering is auditable.
- Otherwise, drop by default or keep only with an explicit exception rationale and risk note.
- If a lane loses keeps primarily due to freshness, include `stale` in `degraded_causes` with a count/example in markdown.

Signal floor default for recommendation-grade keeps:

- Preserve broad discovery evidence, but do not promote low-traction candidates by default.
- Require at least one traction signal for keeps (for example, stars >= 3, or explicit maintainer/community adoption evidence with rationale).
- If a lane is sparse and a low-signal keep is still needed, document the exception rationale and risk note explicitly in markdown.

Drop or risk-mark signals:

- Keyword-only match but wrong domain
- Lane-intent token appears only in explicit negation phrases (for example `no cli`, `without cli`, `not a cli`, `non-cli`) and no exception rationale is documented
- Generic personal catch-all repos (especially `*/skills`) without concrete workflow docs and traction
- Assessment/homework/demo-only repos with low transferability
- Archived/stale without strong reason
- Missing basic metadata or unknown license without exception note
- Spam-like or boilerplate descriptions
- CLI negation patterns (`no cli`, `without cli`, `not a cli`, `non-cli`) unless explicit exception rationale is documented

Lane-intent token-overlap gate (recommendation promotion guard):

- Build a compact lane token set (for example: `agentic|ai|skill`, `frontend|ui|design|component`, `backend|api|framework|observability`, `cli|terminal|command`, `game|engine|gamedev|pipeline`).
- For recommendation-grade keeps, require at least one lane-intent token (or documented synonym) in `fullName` or repository description.
- If no overlap, keep the repository in raw discovery evidence but classify it as `low-fit` for promotion decisions.
- Record at least one concrete off-topic example when this guard filters candidates, so reviewers can audit why precision improved.

## Rescue path for sparse/noisy lanes

Trigger a recovery pass when **any** of the following is true after the primary keyword query:

- `raw_count < 8`
- `kept_count == 0`
- `zero_star_raw / raw_count >= 0.70` (for `raw_count > 0`)
- `aggregate_zero_star_ratio >= 0.50` across all five keyword lanes (cross-lane raw-quality collapse trigger)
- query transport degrades (auth/rate-limit/empty payload)

If direct web search/extract is degraded or returns mostly noise:

1. Switch to GitHub-native retrieval (`gh search repos`, `gh api`, `gh repo view`).
2. For `gh search repos --json`, prefer supported fields like `fullName` (or compose identity from `owner` + `name`) instead of unsupported fields such as `nameWithOwner`; when schema mismatch happens, persist stderr in evidence and rerun with supported fields before final lane status.
3. Guard for `gh search repos` empty-success payloads (`[]` with exit 0) using a known-populated probe/query; when triggered, mark lane retrieval as degraded and rerun via GitHub REST search endpoint form (`gh api "search/repositories?q=<query>&per_page=<n>&sort=updated&order=desc"`).
4. Add curated seed repositories relevant to the target capability.
5. Apply the same relevance gate to seed candidates.
6. Label provenance explicitly (`direct page retrieval`, `browser-rendered retrieval`, etc.).
7. Preserve raw discovery evidence even when all recommendation-grade keeps are filtered.

### Lane-level recovery templates (hourly default)

Use these as fallback queries after the primary keyword family returns sparse/noisy matches.

Before running fallback queries, compute a rolling freshness floor once per run (24 months) and reuse it in every `pushed:` qualifier:

```bash
ROLLING_CUTOFF=$(python3 - <<'PY'
from datetime import datetime, timedelta
print((datetime.utcnow() - timedelta(days=730)).strftime('%Y-%m-%d'))
PY
)
```

Then substitute `${ROLLING_CUTOFF}` in templates:

- `agentic ai skill` lane
  - `ai agent framework skills automation stars:>200 pushed:>=${ROLLING_CUTOFF}`
- `web frontend skill` lane
  - Stage 1: `frontend ui component design system stars:>300 pushed:>=${ROLLING_CUTOFF}`
  - Stage 2 (deterministic escalation when Stage 1 keeps remain `kept_count == 0` due to noisy/low-signal hits): `frontend engineering workflow design system toolkit stars:>120 pushed:>=${ROLLING_CUTOFF}`
- `web backend skill` lane
  - Stage 1: `backend api framework observability stars:>300 pushed:>=${ROLLING_CUTOFF}`
  - Stage 2 (deterministic escalation when Stage 1 still has `raw_count == 0`): `backend developer platform api template stars:>150 pushed:>=${ROLLING_CUTOFF}`
- `cli open source skill` lane
  - `command line tool developer productivity stars:>200 pushed:>=${ROLLING_CUTOFF}`
  - `github cli terminal tool stars:>200 pushed:>=${ROLLING_CUTOFF}`
- `game development skill` lane
  - `game engine tooling pipeline stars:>150 pushed:>=${ROLLING_CUTOFF}`

Stage-2 escalation rule:
- If a lane remains `raw_count == 0` after stage-1 recovery, run exactly one stage-2 query template for that lane before finalizing `lane_status`.
- For lanes that are noisy (raw hits exist but recommendation-grade keeps remain `kept_count == 0` after stage-1), run exactly one stage-2 query template before finalizing degraded status.
- Keep provenance labels and apply the same relevance + metadata + signal/freshness gate to stage-2 hits.
- If `raw_count == 0` after Stage 2, set `degraded_causes` to include `no-results` (alongside other causes) so empty lanes remain explicit in run reports.

### Minimum recommendation thresholds (after relevance gate)

- At least 1 recommendation-grade keep per lane where feasible.
- `cli open source skill` lane target: 3+ kept entries for spotlight quality.
- For each lane, emit explicit `lane_status` in markdown: `pass` or `degraded`.
- If a lane is below threshold, keep discovery evidence and report `degraded_causes` using a compact taxonomy: `license`, `stale`, `low-fit`, `archived`, `low-signal`, `no-results` (include counts or concrete examples).
- If a lane still has `raw_count == 0` after stage-2 recovery, include `no-results` explicitly (never leave degraded causes empty for degraded lanes).
- Add cross-lane concentration metrics for recommendation-grade keeps: `recommended_lane_count` and `single_lane_concentration` (`true` when recommended keeps are concentrated in a single lane).
- Before final ranking, compute a deduplicated recommendation-grade set keyed by repository identity (`fullName` or `owner/name`) and report both raw and dedup recommendation coverage metrics.

## Open-PR first gate (hourly hard rule)

Apply this sequence at run start before any new branch/PR work:

- Query open PRs immediately (`gh pr list --state open`).
- If open PR count is `>=1`, **do not create a new branch/PR** in that run.
- Instead, triage existing PRs first: checks, conflict status, review state.
- If a PR is mergeable and checks are green, merge it first.
- If a PR is conflicting/duplicate, leave a blocker comment, close it, and clean its remote branch.
- Only when open PR count becomes `0` may the run create a new branch and PR.

## Checks-degraded escalation (PR lifecycle guard)

Use backlog-aware handling before opening a new hourly PR:

- Sample at least the two most recent carry-forward PRs with `gh pr checks` before deciding mode.
- If open PR backlog is high (default threshold: `>=10`) and sampled carry-forward PRs show `no checks reported`, switch to checks-degraded mode for this run: generate artifacts + blocker report only, and do not open an additional PR.
- If backlog is below the threshold, continue normal PR creation cadence, but keep merge gating strict.
- If sampled carry-forward PRs are also `DIRTY` or `CONFLICTING` while checks are absent, keep this run in blocker-report mode and avoid same-run conflict resolution churn.

When survey artifacts are valid but GitHub reports `no checks reported` on the current PR branch:

- Treat as hard blocker for merge in unattended hourly runs.
- Post a PR comment with exact blocker string and remediation steps (enable required checks or re-run workflows).
- Keep this run in `merge-blocked` state; do not force-merge.
- Record `merge_blocked_reason: no-checks-reported` in the final run report.

Graphify compatibility note for unattended runs:

- `graphify save-result` currently requires `--question` and `--answer`; do not pass unsupported flags such as `--input`.
- If command contract mismatch occurs, persist stderr under the run folder and generate `graphify-refined.json` fallback from `evidence.json` so PR packaging still contains auditable knowledge artifacts.

## Reporting checklist

Before final recommendations:

- [ ] All five keyword families executed
- [ ] Raw discovery evidence saved
- [ ] Relevance gate applied to kept candidates
- [ ] Metadata minimum recorded for each kept candidate
- [ ] Lane-level `lane_status` (`pass|degraded`) included in markdown summary
- [ ] For degraded lanes, `degraded_causes` (`license|stale|low-fit|archived|low-signal|low-signal-saturation|no-results`) reported with examples/counts
- [ ] Recommendation section reports both raw and deduplicated cross-lane coverage metrics
- [ ] Provenance labels present
- [ ] Risks for noisy or sparse lanes stated explicitly
