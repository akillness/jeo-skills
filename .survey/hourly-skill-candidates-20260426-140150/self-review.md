## Self-review checklist (automated)
- [x] Mandatory five keyword families executed and evidence captured
- [x] Required survey artifacts created with validator headings
- [x] Provenance labels present and validator-compatible
- [x] RTK summary generated from deterministic lane metrics
- [x] Graphify processed with fallback artifact on query schema failure (`links`)
- [x] LLM-Wiki and Obsidian note updated with run context
- [x] Non-destructive change scope (docs/skill-contract/evals only)
- [x] Validation commands passed (`validate_survey_artifacts`, `validate_skill.sh`, `git diff --check`)
- [x] Rollback plan documented in PR body

### Merge decision basis
Proceed to merge only if PR checks are present and green. If checks are absent or failing, do not merge and leave blocker context in PR comments.