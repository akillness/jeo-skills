# Deepinit Scope and Preservation

Use this reference before creating or refreshing AGENTS.md files.

## Directory Scope

Deepinit documents source structure, not runtime debris.

Always exclude:
- `.git/`
- `node_modules/`
- `dist/`, `build/`, `coverage/`
- `.next/`, `.nuxt/`
- `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`
- `.venv/`, `venv/`, `env/`
- root runtime state: `.omc/`, `.omx/`, `.survey/`, `.codex/`, `.claude/`, `.gemini/`, `.opencode/`, `.ouroboros/`

Conditional:
- Root `.agents/` is source only when the project deliberately uses `oh-my-agent` / OMA as a checked-in portable harness. Otherwise treat it as generated/runtime state.
- `.agent-skills/` is always source in this repository. Document its skill folders, references, scripts, evals, and catalog files.
- `.agent-skills-wiki/` is source when already tracked or explicitly used as project knowledge.

## Manual Preservation

Preserve everything after the marker:

```markdown
<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
```

When a file uses a shorter marker such as `<!-- MANUAL: -->`, treat the marker and all following content as manual. Do not rewrite, summarize, or delete it.

## Parent Links

Every non-root AGENTS.md must start with a relative parent link:

```markdown
<!-- Parent: ../AGENTS.md -->
```

Rules:
- The path must resolve from the AGENTS.md file's directory.
- Root AGENTS.md has no parent tag.
- If a directory's nearest documented parent is more than one level up because skipped directories are excluded, use the correct relative path.

## Runtime Notes

| Runtime | AGENTS.md guidance |
|---------|--------------------|
| Claude Code / OMC | Mention Claude workflow only as working guidance; keep `.omc/` ignored |
| Codex / OMX | Keep root AGENTS.md concise because OMX may inject it as model instructions |
| Gemini / Antigravity / OMA | If `.agents/` is source, document it; if not, ignore it |
| Cross-runtime | Prefer portable instructions first, then runtime-specific notes |

## Validation

Run:

```bash
python3 .agent-skills/deepinit/scripts/validate_agents_hierarchy.py .
python3 .agent-skills/deepinit/scripts/validate_agents_hierarchy.py . --strict
```

Expected result:
- default mode passes with warnings for legacy AGENTS.md files that predate deepinit
- strict mode requires all non-root AGENTS.md parent links to resolve
- strict mode requires manual markers to be present and preserved
