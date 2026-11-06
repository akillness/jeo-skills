---
name: google-maps-scraper
description: >
  Operate gosom/google-maps-scraper, the MIT-licensed Go tool that crawls Google Maps listings
  into CSV, JSON, PostgreSQL or S3 (name, address, phone, website, rating, reviews, coordinates,
  optional website emails) through a Docker image, a CLI, a Web UI and REST API, or a self-hosted
  SaaS edition. Use when the user names gosom's google-maps-scraper, wants local-business lead
  data from Google Maps, or needs a query file, depth and concurrency choice, proxy-file setup,
  result review, an offline preflight, or troubleshooting. Do not use for the Google Places API,
  bulk emailing, scraping that ignores Google's terms or privacy law, or installing upstream's own
  agent skill. Triggers on: google-maps-scraper, gosom, Google Maps scraper, 구글 지도 업체 정보 수집,
  지역 업체 리드, scrape Google Maps, local business leads.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Docker (recommended) or a Go toolchain at the go.mod version; a graphical browser is not needed.
  The Docker command may not work on macOS (upstream offers a Go build route); Windows goes
  through WSL for upstream's agent skill. Proxy credentials, third-party exports and anything that
  opens a network port are separate authority boundaries.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/gosom/google-maps-scraper
  upstream_commit: 903b96d7aa8863188022c04db220e44f3218c860
---

# google-maps-scraper operator

Operate the named scraper for small, reviewed, lawful local-business data jobs. This skill was audited
against commit `903b96d7aa8863188022c04db220e44f3218c860` (2026-10-21); audited commands, hazards and
the pin are in [`references/upstream.md`](references/upstream.md). Upstream's README carries a legal
notice: unauthorized scraping may violate terms of service.

## When to use this skill

- Plan, validate, run, resume, or troubleshoot a Google Maps crawl with `gosom/google-maps-scraper`.
- Write a query file, choose `-depth`, `-c`, `-email`, `-fast-mode`, or grid scraping; configure a proxy file.
- Review a results CSV or JSON for duplicates, missing fields, and personal data before use.
- Not for Google's Places API, for sending email to scraped addresses (see `moneyprinter-v2`'s Outreach warnings), or for installing upstream's own `google-maps-scraper` agent skill.

Name collision: upstream's `npx skills add gosom/google-maps-scraper` installs a skill folder with the
same name, `google-maps-scraper`, in the same roots this catalog uses, and that skill updates itself
on every run. Check `installed-skill` in the preflight and never overwrite one kind with the other
without approval.

## Instructions

### 1. Freeze the surface

Record one mode: `plan`, `run-cli`, `run-web`, `run-api`, `review-results`, or `troubleshoot`. Ask for the
business type, place, and the purpose of the data; decline purposes that need consent the user lacks.

### 2. Run the offline gate first

The helper reads host facts, an optional queries file and, with `--repo`, a checkout. It never starts
Docker, Go, a browser, or the network, and writes nothing:

```bash
python3 .agent-skills/google-maps-scraper/scripts/preflight.py --json
python3 .agent-skills/google-maps-scraper/scripts/preflight.py --queries queries.txt --json
python3 .agent-skills/google-maps-scraper/scripts/preflight.py --repo /path/to/google-maps-scraper --expect-commit 903b96d7aa8863188022c04db220e44f3218c860 --json
```

An installed skill uses `python3 "$SKILLS_ROOT/google-maps-scraper/scripts/preflight.py"`. The
`--queries` check counts lines and prints a README-rate runtime estimate; it makes no request.

### 3. Gate every side effect

Require separate explicit approval for each:

1. `docker pull gosom/google-maps-scraper` or a source build (it downloads Go modules and Playwright browser libraries on first run).
2. Any crawl: it makes live requests to Google Maps from the user's IP. Start with a 1 to 3 line query file, `-depth 1`, the default `-c`, and `-exit-on-inactivity 3m`.
3. `-email`: it also visits each business website. Say so before enabling it.
4. Proxies: use `-proxies-file` (mode 600, outside the repo), never inline `-proxies`, and never ask for credentials in chat. The two flags cannot be combined.
5. Web UI or REST mode: it listens on `:8080` with no authentication in the audited code. Bind to loopback (`-addr 127.0.0.1:8080`, or `-p 127.0.0.1:8080:8080` for Docker).
6. Exports to PostgreSQL, S3, a custom plugin, or `-leadsdb-api-key` (a third-party service): each moves scraped personal data and needs its own approval.
7. Never run upstream's `PROVISION` script (it pipes a downloaded script into `sh`) or deploy the SaaS edition as part of this skill.

Set `DISABLE_TELEMETRY=1` unless the user opts in: upstream enables anonymous telemetry by default.

### 4. Follow the matching reference branch

- Commands, flags, Docker and source builds → **Run** in `references/upstream.md`.
- Output fields and review → **Results**.
- Blocking, proxies, concurrency → **Reliability**.
- Web UI, REST API, SaaS → **Server modes**.
- Telemetry, sponsors, legal notice → **Boundaries**.

### 5. Verify narrowly

Run the small validation crawl first, confirm the output has the expected columns and plausible rows, then
scale. A `blocked` or empty result is a Google-side outcome to report, not something to defeat.

## Examples

### Small reviewed lead sample

Plan three queries such as `dentists in Berlin Germany`, run the Docker command with `-depth 1` and
`-exit-on-inactivity 3m`, then review the CSV for duplicates and for emails or phone numbers that need a
lawful basis before use.

### "Run it as an API for my team"

Explain that the local server has no authentication and that the multi-user path is the separate SaaS
edition, which this skill does not deploy. Offer loopback-only binding behind the user's own access control.

## Best practices

- Start small: one validation crawl, then scale `-c` only while watching CPU, memory and failure rate.
- Treat scraped contact data as personal data; decide retention and purpose before collecting it.
- Prefer `-proxies-file` over `-proxies`, and `-json` when you need `-extra-reviews`.
- Read upstream's README for flags that changed; this audit is pinned to one commit and `go.mod` and the README disagree on the Go version.
- Keep the helper offline and honest: Docker on PATH is not a running daemon, a pulled image, or a successful crawl.

## References

- [Audited scraper facts, hazards and pin](references/upstream.md)
- [Pinned source manifest](references/source.json)
- [Scraper README at the audited commit](https://github.com/gosom/google-maps-scraper/blob/903b96d7aa8863188022c04db220e44f3218c860/README.md)
- [Recipes](https://github.com/gosom/google-maps-scraper/blob/903b96d7aa8863188022c04db220e44f3218c860/docs/recipes.md)
- [MIT license at the pin](https://github.com/gosom/google-maps-scraper/blob/903b96d7aa8863188022c04db220e44f3218c860/LICENSE)
- [Offline helper](scripts/preflight.py)
