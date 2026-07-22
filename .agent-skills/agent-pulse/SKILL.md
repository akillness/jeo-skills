---
name: agent-pulse
description: >
  Operate and extend barretlee/agent-pulse, the evidence-backed AI industry intelligence
  system: inspect source catalog and lifecycle, collect and normalize signals, bind evidence,
  cluster Events, evaluate system health, generate Scout hypotheses, export the privacy-safe
  public site, and verify release gates. Use when the user asks to run, configure, debug,
  extend, or explain Agent Pulse, its collectors, Control Room, narratives, Scout, or GitHub
  Pages output. Triggers on: agent-pulse, Agent Pulse, evidence-backed intelligence,
  source catalog, signal collection, Event clustering, source audit, Scout opportunity,
  public export, weekly brief, or AI industry intelligence pipeline.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires the Agent Pulse repository, Node.js 22+, npm, and its documented local environment. SQLite is the zero-configuration default.
license: MIT
metadata:
  tags: agent-pulse, ai-intelligence, evidence, source-catalog, collectors, event-clustering, scout, github-pages
  version: "1.0"
  source: https://github.com/barretlee/agent-pulse
---

# Agent Pulse

Operate Agent Pulse as an evidence-backed intelligence system, not as a news aggregator. Keep facts,
evidence, context, impact, judgment, and next signals distinct; make every public claim traceable to
allowed source evidence.

## When to use this skill

- The user wants to run Agent Pulse locally, refresh its repository snapshot, or inspect the Control Room and public site.
- The user needs to add, classify, test, activate, degrade, quarantine, or retire a data source.
- The user asks to collect signals, deduplicate or cluster Events, audit source health, or evaluate system capability.
- The user wants a narrative, weekly brief, Scout opportunity, or privacy-safe static export.
- The user is changing collectors, schemas, ranking, publication gates, source lifecycle, or public DTOs.
- The task is about Agent Pulse itself rather than generic web scraping or general research.

## Instructions

### Step 1: Capture the work packet

Record the requested outcome, affected plane, evidence boundary, and verification target:

- **Outcome**: operate, investigate, change code/schema, refresh data, publish, or research.
- **Plane**: server-only Control Room/database, collection pipeline, or public static export.
- **Object**: Source, SourceRun, Signal, Event, Track, Actor, Resource, View, Job, or Scout opportunity.
- **Evidence**: primary URL or paper, source tier, provenance, freshness, and uncertainty.
- **Scope**: one source, eligible batch, all sources, a narrative, or a release.
- **Proof**: focused test, `npm run check`, export validation, privacy scan, or browser smoke.

If the request is ambiguous, do not manufacture a publication decision. Ask for the missing target or
leave the item in review/draft with its blocking reason.

### Step 2: Read the project contract before editing

From the Agent Pulse repository root, read `AGENTS.md` and the relevant docs/specs first. At minimum,
consult `docs/ARCHITECTURE.md`, `docs/SOURCES.md`, and `docs/LEGAL.md` for collection/publication work.
Use the existing module boundary rather than inventing a source-specific exception:

- `src/collectors/` owns SourceAdapter contracts, fetch safety, and adapters.
- `src/domain/` owns pure URL, clustering, and scoring rules.
- `src/db/` owns Kysely schema, migrations, repositories, and seed catalog.
- `src/pipeline/` owns collection, clustering, evaluation, Scout, and export orchestration.
- `src/server/` owns public/admin APIs and security headers.
- `web/public/` is the framework-free static intelligence site; `web/admin/` is private.
- `tests/` holds unit and SQLite integration coverage.

For schema, source lifecycle, ranking, publication, or Scout changes, treat the matching specification
as docs-first and update code, tests, and user-facing changelog surfaces together.

### Step 3: Choose the narrowest operational lane

Use the existing npm scripts and keep independent operations separate:

| Need | Starting command | Guardrail |
| --- | --- | --- |
| Install/start local app | `npm install`; `cp .env.example .env`; `npm run dev` | Never commit `.env` or credentials |
| Seed/migrate local SQLite | `npm run db:seed` or `npm run db:migrate` | Preserve newer local evidence |
| Collect and cluster | `npm run collect` | Default to eligible sources; isolate failures |
| Scope collection | `npm run collect -- --scope=eligible` or `--scope=all` | Use `--source=<id>` for one source; `--backfill` only deliberately |
| Source health | `npm run sources:audit` | Non-destructive; record degraded/failed/skipped evidence |
| System capability | `npm run evaluate:system` | Compare a baseline when checking regressions |
| Operations reconciliation | `npm run ops:reconcile` | Do not silently mutate schema/ranking rules |
| Scout hypotheses | `npm run scout:generate -- 3` | Limit is 1–18; Scout is not factual publication |
| Static publication | `npm run export` then `npm run public:validate` | Export only allowlisted published DTOs |
| Merge/release proof | `npm run check` | Must include lint, typecheck, tests, export, and public validation |

