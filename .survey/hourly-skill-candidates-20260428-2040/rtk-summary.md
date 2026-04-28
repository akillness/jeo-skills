# RTK Summary
- Topic: hourly repo-maintenance survey quality hardening
- Finding: web_search transport failed (INVALID_API_KEY), fallback to gh api search/repositories succeeded.
- Observation: duplicate repositories appear across mandatory lanes; recommendation counts can be inflated.
- Proposed ratchet: add explicit cross-lane dedupe + primary-lane assignment + overlap reporting for recommendation-grade keeps.
- Risk: minor behavior change in reporting; no runtime/tooling break.
