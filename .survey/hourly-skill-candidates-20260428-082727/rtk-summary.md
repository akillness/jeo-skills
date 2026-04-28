# RTK Summary — hourly-skill-candidates-20260428-082727

- Scope: Hourly PR loop maintenance ratchet (carry-forward mode due to open-PR backlog).
- Retrieval: `web_search` failed with 401 (`INVALID_API_KEY`); switched to GitHub REST search fallback.
- Evidence quality: 9 indexed candidate snippets collected from fallback search payloads.
- Selected change: Improve `.agent-skills/survey/evals/evals.json` by adding an eval that enforces repository-relative `transport_status.web_search.error_log` paths.
- Risk: Low (eval-only; no runtime behavior modifications).
- Validation plan: survey artifact validator + skill validator + git diff check.
