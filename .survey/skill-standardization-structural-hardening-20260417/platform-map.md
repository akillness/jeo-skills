# Platform Map: skill-standardization structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Canonical source of truth | Project skill folders + project config | Project skill folders + repo rules/config | Project skill folders + `.gemini/settings.json` | Live `./.agent-skills/<name>/SKILL.md` folders are authoritative; manifests/docs/compact views are derived |
| Metadata | `name`, `description`, optional tools/compatibility | Same practical metadata needs | Same practical metadata needs | Keep `name` directory-safe and `description` trigger-oriented |
| Discovery variants | Can project tool-specific views from canonical source | Similar need, but weaker native projection tooling | Similar need, especially when generating local settings/views | `SKILL.toon` / `SKILL.compact.md` are derived discovery artifacts, not the source of truth |
| Runtime config surface | Hook/config rich | Config/rules heavier than hooks | Config + hook capable | Keep platform-local config explicit but regenerate from one canonical skill source |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Spec validation | Run skill lint after edits | Same | Same | Required frontmatter, trigger wording, section checks, size hygiene |
| Duplicate handling | Prefer canonical skill + narrow alias | Same | Same | Do not leave overlapping skills as false peers |
| Discovery sync | Sync manifest/docs/compact surfaces after structural changes | Same | Same | Treat catalog sync as part of standardization, not a separate optional cleanup |
| Mutation discipline | Best with frozen evaluator + bounded keep/revert loop | Same | Same | One primary mutable artifact; keep only if real usefulness improves |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| After `SKILL.md` edit | Strong native hook fit | Usually post-turn / manual rerun | Viable with tool hooks | `post-skill-edit -> validate_skill` |
| After add/rename/remove/alias | Strong native hook fit | Mostly rule/reminder driven | Viable with tool hooks | `post-structural-change -> validate_catalog_sync` |
| After material trigger-surface rewrite | Native hook path exists | Usually manual/reminder driven | Viable with tool hooks | `post-material-rewrite -> refresh compact / projected discovery surfaces` |
| Runtime sanity check | Easy to wire into session/tool lifecycle | Weaker pre-tool interception | Can block/shape tool execution | Confirm query/load tooling still resolves the right skill surfaces |

## Platform Gaps
- `skill-standardization` has scripts and checklist rules, but no portable hook recipe for automatically chaining validation, catalog sync, and compact refresh after edits.
- Codex-style environments are weakest on pre-tool maintenance hooks, so this workflow must stay explicit and rule-driven there.
- The catalog validator checks membership/count/path drift, but compact freshness is still a checklist/manual review concern rather than an enforced validator.
- Repo-native and platform-native derived surfaces still need a clearer "refresh derived artifacts after material rewrite" habit that works across Claude, Codex, and Gemini workflows.
