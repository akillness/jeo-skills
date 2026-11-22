# Local reporting

## Capture and cache

The agent collects Scenario data through MCP; the Python 3.10+ helper has no network client. Save
the complete structured response, not a preview, in an envelope:

```json
{
  "query": {
    "team_id": "<selected team>",
    "project_id": "<context project>",
    "scope": "team",
    "start_date": "2026-06-01T00:00:00Z",
    "end_date": "2026-08-31T23:59:59.999Z",
    "include": ["modelUsages.daily", "entities"],
    "response_format": "json"
  },
  "fetched_at": "<actual retrieval timestamp with timezone>",
  "response": "Replace this string with the complete MCP usage object"
}
```

Use a private directory outside source control. `analytics.py` below means the shipped script's
resolved path; `connection-a` is a non-secret authenticated-connection label. Save the exact query
as `query.json` before lookup.

```bash
python3 analytics.py lookup --input private-session/query.json --account connection-a --cache private-session/cache --ttl 3600
python3 analytics.py ingest --input private-session/usage.json --account connection-a --cache private-session/cache
python3 analytics.py render --snapshot private-session/cache/RETURNED-HASH.json --out private-session/report --title "AI adoption observability" --rank-by cu
```

`lookup` exits 0 with the snapshot path when fresh, 1 on a miss/expiry, and 2 on invalid input.
`--ttl 0` always misses. Version 2 rejects pre-fix snapshots. Explicit project scope, selected IDs,
user filters, sections, dates, activity offset, and connection namespace participate in the key.
Filter ID order is canonicalized. A refresh atomically replaces the exact request, never appends
rows.

Supply the actual `fetched_at`; old exports retain it. Omission is allowed only immediately after a
new MCP fetch, when ingestion records the current time. The renderer preserves the original
timestamp. Rendering an expired snapshot is permitted for an explicitly historical answer. With user
snapshots, freshness checks every source. Do not refresh timestamps to bypass expiry.

The helper validates scope echo, date bounds, finite values, duplicate IDs/timestamps, consumption
accounting, daily-to-model sums, and complete user/model reconciliation. It rejects failed or
truncated responses. A failure leaves an existing cache intact. Time buckets use
`modelUsages.daily[].{modelId,points}` with `time`, `cost`, `jobs`, and `apiKeyCost`; `cost` is
already after discounts. Multiple timestamps in a day are summed. Out-of-period zero buckets are
ignored; nonzero data outside the requested UTC dates fails. Date controls select UTC calendar
buckets within the original interval; partial boundary days contain only the original queried
interval.

Snapshots omit prompts, avatars, URLs, and arbitrary activity metadata. Optional member lookups
retain email labels only for relevant identities. New directories use mode 700 and files mode 600
where supported. Use a private parent directory; caches are not encrypted. Delete scoped snapshots
and generated reports to forget a customer. Never commit or publish them.

## User and model rankings

Collect one additional `usage` envelope per `consumption[].userId`, repeating the parent scope,
dates, and trend sections with `user_ids:[ID]`. Save the envelopes as a JSON list in `users.json`.
Include every consumption identity, including zero and negative rows. Metadata supplies display
names and identity types; display names never serve as join keys.

```bash
python3 analytics.py ingest --input private-session/usage.json --users private-session/users.json --account connection-a --cache private-session/cache
python3 analytics.py lookup --input private-session/query.json --account connection-a --cache private-session/cache --require-users
python3 analytics.py render --snapshot private-session/cache/RETURNED-HASH.json --out private-session/report --rank-by cu --top-models-per-user 5 --pdf
```

The helper requires one query per identity and reconciles each model's CU, jobs, and API subset to
the parent summary. Incomplete or inconsistent child data fails ingestion. A summary-only report
still works by omitting `--users`; it states that joint rankings were not collected. If
reconciliation shows an identity missing from consumption, investigate MCP metadata/activity and
park the incomplete matrix; the helper does not invent missing identities. Never use job-record
billing as a replacement.

If usage entities lack names, discover the read-class `team_members_list` tool and call it through
the read executor with `team_id`, the OAuth context `project_id`, and `response_format:"json"`. Save
its `{query,response,fetched_at}` envelope and add `--members private-session/members.json` to
ingest. The helper joins returned email labels by ID, verifies scope, and retains their source
timestamp. `--names` uses these labels only when a full name is absent; default exports stay
pseudonymous.

`--rank-by jobs` answers frequency rankings and still includes CU. `--top-models-per-user 3` answers
top-three questions without refetching. Top users per model first selects ten models using the
chosen metric, then five users within each. Exact ties use stable IDs.

## Outputs and fallbacks

The renderer writes `report.md`, `models.csv`, `identities.csv`, and `dashboard.html`. With time
buckets it also writes `models-monthly.csv`. With per-user snapshots it adds the complete
`user-models.csv`, `top-models-per-user.csv`, and `top-users-per-model.csv`. CSV text is escaped
against spreadsheet formulas. Pseudonyms are default; add `--names` when returned names are needed.
The report title should identify the selected team/project for the recipient without putting private
data in source control.

PDF requires ReportLab in the host's supported Python environment. Without it, Markdown, CSV, and
HTML still work: render without `--pdf` and use browser Print / Save as PDF if available. Inspect
every PDF page as an image before delivery. The PDF omits unsupported decorative symbols with a
footer note; CSV preserves original labels. Unsupported writing systems fail clearly instead of
producing broken glyphs. Use disclosed pseudonyms or another local renderer with appropriate fonts.

The dashboard is self-contained: no CDN, external font, analytics, remote requests, or credentials.
Model activity responds to inclusive date, model, identity, and CU/jobs controls. Identity filtering
needs per-user snapshots; date filtering needs time buckets. Joint rankings follow the same
controls. Overall consumption and identity consumption remain explicitly for the original full
period, since generation series cannot substitute for overall accounting. CSV export follows the
model selection. Reset restores the original selection. Open locally; refresh through MCP and
regenerate, never embed credentials or host the dashboard.

## Parked metrics

Usage does not establish ticket attribution, delivered-output adoption, ROI, time saved, historical
eligible seats, or retention. Report the missing evidence and the available usage signal. Project
access failures and inconsistent source snapshots are coverage gaps, not zero usage. These limits do
not block verified CU and job rankings, per-user model trends, or scoped project reporting.
