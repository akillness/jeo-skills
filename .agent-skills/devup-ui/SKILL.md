---
name: devup-ui
description: >
  Routing-first front door for Devup UI — a zero-runtime CSS-in-JS library whose
  Rust + WebAssembly preprocessor extracts every style at build time, so there is
  no styling JavaScript in the runtime bundle. Use when the user wants to adopt or
  integrate Devup UI, wire the build-time plugin into Next.js / Vite / Rsbuild /
  Webpack / Bun, write styles with the `Box`/`css` props or the styled-components-
  compatible `styled()` API, set up type-safe theming with `devup.json`, use
  responsive arrays and pseudo selectors, ship React Server Components without a
  client Provider, or migrate off styled-components / Emotion / Tailwind / Panda
  / vanilla-extract to a zero-runtime setup.
  Triggers on: devup, devup-ui, devup ui, @devup-ui/react, zero runtime css-in-js,
  build-time css extraction, devup.json theme, next-plugin DevupUI, vite-plugin
  DevupUI, styled() zero runtime, css-in-js without runtime, migrate styled-components
  to zero runtime, rust css preprocessor.
  Routes: use `design-system` for token governance and visual-language direction,
  `ui-component-patterns` for reusable-component API/anatomy, `responsive-design`
  for page-shell/layout strategy, `web-accessibility` for a11y remediation, and
  `react-best-practices` / `vercel-react-best-practices` for bundle/RSC/rerender
  performance audits beyond styling.
allowed-tools: Read Write Edit Bash Grep Glob WebFetch
aliases: /devup-ui /devup
compatibility: >
  Requires Node.js (LTS) and a supported bundler. Build-time extraction runs through
  one of @devup-ui/next-plugin, @devup-ui/vite-plugin, @devup-ui/rsbuild-plugin,
  @devup-ui/webpack-plugin, or @devup-ui/bun-plugin. Targets React 18/19, including
  React Server Components (no client Provider, Zero FOUC). Works with npm, pnpm,
  yarn, or bun.
license: Apache-2.0
metadata:
  tags: devup-ui, css-in-js, zero-runtime, build-time-extraction, styled, theming, react, nextjs, vite, rust, wasm
  version: "1.0"
  source: https://github.com/dev-five-git/devup-ui
  docs: https://devup-ui.com
---

# devup-ui — routing-first zero-runtime CSS-in-JS adoption

> **Keyword**: `devup-ui` · `@devup-ui/react` · `zero runtime` · `build-time CSS extraction` · `devup.json`
>
> Devup UI processes **all** styles at build time with a Rust-powered preprocessor.
> There is no runtime style engine: pick the matching **bundler plugin first**, then
> write styles; the plugin is what makes everything else work.

Devup UI removes the developer-experience vs. performance trade-off of traditional
CSS-in-JS by extracting styles at compile time:

- **Zero Runtime** — no JavaScript executes for styling at runtime
- **Zero Config / Zero FOUC** — no client Provider, no style flash
- **Complete syntax coverage** — variables, conditionals, responsive arrays, pseudo selectors
- **Familiar API** — `styled()` compatible with styled-components / Emotion patterns
- **Smallest bundle** — base-37 class names (`a`, `b`, … `aa`, `ab`); dynamic values become CSS variables
- **RSC support** — works inside React Server Components

## When to use this skill

- The user wants to **add Devup UI** to a project and needs the right bundler plugin wired in
- The user is choosing between Next.js / Vite / Rsbuild / Webpack / Bun integration
- The user wants to **write styles** with `Box`/`css` props or the `styled()` API and isn't sure how the shorthand props (`bg`, `px`, responsive arrays, `_hover`) map
- The user wants **type-safe theming** with `devup.json` (colors, typography, dynamic theme switching via CSS variables)
- The user wants to **migrate** from styled-components / Emotion / Tailwind / Panda / vanilla-extract to a zero-runtime setup
- The user keeps reaching for a runtime CSS-in-JS Provider and needs to know it is unnecessary (and harmful to RSC) with Devup UI

Route out when the real need is broader than styling mechanics: token/visual-language
governance → `design-system`; reusable-component API/anatomy → `ui-component-patterns`;
layout/breakpoint strategy → `responsive-design`; accessibility → `web-accessibility`;
bundle/RSC/rerender performance beyond styling → `react-best-practices`.

