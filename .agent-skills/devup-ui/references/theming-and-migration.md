# Theming & migration

## Type-safe theming with `devup.json`

Define tokens once in `devup.json` at the project root. Devup UI generates types so
token names autocomplete and typo-check, and theme switching is zero-cost because it
flips CSS variables — no re-render, no Provider.

```json
{
  "theme": {
    "colors": {
      "default": { "primary": "#0070f3", "text": "#000", "bg": "#fff" },
      "dark":    { "primary": "#3291ff", "text": "#fff", "bg": "#0a0a0a" }
    },
    "typography": {
      "heading": {
        "fontFamily": "Pretendard",
        "fontSize": "24px",
        "fontWeight": 700,
        "lineHeight": 1.3
      }
    }
  }
}
```

- `colors.default` is the base theme; `colors.dark` (and any other named theme)
  override the same token keys.
- Reference tokens by name in styles: `<Box color="primary" bg="bg" />`.
- Switch themes by setting the active theme on a root element/attribute — the
  variables cascade; there is no JavaScript theme context to update.

## React Server Components

Because there is no runtime style engine, RSC works out of the box:

- **Do not** wrap the app in a CSS-in-JS Provider — it is unnecessary and breaks the
  zero-runtime guarantee.
- Styles render server-side with Zero FOUC; no client hydration of styles is needed.

## Migration recipes

### From styled-components / Emotion

The `styled('tag', { … })` API is intentionally compatible. Convert template-literal
styles to the object form:

```tsx
// styled-components
const Card = styled.div`
  background: white;
  padding: 16px;
`
// Devup UI
const Card = styled('div', { bg: 'white', p: 4 })
```

Remove the `ThemeProvider` and any `createGlobalStyle` runtime; move tokens to
`devup.json` and globals to a plain CSS file.

### From Tailwind

Replace utility-class strings with prop-based styling on `Box`. Map design tokens
into `devup.json` so `color="primary"` etc. resolve. Keep Tailwind only if a team
prefers utility classes — the two can coexist during migration.

### From Panda / vanilla-extract

Both are already build-time, so the migration is mechanical: port recipes/tokens to
`devup.json` and rewrite style objects with Devup UI shorthands. You gain the
styled-components-compatible API and CSS-variable theme switching.

## Route-outs

Styling mechanics are this skill's job; broader concerns belong elsewhere:

- **Token governance / visual-language direction** → `design-system`
- **Reusable-component API, slot anatomy, controlled ownership** → `ui-component-patterns`
- **Page-shell, breakpoint, reflow strategy** → `responsive-design`
- **Accessibility semantics, focus, labels** → `web-accessibility`
- **Bundle size, RSC boundaries, rerender churn, waterfalls** → `react-best-practices`
