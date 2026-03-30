# Test Spec — Harness Skill Addition

## Verification Targets

### Structure

- `.agent-skills/harness/SKILL.md` exists
- `.agent-skills/harness/scripts/sync-upstream-harness.sh` exists
- `.agent-skills/harness/references/` exists

### Content

- Frontmatter `name` is `harness`
- Description mentions trigger conditions and cross-platform use
- Skill body includes:
  - when to use
  - instructions
  - examples
  - references

### Catalog

- `README.md` includes `harness`
- `README.ko.md` includes `harness`
- `setup-all-skills-prompt.md` includes `harness`
- `.agent-skills/skills.json` includes `harness`

### Validation

- `bash .agent-skills/harness/scripts/sync-upstream-harness.sh --check` exits cleanly
- `python3 - <<'PY' ...` JSON parse for `.agent-skills/skills.json` succeeds
- `git diff --check` succeeds

## Manual Smoke

- Read `README.md` harness row and confirm keyword / platform / description match the new skill.
- Read `.agent-skills/harness/SKILL.md` and confirm it can trigger from prompts like:
  - `build a harness for this repo`
  - `design an agent team harness`
  - `port revfactory harness ideas to codex`
