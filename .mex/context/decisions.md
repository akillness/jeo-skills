---
name: decisions
description: Key architectural and technical decisions with reasoning. Load when making design choices or understanding why something is built a certain way.
triggers:
  - "why do we"
  - "why is it"
  - "decision"
  - "alternative"
  - "we chose"
edges:
  - target: context/architecture.md
    condition: when a decision relates to system structure
  - target: context/stack.md
    condition: when a decision relates to technology choice
  - target: patterns/debug-catalog-ci-failures.md
    condition: when a decision's "consequences" section explains a failure mode being debugged
grounds_to:
  - node: "function:6ec8fb763db3e36e7ba5ad788883f5a7"
    fingerprint: "mh:64:7b226d696e68617368223a5b3132303239383339392c383937303039362c37333038313935362c313032383037362c3134323734383333322c3839333939373237312c31363936343437372c3130373536393134372c3132323337333731382c313530353036373432362c31373931303839362c333638333134362c31313035343739392c343538393938362c31333130393436382c3437373732323937312c31313136383431392c33303938343430302c3831363338333138392c343534333731392c33383137363739372c3830383431382c3136343232333934332c3133343232353733372c3239373434303930362c38353335393234352c3134333539363134362c313032383739363231382c3336343535373938302c31333039373034392c38353335323039392c3232373732383836342c39323836383239312c333331313938302c3335373635383539312c3131353639383531382c33373535313235363430342c3131313637393531372c3438303138303130382c3431313937363738322c3535393930303836352c3335343534373635332c39303031373634392c3133373239313037332c3439313934313134332c3234353836363231352c3131333438303930332c3331313630383534372c3338383036383234352c313832373139393834332c38333437373639342c3230393530363431302c313435383833383531362c313037353238393236332c3532393336333537332c3230393339383530372c37303230383532362c35343139343937332c33313633313736362c31313732363932355d2c226e65696768626f7273223a5b2266756e6374696f6e3a333930303836323538323430646163326566396635396663333939663764222c2266756e6374696f6e3a366563386662373633646233366533376261356164373838383833663561372c39346464646432646538613536376263396139613530326265626534333030225d2c22746f6b656e436f756e74223a34317d"
last_updated: 2026-08-19
---

# Decisions

## Decision Log

### Delegate installation to `npx skills add`, never reimplement file copying
**Date:** 2026-07-30
**Status:** Active
**Decision:** `.agent-skills/jeo-skill/scripts/jeo-skill.py`'s `command_install()`
resolves a skill-name selection via `resolve_install_selection()` and then always shells
out to `npx skills add <source> --skill <names> [--global] [--agent <runtime>]
[--yes]` — it never copies `SKILL.md` files itself.
**Reasoning:** keeps the router lightweight (no vendored file-placement logic to
maintain or let drift) and reuses the community-standard Agent Skills installer, which
already resolves per-runtime target paths (Claude, Codex, Gemini, OpenCode, jeopi).
**Alternatives considered:** a Python-native copy routine inside `jeo-skill.py` —
rejected as duplicate logic that would drift from `skills add`'s per-agent resolution.
**Consequences:** `jeo-skill` requires Node.js/`npx` at install time even though the
router itself only needs Python 3.9+; `--dry-run` only ever previews the resolved skill
list and the exact command, never a real file effect.

### Flatten `.agent-skills` to one directory per skill, no category subfolders
**Date:** 2026-02-11 (`refactor: flatten skill structure from categorized to
root-level (56 skills)`)
**Status:** Active
**Decision:** every skill lives directly at `.agent-skills/<name>/SKILL.md`; category
and subcategory are metadata in `skills.json` only, never a directory structure.
**Reasoning:** agent skill discovery expects `<skill-name>/SKILL.md` at a predictable
depth; nested category folders broke discovery and forced duplicate wrapper
`SKILL.md` files per category.
**Alternatives considered:** the pre-2026-02-11 category-wrapped folder layout —
rejected because it caused folder collisions and discovery failures.
**Consequences:** `flatten_skills.py --dry-run` runs in CI (`.github/workflows/ci.yml`,
"Skill tree stays flat") to guard against regressions; taxonomy changes are now
metadata-only edits to `skills.json`, never directory moves.

### Replace regex-based frontmatter parsing with PyYAML-based repair
**Date:** 2026-07-27 (repair script introduced, `056e3f8`) / 2026-07-28 (CI stopped
running mutating scripts, `67be4c9`)
**Status:** Active — supersedes the original `fix_frontmatter.py`
**Decision:** `scripts/repair-skill-frontmatter.py` parses and rewrites SKILL.md
frontmatter with PyYAML, exposing `--check` for a non-mutating CI audit; the original
`fix_frontmatter.py` is now a deprecated shim that only locates and delegates to it
(see [`repair_document()`](mex://function:6ec8fb763db3e36e7ba5ad788883f5a7)).
**Reasoning:** the prior line-based regex parser (`re.match(r'^(\w[\w-]*)\s*:\s*(.*)',
line)`) could not see YAML folded block scalars. For the standard shape used throughout
the catalog (`description: >-` followed by indented continuation lines), it captured
the literal indicator `">-"` as the value and dropped every continuation line — that is
how 26 skills shipped a one-character description no agent could ever match on, and the
old CI configuration ran this destructively on every pull request, re-introducing the
damage each time.
**Alternatives considered:** patching the regex — rejected as fundamentally unable to
represent YAML block-scalar parsing correctly; PyYAML was adopted instead of writing a
custom folded-scalar parser.
**Consequences:** CI must only ever invoke `repair-skill-frontmatter.py` and
`flatten_skills.py` with their non-mutating flags (`--check` / `--dry-run`) — see the
explanatory comment in `.github/workflows/ci.yml`; `fix_frontmatter.py` is kept only so
that any existing invocation fails loudly toward the replacement instead of silently
corrupting the catalog again.
