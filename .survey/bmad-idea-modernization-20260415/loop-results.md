| Iteration | Target | Hypothesis | Change | Validation result | Keep/Revert | Notes |
|---|---|---|---|---|---|---|
| 1 | `bmad-idea/SKILL.md` | A router-style rewrite with one-mode intake and explicit handoffs will be more reusable than the current command catalog | rewrote `SKILL.md`, added `references/`, `evals/`, `SKILL.toon`, doc sync, graph refresh, and wiki notes | `validate_skill.sh` pass; `validate_catalog_sync.py` pass; support coverage rose to 70 refs / 69 evals | Keep | Clearer trigger surface, stronger downstream boundaries, no duplicate skill added |