## Instructions

### Step 1 — Capture one intake packet before editing config

Collect, in one pass:
1. **Bundler** — Next.js, Vite, Rsbuild, Webpack, or Bun (this decides the plugin package)
2. **React mode** — App Router / RSC vs. client-only (RSC needs no Provider; do not add one)
3. **Theming** — does the project need `devup.json` tokens and dynamic (e.g. dark) themes?
4. **Origin** — greenfield, or migrating from styled-components / Emotion / Tailwind / Panda / vanilla-extract?
5. **Package manager** — npm / pnpm / yarn / bun

### Step 2 — Install the core package and the matching bundler plugin

```sh
npm install @devup-ui/react
# then exactly ONE bundler plugin:
npm install @devup-ui/next-plugin     # Next.js
npm install @devup-ui/vite-plugin     # Vite
npm install @devup-ui/rsbuild-plugin  # Rsbuild
npm install @devup-ui/webpack-plugin  # Webpack
npm install @devup-ui/bun-plugin      # Bun
```

Or use the helper, which also installs the skill as a plugin and can scaffold the
chosen bundler in a target project:

```sh
bash scripts/install.sh                                   # install the skill only
BUNDLER=next PROJECT=/path/to/app bash scripts/install.sh # + npm packages for Next.js
BUNDLER=vite PKG_MANAGER=pnpm PROJECT=. bash scripts/install.sh
GLOBAL=1 bash scripts/install.sh                          # install the skill globally
```

### Step 3 — Wire the build-time plugin (the load-bearing step)

```js
// next.config.js  (Next.js)
import { DevupUI } from '@devup-ui/next-plugin'
export default DevupUI({})
```

```ts
// vite.config.ts  (Vite)
import { DevupUI } from '@devup-ui/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({ plugins: [react(), DevupUI()] })
```

Rsbuild uses `DevupUIRsbuildPlugin()`, Webpack uses `new DevupUIWebpackPlugin()`,
Bun imports `@devup-ui/bun-plugin`. Full snippets:
[references/installation-and-plugins.md](references/installation-and-plugins.md).

### Step 4 — Write styles

```tsx
import { Box, css, styled } from '@devup-ui/react'

// Prop-based styling with shorthands and responsive arrays
const view = (
  <Box bg="white" p={4} borderRadius="8px" _hover={{ bg: 'gray.100' }}>
    <Box fontSize={[14, 16, 20]} color="primary">Responsive text</Box>
  </Box>
)

// styled-components / Emotion compatible API
const Card = styled('div', {
  bg: 'white',
  p: 4,            // 4 * 4 = 16px spacing scale
  borderRadius: '8px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  _hover: { boxShadow: '0 10px 15px rgba(0,0,0,0.1)' },
})
```

Numeric spacing props multiply by 4px. Array values are breakpoint-responsive.
`_hover`, `_focus`, etc. are pseudo selectors. Dynamic values compile to CSS
variables (no runtime style recompute). Details:
[references/styling-api.md](references/styling-api.md).

### Step 5 — Theme with `devup.json` (only if needed)

```json
{
  "theme": {
    "colors": {
      "default": { "primary": "#0070f3", "text": "#000" },
      "dark":    { "primary": "#3291ff", "text": "#fff" }
    },
    "typography": {
      "heading": { "fontFamily": "Pretendard", "fontSize": "24px", "fontWeight": 700, "lineHeight": 1.3 }
    }
  }
}
```

Theme tokens are type-safe and theme switching is zero-cost (CSS variables). RSC
works without a Provider — **do not** add a client Provider for theming. Migration
recipes and route-outs: [references/theming-and-migration.md](references/theming-and-migration.md).

## Route-outs (do not over-promise styling)

- **Token governance, naming, visual-language direction** → `design-system`
- **Reusable-component API / slot anatomy / controlled ownership** → `ui-component-patterns`
- **Page-shell / breakpoint / reflow strategy** → `responsive-design`
- **Accessibility semantics, focus, labels, reflow** → `web-accessibility`
- **Waterfalls, bundle size, RSC boundaries, rerender churn** → `react-best-practices`

## Install as a plugin

```sh
npx skills add https://github.com/akillness/jeo-skills --skill devup-ui
```
