---
name: google-design
description: >
  Create, validate, and evolve DESIGN.md files — the Google machine-readable
  design system format that gives AI coding agents a persistent, structured
  understanding of a visual identity. Use when the user needs to define design
  tokens (colors, typography, spacing, rounded corners, components), lint for
  WCAG compliance and broken token references, diff two design system versions,
  or export tokens to Tailwind or W3C DTCG format. Triggers on: google design,
  design.md, DESIGN.md, design tokens, agent design system, visual identity
  machine-readable, tailwind tokens export, WCAG contrast check.
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: google-design, design-system, design-tokens, DESIGN.md, lint, tailwind, dtcg, wcag, typography, colors, components, ai-design, visual-identity
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: google-design
  version: alpha
  source: google-labs-code/design.md
  license: Apache-2.0
---

# google-design — DESIGN.md for AI Coding Agents

> Give your AI agent a persistent, structured understanding of your visual identity.

`DESIGN.md` is a format specification by Google that combines:
- **YAML front matter** — machine-readable design tokens
- **Markdown body** — human-readable design rationale

## Installation

### Plugin (Claude Code)
```bash
# Install as Claude Code plugin (if available via marketplace)
claude plugin marketplace add google-labs-code/design.md
```

### npm
```bash
npm install @google/design.md

# Or run directly (no install)
npx @google/design.md lint DESIGN.md
```

### Skill (any platform)
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill google-design
```

## When to use

- Define a reusable **design token system** before implementing UI components
- **Lint** DESIGN.md for structural errors and WCAG contrast compliance
- **Diff** two design system versions to track token-level regressions
- **Export** tokens to Tailwind theme config or W3C DTCG `tokens.json`
- Provide AI agents with a **persistent, authoritative design context**
- Bootstrap a new project's visual identity as a single source of truth

## Do not use when

- You need full component API design → route to `ui-component-patterns`
- You need responsive layout strategy → route to `responsive-design`
- You need accessibility-only remediation → route to `web-accessibility`
- You need broad UI critique → route to `web-design-guidelines`
- You need complete frontend UI system governance → route to `design-system`

## DESIGN.md file format

```markdown
---
name: MyBrand
version: alpha
description: Clean, minimalist design language
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#B8422E"
  neutral: "#F7F5F2"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
    fontWeight: 700
    lineHeight: 1.2
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
    lineHeight: 1.5
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 0.75rem
    letterSpacing: 0.08em
rounded:
  sm: 4px
  md: 8px
  lg: 16px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.sm}"
    padding: 12px
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
---

## Overview
Architectural Minimalism meets Journalistic Gravitas.

## Colors
- **Primary (#1A1C1E):** Deep ink for headlines and core text.
- **Secondary (#6C7278):** Muted slate for supporting content.
- **Tertiary (#B8422E):** Warm rust for interactive elements.

## Typography
Public Sans anchors editorial authority. Space Grotesk adds geometric precision for labels.

## Components
Button states use tertiary color for high-visibility actions.
```

## Token schema

```yaml
version: <string>        # optional — "alpha"
name: <string>           # required
description: <string>    # optional
colors:
  <token-name>: <hex>    # e.g. "#1A1C1E"
typography:
  <token-name>:
    fontFamily: <string>
    fontSize: <dimension>
    fontWeight: <number>
    lineHeight: <number|dimension>
    letterSpacing: <dimension>
    fontFeature: <string>
    fontVariation: <string>
rounded:
  <scale>: <dimension>   # e.g. "4px"
spacing:
  <scale>: <dimension|number>
components:
  <component-name>:
    backgroundColor: <color|token-ref>
    textColor: <color|token-ref>
    typography: <token-ref>
    rounded: <token-ref>
    padding: <dimension>
    size: <dimension>
    height: <dimension>
    width: <dimension>
```

**Token reference syntax:** `{colors.primary}` — resolves at lint/export time.

## CLI commands

### lint — validate structure and WCAG compliance
```bash
npx @google/design.md lint DESIGN.md
npx @google/design.md lint --format json DESIGN.md
cat DESIGN.md | npx @google/design.md lint -
```

Exit code `1` if errors found.

### diff — compare two design system versions
```bash
npx @google/design.md diff DESIGN.md DESIGN-v2.md
npx @google/design.md diff --format json old.md new.md
```

Exit code `1` if regressions detected.

### export — convert tokens to external formats
```bash
# Tailwind theme config
npx @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json

# W3C Design Tokens Community Group format
npx @google/design.md export --format dtcg DESIGN.md > tokens.json
```

### spec — output format specification
```bash
npx @google/design.md spec
npx @google/design.md spec --rules
npx @google/design.md spec --rules-only --format json
```

## Linting rules

| Rule | Severity | Purpose |
|------|----------|---------|
| `broken-ref` | error | Unresolved `{token}` references |
| `missing-primary` | warning | No primary color defined |
| `contrast-ratio` | warning | Component color pairs below WCAG AA (4.5:1) |
| `orphaned-tokens` | warning | Tokens defined but never referenced |
| `token-summary` | info | Count of tokens per section |
| `missing-sections` | info | Optional sections absent |
| `missing-typography` | warning | No typography defined alongside colors |
| `section-order` | warning | Sections out of canonical order |

## Section order (canonical)

All sections use `##` headings and are optional but must appear in this order:
1. Overview (aliases: Brand & Style)
2. Colors
3. Typography
4. Layout (aliases: Layout & Spacing)
5. Elevation & Depth
6. Shapes
7. Components
8. Do's and Don'ts

## Programmatic API

```typescript
import { lint } from '@google/design.md/linter';

const report = lint(markdownString);
report.findings;       // Finding[] — all issues
report.summary;        // { errors, warnings, info }
report.designSystem;   // Parsed DesignSystemState
```

## Export formats

| Format | Command | Output |
|--------|---------|--------|
| Tailwind | `--format tailwind` | `tailwind.theme.json` — use in `tailwind.config.js` |
| W3C DTCG | `--format dtcg` | `tokens.json` — standard token interchange |

## AI agent usage

Place `DESIGN.md` at the repo root to give coding agents persistent design context:

```bash
# Bootstrap a new DESIGN.md with the spec
npx @google/design.md spec > DESIGN.md

# Validate after editing
npx @google/design.md lint DESIGN.md

# Export for Tailwind integration
npx @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json
```

## Operating rules

1. Always run `lint` after creating or modifying a DESIGN.md
2. Fix `broken-ref` errors before `contrast-ratio` warnings
3. Use token references (`{colors.primary}`) in component definitions — never hardcode hex in components
4. Keep DESIGN.md at repo root so agents can auto-discover it
5. Version DESIGN.md changes with `diff` before shipping design system updates
6. Export to Tailwind/DTCG for implementation; never manually copy token values

## Examples

```bash
# Full workflow
npx @google/design.md spec > DESIGN.md      # bootstrap
# edit DESIGN.md with your brand tokens
npx @google/design.md lint DESIGN.md         # validate
npx @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json
npx @google/design.md diff DESIGN.md DESIGN-v2.md  # track changes
```

Source: [google-labs-code/design.md](https://github.com/google-labs-code/design.md) — Apache-2.0 License
