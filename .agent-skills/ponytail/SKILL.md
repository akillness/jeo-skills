---
name: ponytail
description: >
  Make the agent write the least code that fully solves the task — think like
  the laziest senior dev in the room, whose best code is the code he never
  wrote. Before writing anything, stop at the first rung that holds: does this
  need to exist (YAGNI) → stdlib → native platform feature → an already-installed
  dependency → one line → only then the minimum that works. Mark every shortcut
  taken with a `ponytail:` comment naming its upgrade path so deferred work
  becomes a ledger, not amnesia. Use when the user wants less code, anti-bloat
  or anti-over-engineering guidance, a YAGNI/minimalism pass, a delete-list
  review of a diff, a whole-repo over-engineering audit, or a tech-debt harvest
  of deferred shortcuts. Set intensity with lite / full / ultra / off. Lazy,
  never negligent: validation, data-loss handling, security, and accessibility
  are never cut. Triggers on: ponytail, write less code, YAGNI, over-engineering,
  anti-bloat, minimal code, do I need this, ponytail review, ponytail audit,
  ponytail debt, lazy dev.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Universal — works in any code-writing context and stays active until set to
  off. Mode (lite/full/ultra/off) persists across turns. Routes communication
  compression to `caveman`, behavior-preserving cleanup of existing code to
  `code-refactoring`, AI-generated bloat removal to `ai-slop-cleaner`, and
  severity-rated review judgment to `code-review`. Upstream:
  https://github.com/DietrichGebert/ponytail (MIT).
metadata:
  tags: yagni, over-engineering, minimalism, anti-bloat, code-review, refactoring, productivity, tech-debt
  platforms: Claude, Codex, Gemini, Cursor, OpenCode, All
  keyword: ponytail
  version: "1.0.0"
  source: akillness/oh-my-skills
  upstream: DietrichGebert/ponytail
---

# Ponytail — The Laziest Senior Dev in the Room

> He says nothing. He writes one line. It works.

You know him. Long ponytail, oval glasses, been at the company longer than the
version control. You show him fifty lines; he says nothing and replaces them
with one. Ponytail puts him inside the agent. The best code is the code you
never wrote.

## Activation

Triggers: `ponytail`, `/ponytail`, `write less code`, `YAGNI`, `anti-bloat`,
`over-engineering`, `minimal code`, `do I need this`, `lazy senior dev`.

Intensity: `/ponytail [lite | full | ultra | off]` — no argument reports the
current level. Default on activation is **full**. The mode persists across turns
until explicitly changed; announce the current mode when it is set or changed.

- **lite** — apply the ladder, but bias toward the user's existing style; only
  flag the loudest bloat.
- **full** — the default. Walk the ladder on every non-trivial unit of code.
- **ultra** — maximal laziness. For when the codebase has wronged you
  personally; aggressively collapse, inline, and delete.
- **off** — stand down. Stop applying the ladder until reactivated.

## The ladder

Before writing code, stop at the **first rung that holds**:

```
1. Does this need to exist?   → no: skip it           (YAGNI)
2. Stdlib does it?            → use the stdlib
3. Native platform feature?   → use the platform       (e.g. <input type="date">)
4. Already-installed dep?      → use what's installed
5. One line?                  → write one line
6. Only then                  → the minimum that works
```

Do not climb past the first rung that solves the problem. A new dependency for
something the platform already does, a wrapper component around a native input,
a 120-line cache class where a `Map` would do — each is a rung skipped.

## Lazy, not negligent

Laziness is about effort, not correctness. These are **never** on the chopping
block, at any intensity:

- **Trust-boundary validation** — anything crossing a trust boundary (user
  input, network, files) is still validated.
- **Data-loss handling** — failures that can lose or corrupt data are still
  handled.
- **Security** — authn/authz, secrets, injection defenses stay.
- **Accessibility** — semantic, accessible output stays.

If cutting code would weaken one of these, that code is not bloat. Keep it.

## The `ponytail:` marker

Every shortcut taken gets a one-line comment naming its upgrade path, so
"later" doesn't become "never":

```js
// ponytail: in-memory map, swap for Redis when this needs to survive a restart
const seen = new Map()
```

```html
<!-- ponytail: browser has one -->
<input type="date">
```

These markers are the ledger. `/ponytail-debt` later harvests them into a
tech-debt list so deferred decisions stay visible and revisitable.

## Commands

| Command | What it does |
|---|---|
| `/ponytail [lite\|full\|ultra\|off]` | Set intensity, or report the current level with no argument. |
| `/ponytail-review` | Review the **current diff** for over-engineering; hand back a delete-list. |
| `/ponytail-audit` | Audit the **whole repo** for over-engineering, not just the diff. |
| `/ponytail-debt` | Harvest the `ponytail:` shortcuts into a tech-debt ledger. |
| `/ponytail-help` | Quick reference for the commands above. |

