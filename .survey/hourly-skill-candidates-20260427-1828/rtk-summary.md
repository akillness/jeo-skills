# RTK Summary (token-saver)

- Run slug: hourly-skill-candidates-20260427-1828
- Mode: repo-maintenance survey
- Transport: `web_search/web_extract` degraded (`INVALID_API_KEY`) -> fallback to direct page retrieval + `gh api`
- Key finding: `gh search repos` returned empty payload (`[]`, exit 0) for a known-populated query (`react`), while `gh api "search/repositories?..."` returned results.
- Candidate change: add deterministic empty-payload guard + API fallback rule to `.agent-skills/survey/SKILL.md` and keyword-sweep reference.
- Risk: low (documentation/rule hardening only)
- Rollback: revert the two markdown files and related eval text updates.
