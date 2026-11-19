# Solid Glass Material System, Classes, and Registry

## CSS Import Order & Token Cleanup

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "./solid-glass.css";
```

Delete the default `:root` and `.dark` color variable definitions created by `npx shadcn@latest init` so Solid Glass owns the theme tokens.

## Utility Classes & Attributes
- `glass-panel` — thinnest glass pane surface (omit extra Tailwind `border` classes)
- `glass-chosen` — selected item state (faint tint + top light line + hairline)
- `glass-held` — trigger whose popover/menu is currently open
- `glass-control` — standalone clear glass control (message bubble, glass pill)
- `glass-armed` — highlighted chip/tag ready for next Backspace removal
- `<Button variant="glass">` / `data-strong` — clear glass button and emphasized variant
- `data-glass="opaque"` — disables backdrop blur for legibility or performance while preserving rims/shadows

## Key CSS Tokens
- **Glass Edge & Blur:** `--glass-rim`, `--glass-inner`, `--glass-edge`, `--glass-shade`, `--glass-blur`
- **Interactive States & Fields:** `--glass-state`, `--glass-state-rim`, `--glass-state-edge`, `--field`, `--field-rim`, `--field-edge`, `--focus-line`, `--hover`, `--hover-faint`
- **Grooves & Solids:** `--well-shade`, `--well-rim`, `--primary-solid`, `--primary-rim`, `--primary-under`, `--mark-solid`, `--mark-rim`, `--mark-edge`
- **Brand & Status Hues:** `--brand`, `--brand-foreground`, `--brand-muted`, `--status-done`, `--success`, `--status-interrupted`, `--destructive`, `--link`, `--code-inline`, `--syn-*`
- **Radius:** `--radius` (`0.875rem` default), `--radius-control`

## 13 Registry Items (`deeplethe/solid-glass/<item>`)
- Stylesheet: `solid-glass`
- AI Primitives (12): `status-glyph`, `panel`, `tag`, `dot-loader`, `turn-status`, `composer`, `tool-steps`, `diff-view`, `ask-card`, `context-ring`, `task-notice`, `reasoning`
- Full workspace block in repo (`src/blocks/`): `agent-workspace`
