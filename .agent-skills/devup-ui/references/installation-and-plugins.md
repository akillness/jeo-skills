# Installation & build-time plugins

Devup UI does its work in a **build-time plugin**. Install `@devup-ui/react` plus
exactly one bundler plugin, then register that plugin in the bundler config. Nothing
styles at runtime, so there is no Provider and no client setup step.

## Packages

| Package | Use with |
|---------|----------|
| `@devup-ui/react` | always — the `Box` / `css` / `styled` API + types |
| `@devup-ui/next-plugin` | Next.js (App Router & Pages) |
| `@devup-ui/vite-plugin` | Vite |
| `@devup-ui/rsbuild-plugin` | Rsbuild |
| `@devup-ui/webpack-plugin` | Webpack |
| `@devup-ui/bun-plugin` | Bun bundler |

```sh
npm install @devup-ui/react
npm install @devup-ui/next-plugin   # pick the one matching your bundler
```

## Next.js

```js
// next.config.js (ESM)
import { DevupUI } from '@devup-ui/next-plugin'
export default DevupUI({})
```

```js
// next.config.js (CommonJS)
const { DevupUI } = require('@devup-ui/next-plugin')
module.exports = DevupUI({})
```

Wrap your existing config object as the argument: `DevupUI({ /* your next config */ })`.
Works with React Server Components — do **not** add a client Provider.

## Vite

```ts
// vite.config.ts
import { DevupUI } from '@devup-ui/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), DevupUI()],
})
```

Disable single-file CSS extraction when you need per-module CSS:

```ts
export default defineConfig({
  plugins: [
    react(),
    DevupUI({
      extractCss: false,
    }),
  ],
})
```

## Rsbuild

```js
// rsbuild.config.mjs
import { DevupUIRsbuildPlugin } from '@devup-ui/rsbuild-plugin'
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact(), DevupUIRsbuildPlugin()],
})
```

## Webpack

```js
// webpack.config.js
import { DevupUIWebpackPlugin } from '@devup-ui/webpack-plugin'

export default {
  plugins: [new DevupUIWebpackPlugin()],
}
```

## Bun

```ts
import '@devup-ui/bun-plugin'

await Bun.build({
  entrypoints: ['./src/index.tsx'],
  // ...
})
```

## Verify the wiring

1. Build the app (`next build`, `vite build`, etc.).
2. Confirm a generated CSS artifact contains compact class names (`.a`, `.b`, …).
3. Confirm the client bundle contains **no** runtime style engine and no FOUC on load.
