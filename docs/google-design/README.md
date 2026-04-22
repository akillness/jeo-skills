# google-design — DESIGN.md for AI Coding Agents

> Give your AI agent a persistent, structured understanding of your visual identity.

← [Back to README](../../README.md)

---

## What `google-design` owns

`google-design` is the skill for creating, validating, and evolving **DESIGN.md** files — the Google machine-readable design system format specification.

Use this skill when you need to:
- Define **design tokens** (colors, typography, spacing, rounded, components) as a single source of truth
- **Lint** for structural errors and WCAG AA contrast compliance
- **Diff** two design system versions to detect regressions
- **Export** to Tailwind theme config or W3C DTCG `tokens.json`
- Give AI agents **persistent, structured design context** via a repo-root `DESIGN.md`

## Installation

### npm
```bash
npm install @google/design.md
npx @google/design.md lint DESIGN.md
```

### Skill
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill google-design
```

---

## Quick start

```bash
# Bootstrap a DESIGN.md with the format spec
npx @google/design.md spec > DESIGN.md

# Edit DESIGN.md with your brand tokens, then validate
npx @google/design.md lint DESIGN.md

# Export to Tailwind
npx @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json

# Track design system changes
npx @google/design.md diff DESIGN.md DESIGN-v2.md
```

---

## File format overview

```markdown
---
name: MyBrand
colors:
  primary: "#1A1C1E"
  tertiary: "#B8422E"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
rounded:
  sm: 4px
spacing:
  md: 16px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
---

## Overview
Brand rationale goes here.
```

---

## CLI commands

| Command | Purpose |
|---------|---------|
| `lint DESIGN.md` | Validate structure + WCAG AA contrast |
| `diff old.md new.md` | Compare token versions |
| `export --format tailwind` | → `tailwind.theme.json` |
| `export --format dtcg` | → `tokens.json` (W3C format) |
| `spec` | Output format specification |
| `spec --rules` | Include linting rules |

---

## Key linting rules

| Rule | Severity |
|------|----------|
| `broken-ref` | error — unresolved `{token}` references |
| `contrast-ratio` | warning — below WCAG AA 4.5:1 |
| `orphaned-tokens` | warning — defined but unreferenced |
| `missing-primary` | warning — no primary color |

---

## Further reading

- [`.agent-skills/google-design/SKILL.md`](../../.agent-skills/google-design/SKILL.md)
- [google-labs-code/design.md](https://github.com/google-labs-code/design.md)
- [npm: @google/design.md](https://www.npmjs.com/package/@google/design.md)
