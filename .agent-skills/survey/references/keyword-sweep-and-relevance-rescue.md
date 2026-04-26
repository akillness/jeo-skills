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

- `license`
- `pushed_at` or `updated_at`
- `archived`
- one-line fit rationale

Positive keep signals:

- Clearly related to the target capability
- Recently maintained
- Explicit license
- Concrete docs/examples

Freshness default for recommendation-grade keeps:

- Keep if `pushed_at` is within the last 24 months.
- Otherwise, drop by default or keep only with an explicit exception rationale and risk note.

Signal floor default for recommendation-grade keeps:

- Preserve broad discovery evidence, but do not promote low-traction candidates by default.
- Require at least one traction signal for keeps (for example, stars >= 3, or explicit maintainer/community adoption evidence with rationale).
- If a lane is sparse and a low-signal keep is still needed, document the exception rationale and risk note explicitly in markdown.

Drop or risk-mark signals:

- Keyword-only match but wrong domain
- Generic personal catch-all repos (especially `*/skills`) without concrete workflow docs and traction
- Assessment/homework/demo-only repos with low transferability
- Archived/stale without strong reason
- Missing basic metadata or unknown license without exception note
- Spam-like or boilerplate descriptions

## Rescue path for sparse/noisy lanes

Trigger a recovery pass when **any** of the following is true after the primary keyword query:

- `raw_count < 8`
- `kept_count == 0`
- `zero_star_raw / raw_count >= 0.70` (for `raw_count > 0`)
- query transport degrades (auth/rate-limit/empty payload)

If direct web search/extract is degraded or returns mostly noise:

1. Switch to GitHub-native retrieval (`gh search repos`, `gh api`, `gh repo view`).
2. Add curated seed repositories relevant to the target capability.
3. Apply the same relevance gate to seed candidates.
4. Label provenance explicitly (`direct page retrieval`, `browser-rendered retrieval`, etc.).
5. Preserve raw discovery evidence even when all recommendation-grade keeps are filtered.

### Lane-level recovery templates (hourly default)

Use these as fallback queries after the primary keyword family returns sparse/noisy matches:

- `agentic ai skill` lane
  - `ai agent framework skills automation stars:>200 pushed:>=2024-01-01`
- `web frontend skill` lane
  - Stage 1: `frontend ui component design system stars:>300 pushed:>=2024-01-01`
  - Stage 2 (deterministic escalation when Stage 1 keeps remain `kept_count == 0` due to noisy/low-signal hits): `frontend engineering workflow design system toolkit stars:>120 pushed:>=2024-01-01`
- `web backend skill` lane
  - Stage 1: `backend api framework observability stars:>300 pushed:>=2024-01-01`
  - Stage 2 (deterministic escalation when Stage 1 still has `raw_count == 0`): `backend developer platform api template stars:>150 pushed:>=2024-01-01`
- `cli open source skill` lane
  - `command line tool developer productivity stars:>200 pushed:>=2024-01-01`
  - `github cli terminal tool stars:>200 pushed:>=2024-01-01`
- `game development skill` lane
  - `game engine tooling pipeline stars:>150 pushed:>=2024-01-01`

Stage-2 escalation rule:
- If a lane remains `raw_count == 0` after stage-1 recovery, run exactly one stage-2 query template for that lane before finalizing `lane_status`.
- For lanes that are noisy (raw hits exist but recommendation-grade keeps remain `kept_count == 0` after stage-1), run exactly one stage-2 query template before finalizing degraded status.
- Keep provenance labels and apply the same relevance + metadata + signal/freshness gate to stage-2 hits.

### Minimum recommendation thresholds (after relevance gate)

- At least 1 recommendation-grade keep per lane where feasible.
- `cli open source skill` lane target: 3+ kept entries for spotlight quality.
- For each lane, emit explicit `lane_status` in markdown: `pass` or `degraded`.
- If a lane is below threshold, keep discovery evidence and report `degraded_causes` using a compact taxonomy: `license`, `stale`, `low-fit`, `archived`, `low-signal`, `no-results` (include counts or concrete examples).
- When a lane remains `raw_count == 0` after documented recovery, always include `no-results` explicitly in markdown (do not leave degraded causes empty).
- Add cross-lane concentration metrics for recommendation-grade keeps: `recommended_lane_count` and `single_lane_concentration` (`true` when recommended keeps are concentrated in a single lane).

## Reporting checklist

Before final recommendations:

- [ ] All five keyword families executed
- [ ] Raw discovery evidence saved
- [ ] Relevance gate applied to kept candidates
- [ ] Metadata minimum recorded for each kept candidate
- [ ] Lane-level `lane_status` (`pass|degraded`) included in markdown summary
- [ ] For degraded lanes, `degraded_causes` (`license|stale|low-fit|archived|low-signal`) reported with examples/counts
- [ ] Provenance labels present
- [ ] Risks for noisy or sparse lanes stated explicitly
