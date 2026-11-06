# google-maps-scraper audited reference

Audit of [`gosom/google-maps-scraper`](https://github.com/gosom/google-maps-scraper) at commit
[`903b96d7aa8863188022c04db220e44f3218c860`](https://github.com/gosom/google-maps-scraper/tree/903b96d7aa8863188022c04db220e44f3218c860)
(committed 2026-10-21T10:24:30Z, "updates sponsor links"), observed 2026-11-06. License: MIT. Latest
GitHub release at audit time: v1.18.1 (2026-09-20). `references/source.json` records the SHA-256 of the
11 files this audit read. The README's "Legal Notice" says to use the scraper responsibly and that
unauthorized scraping may violate terms of service; this audit does not assess any particular use.

## Identity

A Go program that drives headless Chromium (Playwright) against Google Maps and writes one record per
place. It ships as a Docker image (`gosom/google-maps-scraper`), a CLI binary, a Web UI plus REST API,
an optional PostgreSQL job queue for distributed runs, and an optional self-hosted "SaaS edition"
(`docs/saas.md`). It is not the Google Places API and is unrelated to `omkarcloud/google-maps-scraper`,
which the README credits as inspiration for JS extraction and which shares the repository name.

## Run

Docker, CLI mode (README and `docs/recipes.md`):

```bash
mkdir -p gmaps-output
docker run \
  -v gmaps-playwright-cache:/opt \
  -v "$PWD/example-queries.txt:/queries.txt:ro" \
  -v "$PWD/gmaps-output:/out" \
  gosom/google-maps-scraper \
  -input /queries.txt -results /out/results.csv -depth 1 -exit-on-inactivity 3m
```

From source (README): `go mod download`, `go build`, then `./google-maps-scraper -input example-queries.txt -results results.csv -exit-on-inactivity 3m`. The README says Go 1.26.6+; `go.mod` and the `Dockerfile` build argument say 1.27.1. Build with the `go.mod` version. `MacOS instructions.md` describes a Go build because the Docker command may not work on macOS.

Input file: one query per line, plain searches (`dentists in Berlin Germany`) or direct Google Maps URLs; `Matsuhisa Athens #!#MyCustomID` sets a custom input id. `example-queries.txt` holds restaurant and cafe queries for several cities.

Flags (README; run `-h` for the full list): `-input`, `-results` (default stdout), `-json`, `-resume` (file output only; not with stdout, `-writer`, `-leadsdb-api-key` or `-fast-mode`), `-depth` (default 10), `-c` (default half the CPU cores), `-email`, `-extra-reviews` (use JSON), `-lang`, `-geo`, `-zoom`, `-radius`, `-grid-bbox` with `-grid-cell`, `-web`, `-addr` (default `:8080`), `-data-folder`, `-dsn` with `-produce`, `-proxies`, `-proxies-file`, `-leadsdb-api-key`, `-exit-on-inactivity`, `-fast-mode` (beta, up to 21 results per query), `-debug`, `-writer`, `-browser-pool-size`, `-pages-per-browser`. `-fast-mode` and `-grid-bbox` cannot be combined.

## Results

36 documented fields (README): `input_id`, `link`, `title`, `category`, `address`, `open_hours`, `popular_times`, `website`, `phone`, `plus_code`, `review_count`, `review_rating`, `reviews_per_rating`, `latitude`, `longitude`, `cid`, `status`, `descriptions`, `reviews_link`, `thumbnail`, `timezone`, `price_range`, `data_id`, `street_view_url`, `place_id`, `images`, `reservations`, `order_online`, `menu`, `owner`, `complete_address`, `credit_cards_accepted`, `about`, `user_reviews`, `user_reviews_extended` (needs `-extra-reviews`), `emails` (needs `-email`). Phone numbers, emails and review text are personal data in many jurisdictions. Review a sample for duplicates and empty columns before scaling.

## Reliability

- The README's throughput figure is about 120 places per minute at `-c 8 -depth 1`; its table assumes 16 results per keyword (100 keywords is about 13 minutes). Treat these as upstream estimates.
- Blocking and rate limits grow with volume and concurrency; upstream says proxies help but are not a guarantee. `-c`, `-browser-pool-size` and `-pages-per-browser` trade throughput for CPU and memory.
- Proxy flags: protocols `socks5`, `socks5h`, `http`, `https`. `-proxies` and `-proxies-file` cannot be combined. `docs/proxies.md` recommends `-proxies-file` (one URL per line, `#` comments, `chmod 600`, stored outside project repositories) so credentials stay out of command lines.
- `-resume` writes `<results>.resume.json` beside the output and skips completed queries and already written places; rerun with the same input and options.
- Web mode results take at least three minutes to appear (minimum configured runtime).

## Server modes

- **Web UI and REST API** (`-web`, or the README's Docker command with `-data-folder`): routes include `/scrape`, `/download`, `/delete`, `/jobs`, `/view`, `/api/docs` and `/api/v1/jobs`, `/api/v1/jobs/{id}`, `/api/v1/jobs/{id}/download`. The job body fields in `web/job.go` are `keywords`, `lang`, `zoom`, `lat`, `lon`, `fast_mode`, `radius`, `depth`, `email`, `extra_reviews`, `max_time`, `proxies`. `web/web.go` contains no authorization handling, and the README's Docker command publishes `-p 8080:8080` on all host interfaces. Bind to loopback.
- **SaaS edition** (`docs/saas.md`): API keys, admin UI, queue, workers, cloud provisioning. Its install line is `curl -fsSL .../PROVISION | sh`, which runs a downloaded script. Out of scope for this skill.
- **PostgreSQL provider and Kubernetes**: for distributed runs with `-dsn`; the README's examples put database credentials on the command line.

## Boundaries

- **Telemetry**: `runner/runner.go` sends anonymous usage statistics unless `DISABLE_TELEMETRY=1`.
- **Third-party export**: `-leadsdb-api-key` (or `LEADSDB_API_KEY`) sends scraped leads to LeadsDB, a managed service the README promotes.
- **Sponsors**: the README, `docs/proxies.md` and upstream's agent skill carry sponsor and referral links, with a disclaimer that listings are not endorsements. This skill does not recommend a proxy vendor.
- **Upstream agent skill**: `skills/google-maps-scraper/SKILL.md` (v1.12.1, author gosom) runs `scripts/ensure-latest.sh` at the start of every workflow to update itself and can show three randomly selected sponsored proxy providers. It is a different thing from this operator skill and has the same folder name.
- **Consumers in this catalog**: MoneyPrinterV2's Outreach downloads this scraper at tag v0.9.7 and calls it with `-input` and `-results` only; see the `moneyprinter-v2` skill.

## Not verified

No Docker image was pulled, no crawl was run, no Google Maps request was made, and no output was
inspected during this audit. The helper's `runtime_verified` is always false.