For a code change, start with the smallest focused test or command, then run `npm run check` before
claiming completion. For a data refresh, capture before/after counts, source-run status, and the output
artifact or report path.

### Step 4: Enforce evidence and source boundaries

- Prefer official APIs, RSS/Atom, GitHub Releases, papers, filings, and other stable public sources.
- Tier 1 is primary fact; Tier 2 is professional verification; Tier 3 is expert interpretation; Tier 4 is distribution heat. Aggregators are discovery/heat sensors and never sole factual evidence.
- Keep confidence (factual correctness) separate from heat (spread). Do not treat hand-entered scores as measured reach.
- Public Events need a clickable original source and normally one Tier 1 or two independent Tier 2 sources. Mark exceptions as unverified.
- Respect robots, licenses, terms, rate limits, caching, and source quotas. Do not bypass login, WAF, CAPTCHA, paywalls, or platform restrictions. Route browser scraping to `scrapling` when that is the actual task.
- Bound timeouts, retries, backoff, redirects, response size, and concurrency. Re-check redirect destinations for SSRF and reject loopback, link-local, private, credential-bearing, or rebinding-prone URLs.
- Store provenance and bounded metadata, not full third-party articles. Preserve historical provenance when a source is retired.

### Step 5: Keep publication and privacy gates explicit

An automatically collected object enters `review` unless every deterministic gate is satisfied. Keep
facts separate from interpretations and label uncertainty. LLM enrichment may draft an insight, but it
must be traceable to evidence and cannot bypass schema, evidence, readiness, conflict, or publication
gates.

Before export, confirm that public output contains only allowlisted DTOs and no database, tokens,
credentials, raw payloads, proxy settings, local paths, admin fields, or private notes. A successful
process exit is not proof: cite the validation output, generated artifact, or test result.

### Step 6: Report the result as an auditable handoff

Return a concise packet with:

1. requested lane and scope;
2. files, sources, or commands changed;
3. evidence and provenance status;
4. counts/statuses before and after where relevant;
5. validation commands and real results;
6. remaining uncertainty, degraded sources, blocked gates, and next signal.

Never call a curated seed/demo dataset production-grade continuous detection, and never describe an
experimental or planned capability as shipped.

## Examples

### Example 1: Refresh eligible sources

Run `npm run collect -- --scope=eligible`, inspect the JSON collection/clustering result, and report
source failures separately from created, attached, or deferred Events. Do not promote review Events
just because collection succeeded.

### Example 2: Add a new source adapter

Read the source and legal specifications, extend the SourceAdapter boundary, add capability metadata,
fixture coverage, success/failure/degradation tests, and lifecycle/provenance handling. Run the focused
contract tests and then `npm run check`; leave a new source in `draft` or `shadow` until its real
observation window and compliance checks pass.

### Example 3: Publish a Scout opportunity

Run the bounded Scout command only after confirming the triggering Event and evidence. Present the
result as a clearly marked hypothesis with target user, why now, non-consensus insight, first small
experiment, risk, and invalidation condition—not as a fact, investment conclusion, or external action.

### Example 4: Verify a public release

Run `npm run export` followed by `npm run public:validate` and inspect the generated public fingerprint
or report. Confirm private control-plane data is absent and link each material Event back to public
evidence before reporting the release as ready.

## Best practices

1. Prefer existing contracts and small reversible diffs over source-specific shortcuts.
2. Separate catalogued, observed, active, and published states in every report.
3. Treat a failed source as isolated health state, not a reason to discard the whole batch.
4. Use SQLite for local default behavior; do not claim MySQL support without real integration coverage.
5. Keep changelog and public product changelog data synchronized for user-visible changes.
6. Preserve raw evidence boundaries and never put private operational data in GitHub Pages.
7. Record what would strengthen, weaken, or invalidate each durable judgment.

## References

- [Agent Pulse repository](https://github.com/barretlee/agent-pulse)
- [Architecture and data flow](https://github.com/barretlee/agent-pulse/blob/main/docs/ARCHITECTURE.md)
- [Data sources, tiers, and acquisition policy](https://github.com/barretlee/agent-pulse/blob/main/docs/SOURCES.md)
- [Responsible use and legal boundary](https://github.com/barretlee/agent-pulse/blob/main/docs/LEGAL.md)
- [Capability map](https://github.com/barretlee/agent-pulse/blob/main/docs/CAPABILITIES.md)
- [Local command and boundary matrix](references/command-and-boundaries.md)
