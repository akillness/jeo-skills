# Hourly survey transport-http-status envelope ratchet (2026-04-29)

## Summary
- Added a low-risk survey skill ratchet: when web-search transport fails with structured provider envelopes, capture `transport_status.web_search.http_status` in addition to `error_tag` and `request_ids[]`.
- Motivation: repeated auth-envelope failure signals (`INVALID_API_KEY`) were observed in this run; preserving HTTP status improves postmortem triage.

## Evidence (survey fallback links)
### invalid-api-key
- [Story 2.8: Auth Error Codes](https://github.com/cirruslycurious/ai-learning-hub/issues/140)
- [Error in website blog writer](https://github.com/AJaySi/ALwrity/issues/178)

### obsidian-cli
- [Obsidian, silently fails, no errors, doesn't start the program](https://github.com/NixOS/nixpkgs/issues/359254)

### graph-links
- [DiGraphExport](https://github.com/kaeawc/krit/issues/64)
- [Move Dagre layout to Web Worker for large graph performance](https://github.com/NTCoding/living-architecture/issues/279)
- [Add RTFM — open-source multi-domain retrieval layer for AI agents](https://github.com/aimcp/awesome-mcp/issues/24)

## Artifacts
- Survey: `.survey/hourly-skill-candidates-20260429-0213/solutions.md`
- RTK summary: `.survey/hourly-skill-candidates-20260429-0213/rtk-summary.md`
- Graphify fallback: `.survey/hourly-skill-candidates-20260429-0213/graphify-refined.json`
- Obsidian status: `.survey/hourly-skill-candidates-20260429-0213/obsidian-status.txt`