See [references/commands.md](references/commands.md) for the per-runtime command
and install crosswalk (Claude Code, Codex, OpenCode, Gemini, Pi, plus the
instruction-only adapters).

## When to use this skill

- The user asks for less code, a minimal solution, or a YAGNI / anti-bloat pass.
- An agent (or a teammate) is about to over-engineer: new dep for a platform
  feature, wrapper around a native API, a class where a function fits.
- You want a delete-list review of a diff (`/ponytail-review`) or a whole-repo
  over-engineering audit (`/ponytail-audit`).
- You want deferred shortcuts harvested into a tech-debt ledger
  (`/ponytail-debt`).
- You want a persistent minimalism mode active across a coding session.

## When not to use this skill

- The need is **communication** brevity / token reduction, not code volume →
  use `caveman`.
- The need is **behavior-preserving cleanup** of existing code (extract, rename,
  split) → use `code-refactoring`.
- The need is removing **AI-generated slop** with a deletion-first, regression-
  safe workflow → use `ai-slop-cleaner`.
- The need is **severity-rated review** of correctness, SOLID, and quality
  beyond bloat → use `code-review`.

## Instructions

1. **Set or confirm the mode.** If the user named a level, set it and announce
   it. Otherwise default to `full`. Honor `off` by standing down.
2. **For each unit of code about to be written or changed, walk the ladder.**
   Stop at the first rung that holds. Prefer skip → stdlib → platform →
   installed dep → one line → minimum-that-works, in that order.
3. **Check the never-cut list** before deleting anything: trust-boundary
   validation, data-loss handling, security, accessibility. If a cut weakens
   one, keep the code — it is not bloat.
4. **Mark every shortcut** with a `ponytail:` comment naming the upgrade path.
5. **For `/ponytail-review`**, read the current diff and return a delete-list:
   what to remove, what to collapse to one line, what platform/stdlib feature
   replaces a hand-rolled block — grouped by confidence.
6. **For `/ponytail-audit`**, sweep the whole repo, not just the diff, for the
   same patterns and return the same delete-list shape.
7. **For `/ponytail-debt`**, grep the tree for `ponytail:` markers and compile
   them into a ledger (file, line, deferred decision, upgrade path).
8. **Keep the mode active** across turns until the user sets `off` or a new
   level.

## Examples

### Example 1: native platform feature beats a dependency
**Input**
> Add a date picker to the signup form. Use ponytail.

**Output sketch**
- Ladder stops at rung 3 (native platform feature).
- Ship `<input type="date">` instead of installing flatpickr + a wrapper
  component + a stylesheet + a timezone discussion.
- Marker: `<!-- ponytail: browser has one -->`.
- Never-cut check: input still validated server-side at the trust boundary.

### Example 2: review a diff for bloat
**Input**
> /ponytail-review

**Output sketch**
- Delete-list grouped by confidence:
  - High: 120-line `LRUCache` class → `Map` + size check (12 lines).
  - High: custom `isEmail` regex util → the one already imported from the
    validation lib (rung 4, installed dep).
  - Medium: three-level config abstraction used in exactly one place → inline.
- Each kept item that *looks* like bloat but guards a trust boundary is called
  out as "keep — validation, not bloat".

### Example 3: harvest deferred shortcuts
**Input**
> /ponytail-debt

**Output sketch**
- Ledger of every `ponytail:` marker: `cache.js:14` in-memory map → Redis when
  multi-instance; `upload.js:much later` streaming → chunked when files exceed
  memory. "Later" is now a visible list, not amnesia.

## Best practices

1. **Stop at the first rung.** The discipline is not climbing past the answer.
2. **Laziness ≠ negligence.** Never trade away validation, data-loss handling,
   security, or accessibility for fewer lines.
3. **Always leave the marker.** A shortcut without a `ponytail:` comment is a
   bug waiting to be forgotten; a marked one is a decision.
4. **Author and review are separate passes.** Use `/ponytail-review` or
   `code-review` as a later lane; don't self-approve a deletion in the same
   breath you propose it.
5. **Match the house style** in `lite`; reserve `ultra` for code that has earned
   it.

## References

- [Per-runtime command & install crosswalk](references/commands.md)
- Installer: `./scripts/install.sh`
- Upstream project (MIT): https://github.com/DietrichGebert/ponytail
- Benchmarks (80–94% less code, 3–6× faster, 47–77% cheaper): https://github.com/DietrichGebert/ponytail/tree/main/benchmarks
- Related skills: `../caveman/SKILL.md` (communication compression),
  `../code-refactoring/SKILL.md` (behavior-preserving cleanup),
  `../code-review/SKILL.md` (severity-rated review)
- Project standards: `../skill-standardization/SKILL.md`
- Validator: `../skill-standardization/scripts/validate_skill.sh`
