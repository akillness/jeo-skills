# Upstream Provenance: `matheusmongarde/garimpo`

- **Repository**: <https://github.com/matheusmongarde/garimpo>
- **Pinned Commit**: `ac28cde3b30506cf28926d813141cea757170a2b` (`2026-11-25`)
- **License**: `MIT`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Docker launch: `docker compose up -d`
- npm / Node.js: `npm install && npm start`
- Agent API: built-in HTTP webhook / JSON endpoints for coding agents

## Key Architecture & Concepts

- **Full-Funnel Automation**: Automates Google Maps search, contact discovery, preview site deployment, and payment checkout without spreadsheet intermediaries.
- **Dynamic Preview Generation**: Instantly spins up a customized demo website for prospective clients bearing their business name.
- **Autonomous Checkout**: Closes the sale automatically upon receiving confirmed payment webhook notifications.

## Boundaries & Cross-Routing

- Gate WhatsApp message dispatching and real payment credentials with explicit user confirmation.
- Route out: Broad email marketing blasts -> `marketing`; Generic web scraping -> `search-cli`.
