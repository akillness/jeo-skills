---
name: garimpo
description: >
  Operate matheusmongarde/garimpo, an end-to-end open-source automated B2B prospecting and sales pipeline from Google Maps scraping, personalized preview website generation, WhatsApp conversational outreach, to Pix/Stripe/MercadoPago payment checkout. Use when orchestrating local business lead generation, generating dynamic landing pages per merchant, wiring agent APIs (Claude Code, Codex, n8n) to conversational outreach, and tracking conversions without spreadsheets. Do not use for generic web scraping without merchant prospecting pipelines (route to search-cli) or email marketing blasts (route to marketing). Triggers on: garimpo, google maps prospecting, automated b2b sales, whatsapp sales agent, pix checkout, matheusmongarde.
allowed-tools: Read Glob Grep Bash
compatibility: Node.js 18+, Docker/docker-compose, optional WhatsApp Web API. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/matheusmongarde/garimpo
  upstream_commit: ac28cde3b30506cf28926d813141cea757170a2b
  pinned_at: "2026-11-25"
---
# Garimpo (`matheusmongarde/garimpo`)

Source-pinned operator guide for `matheusmongarde/garimpo` (MIT), providing verified instructions and offline preflight validation.

## When to use this skill

- Automated B2B prospecting pipeline from Google Maps scraping to personalized websites and WhatsApp sales closing.
- For complete trigger patterns: garimpo, prospecting, google-maps-scraper, lead-generation, whatsapp-agent, sales-automation.
- Cross-routing boundaries: route out to `marketing`, `google-maps-scraper`, `pm-growth` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Docker launch: `docker compose up -d`
   - npm / Node.js: `npm install && npm start`
   - Agent API: built-in HTTP webhook / JSON endpoints for coding agents

3. **Execute verified workflows & operations**:
   - **Full-Funnel Automation**: Automates Google Maps search, contact discovery, preview site deployment, and payment checkout without spreadsheet intermediaries.
   - **Dynamic Preview Generation**: Instantly spins up a customized demo website for prospective clients bearing their business name.
   - **Autonomous Checkout**: Closes the sale automatically upon receiving confirmed payment webhook notifications.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Gate WhatsApp message dispatching and real payment credentials with explicit user confirmation.
   - Route out: Broad email marketing blasts -> `marketing`; Generic web scraping -> `search-cli`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
