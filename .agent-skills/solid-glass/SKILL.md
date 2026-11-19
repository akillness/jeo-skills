---
name: solid-glass
description: >
  Apply deeplethe/solid-glass, a physical, tactile, technical glass design system stylesheet and component registry for AI applications built on shadcn/ui (React 19, Tailwind CSS 4, Base UI). Use when installing `solid-glass.css` via shadcn CLI, removing duplicate `:root`/`.dark` theme tokens so Solid Glass variables take effect, configuring glass surface utilities (`glass-panel`, `glass-chosen`, `glass-held`, `glass-control`, `glass-armed`, `data-glass="opaque"`), customizing `--brand`/`--radius`, or adding AI interface primitives (`status-glyph`, `composer`, `tool-steps`, `diff-view`, `ask-card`, `context-ring`, `task-notice`, `reasoning`). Route zero-Tailwind standalone agent React cards to affectui, OpenUI Lang streaming to open-intelligent-ui, and SKILL.md linting to skill-standardization.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 0.1.0
  source: https://github.com/deeplethe/solid-glass
  upstream_commit: 6e8903e494a15491ceda38fafea5056c95a74d44
---

# Solid Glass

## When to use this skill

Use when styling an AI application built with **React 19 + Tailwind CSS 4 + shadcn/ui (Base UI)** using `deeplethe/solid-glass` — an MIT-licensed stylesheet and 13-item registry designed around restrained, legible glass materiality ("the finish is at the edge; heavy, not airy; depth is thickness; one state").

### Route-outs
- For self-contained React 19 agent components with zero Tailwind/CSS dependencies, use `affectui`.
- For OpenUI Lang 1.0 generative UI streaming apps, use `open-intelligent-ui`.
- For broader multi-brand design token governance or non-shadcn systems, use `design-system`.
- For validating `SKILL.md` format or catalog metadata, use `skill-standardization`.

## Instructions

### 1. Run offline project preflight

Before adding the stylesheet or registry components, inspect the target frontend workspace for React 19, Tailwind CSS 4, Base UI, `components.json`, and CSS import collisions:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --workspace "/absolute/path/to/frontend-app" --json
```

The preflight script inspects `package.json`, `components.json`, and CSS files (`solid-glass.css`, `@import` order, and duplicate `:root`/`.dark` tokens) offline without running `npx` or opening network sockets.

### 2. Install the stylesheet and AI components via shadcn CLI

Initialize a shadcn/ui project (React 19, Tailwind CSS 4, Base UI), then install Solid Glass's stylesheet:

```bash
npx shadcn@latest add deeplethe/solid-glass/solid-glass
```

Import `./solid-glass.css` **after** Tailwind and shadcn's base CSS, and **delete** the `:root` and `.dark` color blocks written by `shadcn init` (Solid Glass defines the same shadcn variable names):

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./solid-glass.css";
```

Install Solid Glass's AI-native components as needed:

```bash
npx shadcn@latest add deeplethe/solid-glass/status-glyph
npx shadcn@latest add deeplethe/solid-glass/composer
npx shadcn@latest add deeplethe/solid-glass/tool-steps
```

### 3. Apply the four material rules consistently

1. **Let shadcn surfaces carry glass automatically:** Elements using `bg-card`, `bg-popover`, or `bg-sidebar` inherit Solid Glass rim highlights, hairline edges, and blur via `data-slot` rules outside Tailwind layers. Use `glass-panel` for plain glass containers.
2. **Respect edge-only border rules:** Rim and shade are inset shadows inside borders. Do **not** keep extra border utilities on `bg-card`, `bg-popover`, or `glass-panel` (it causes a double ring).
3. **Use one unified interactive state:** Apply `glass-chosen`, `glass-held`, `glass-control`, or `glass-armed` instead of custom gradients or raised shadows on list rows. Use `<Button variant="glass">` (and `data-strong` for primary emphasis in a group).
4. **Support dark-first and reduced transparency:** Dark mode is the primary surface; light mode uses the same tokens. For performance-sensitive or dense text regions, opt out of backdrop blur via `<aside data-glass="opaque">` while keeping rims and shadows.

### 4. Customize brand hue and radius without breaking contrast

- Override `--brand`, `--brand-foreground`, and `--brand-muted` once in `:root` and `.dark` (kept sparingly for accent signals; primary ink and charts remain monochrome).
- Adjust `--radius` (`0.875rem` default) rather than overriding per-component radii manually.

## Examples

### Audit CSS order and add Solid Glass AI turn primitives

```bash
# 1. Check React 19, Tailwind 4, and CSS import order offline
python3 "$SKILL_DIR/scripts/preflight.py" --workspace /path/to/app --json

# 2. Add stylesheet + AI status/tool primitives
npx shadcn@latest add deeplethe/solid-glass/solid-glass
npx shadcn@latest add deeplethe/solid-glass/turn-status
npx shadcn@latest add deeplethe/solid-glass/diff-view
npx shadcn@latest add deeplethe/solid-glass/ask-card
```

```tsx
<div className="glass-panel rounded-md p-3">
  <Button variant="glass" data-strong>Rerun now</Button>
</div>
```

## Best practices

1. **Always remove `shadcn init` `:root`/`.dark` color variables** after importing `solid-glass.css` so stock variables do not shadow glass surface tokens.
2. **Reserve motion for live execution:** Use `status-glyph`, `turn-status` glint, and active `tag` states strictly while work is running; keep completed states still.
3. **Avoid double rings:** Never stack Tailwind `border` classes onto `glass-panel`, `bg-card`, or `bg-popover` elements.
4. **Use `data-glass="opaque"` for heavy scroll regions** when backdrop blur reduces legibility or frame rate.

## References

- [Material System, Classes & Tokens](references/material-and-tokens.md): CSS variables, `glass-*` classes, 13 registry components, and Base UI conventions.
- [Sources and Provenance](references/sources.md): Upstream pin (`6e8903e494a15491ceda38fafea5056c95a74d44`), MIT license, and stack boundaries.
- [Evaluation Scenarios](evals/evals.json): Five behavioral test scenarios covering CSS import ordering, token overrides, glass utilities, and route-outs.
