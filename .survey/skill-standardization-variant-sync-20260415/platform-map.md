# Platform Map: skill-standardization variant sync

## Settings
| Concern | Agent Skills spec | oh-my-skills runtime | Common Layer |
|---------|-------------------|----------------------|--------------|
| Trigger metadata | `name` + `description` frontmatter drive discovery | `skills.json` and compact skill files enrich repo-local discovery | settings = discovery metadata that must stay consistent across canonical and compact forms |
| Progressive disclosure | Catalog first, full skill on activation | `skill-query-handler.py` supports `full`, `compact`, and `toon` retrieval modes | settings = multi-tier skill representation |
| Artifact limits | Description length and structure constrained by spec | `SKILL.toon` exists to provide a compressed retrieval surface | settings = token-budgeted discovery surfaces |

## Rules
| Concern | Agent Skills / spec docs | oh-my-skills / repo workflow | Common Layer |
|---------|---------------------------|------------------------------|--------------|
| Validation baseline | Check required frontmatter and naming rules | Run `validate_skill.sh` and catalog-sync validation | rules = fixed acceptance criteria for skill publishing |
| Trigger quality | Use imperative descriptions and realistic trigger evals | Standardization skill already requires stronger descriptions and evals | rules = trigger wording must be tested, not assumed |
| Derived artifact sync | Spec implies concise discovery matters but does not name repo-specific compact files | Repo currently relies on maintainers to remember `SKILL.toon` refreshes manually | rules = derived discovery artifacts must be reviewed when canonical intent changes |

## Hooks
| Lifecycle | Agent Skills docs | oh-my-skills runtime | Common Layer |
|-----------|-------------------|----------------------|--------------|
| Pre-publish | Validate frontmatter, description, evals | Validate `SKILL.md` and catalog surfaces | hooks = pre-merge verification |
| Post-rewrite | Re-test trigger behavior | Refresh `SKILL.toon` manually in stronger modernization runs | hooks = compact derivative regeneration/check |
| Runtime retrieval | Load catalog then full skill on demand | Load `toon` / `compact` / `full` variants via query handler and loader fallback | hooks = retrieval mode fallback chain |

## Platform Gaps
The spec and public guidance explain why compact discovery surfaces matter, but the repo-specific maintenance skill/checklist does not yet encode that compact variants are part of the publishing contract. The gap is therefore between canonical spec compliance and local runtime-discovery hygiene, not between competing vendors.
