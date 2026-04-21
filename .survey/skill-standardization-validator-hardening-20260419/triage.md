# Triage
- Problem: `skill-standardization` relies on a shell validator that flattens multiline YAML descriptions with `awk | xargs`, which can abort with `xargs: unterminated quote` on ordinary apostrophes or shell-like text and turn valid `SKILL.md` files into false failures.
- Audience: `oh-my-skills` maintainers, contributors authoring or rewriting `SKILL.md` files, and agent loops that depend on `validate_skill.sh` as part of their fixed evaluation harness.
- Why now: `skill-standardization` is already part of the repo's maintenance baseline, multiline descriptions are common across the live catalog, and the current workaround shifts parser limits onto authors instead of repairing the validator.
