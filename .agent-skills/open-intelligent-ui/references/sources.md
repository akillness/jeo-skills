# Open Intelligent UI Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/thesysdev/open-intelligent-ui](https://github.com/thesysdev/open-intelligent-ui)
- **Live Demo & Standard:** [https://www.openui.com/demo/intelligent-ui](https://www.openui.com/demo/intelligent-ui) / [https://openui.com](https://openui.com)
- **Package Version:** `0.1.1`
- **Upstream Commit:** `dd45370b3ca785692c4c761cbafe4242421275f6`
- **Default Branch:** `main`
- **License:** MIT License

## Operational Boundaries
- **Offline Preflight:** `scripts/preflight.py` checks Node.js version, `package.json`, `src/generated/` artifacts, and `.env` key names (set/unset only, never reading or printing key values) without making network calls or executing child processes.
- **External Services at Runtime:** `/api/wiki` and `/api/image-search` query Wikipedia/Wikimedia Commons; `/api/street-route` queries the public OSRM demo server; `/api/chat` calls the configured LLM provider. Confirm provider keys and costs before running live benchmarks (`scripts/bench/run.mjs`).
- **Node Requirement:** `engines.node >= 24` in `package.json`.
