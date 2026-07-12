---
name: astryx
description: >
  Build fully customizable, agent-ready design systems with Astryx — Meta's
  production design system now open source. Ships 150+ React components built on
  StyleX with zero styling lock-in, component swizzling, brand theming, dark mode,
  and CLI tooling. Use when building component libraries, design systems, UI
  applications, design tokens, or when teams need consistent accessible components
  that AI agents can understand and extend. Triggers on: astryx, design system,
  component library, design tokens, react components, accessible components,
  astryx design, stylesheets, theme customization, component composition.
allowed-tools: Read Write Edit Bash Grep Glob WebFetch Find Search
compatibility: >
  Universal — React 18+ and Node 22+ on active LTS. Works across all coding agents
  (Claude Code, Codex, Gemini CLI, OpenCode, Cursor, Copilot, jeopi, jeo).
  Astryx is agent-ready: all components are exported at the base level for full
  composability (no locked top-level API). Integrates with: `deep-agents-core` for
  agent-driven component design, `responsive-design` for layout verification,
  `react-best-practices` for component performance optimization, `react-grab` for
  UI element context capture. Upstream: https://github.com/facebook/astryx (MIT).
metadata:
  tags: astryx, design-system, react-components, component-library, design-tokens, accessibility, stylex, theming, ui-framework, meta
  platforms: Claude, Codex, Gemini, Cursor, OpenCode, jeopi, jeo, All
  keyword: astryx
  version: "1.0.0"
  upstream: https://github.com/facebook/astryx
  source: akillness/jeo-skills
  license: MIT
---

# Astryx — Agent-Ready Design System

[Astryx](https://github.com/facebook/astryx) is an open source design system built
and proven at Meta over 8+ years across 13,000+ apps. It ships 150+ accessible
React components, brand-level theming, dark mode, templates, and a CLI — all
designed for how teams build now: **by people and the agents working alongside them**.

Built on [React](https://react.dev) and [StyleX](https://stylexjs.com), Astryx
emphasizes **open internals** (no closed top-level API, full component composability),
**zero styling lock-in** (bring your own CSS, no special build plugin), and **agent
readiness** (components exported at the base level so AI assistants understand and
extend them).

> **Currently in Beta**

## When to use this skill

- You're **building or scaling a component library** and want production-proven
  patterns from Meta
- You need **150+ accessible, ready-to-ship React components** with dark mode,
  theming, and templates
- Your **design system must support both human and AI co-creation** — agents need
  to understand, modify, and extend components safely
- You want **zero styling lock-in** — bring your own CSS framework (Tailwind,
  emotion, vanilla CSS) without fighting a design system build plugin
- You need **component swizzling** — ability to eject a component's full source
  into your project to customize without forking the library
- Your team values **open internals** and composability over a locked top-level API
- You want to **leverage Meta's 8+ years of design system evolution** across 13,000+
  applications

## When NOT to use this skill

- Building a simple one-off application (use Shadcn, Mantine, or MUI directly)
- Headless-only needs (no styled components required) — route to component
  architecture patterns
- Non-React projects — Astryx is React-only; route to design token tools
- Quick prototype that won't outlive a quarter

## Quick Start

### Step 1 — Install Astryx into your project

```bash
# Install the core package (React 18+ required)
npm install @astryxdesign/core

# Install the CLI for scaffolding and setup
npm install --save-dev @astryxdesign/cli

# Install the build utilities (optional, for custom builds)
npm install --save-dev @astryxdesign/build
```

Astryx requires **Node 22+ on an active LTS line** and **pnpm 11+** (or enable
[Corepack](https://nodejs.org/api/corepack.html)):

```bash
# Enable Corepack once (auto-installs pinned pnpm)
corepack enable

# Install dependencies
pnpm install
```

### Step 2 — Import and use components

Astryx ships **fully exported components** at the base level. No compound component
API, no Context hell — just import what you need:

```tsx
import { Button, TextField, Card, Stack } from '@astryxdesign/core'

export function MyApp() {
  return (
    <Card>
      <Stack gap="md">
        <TextField label="Name" placeholder="Enter your name" />
        <Button variant="primary">Submit</Button>
      </Stack>
    </Card>
  )
}
```

### Step 3 — Apply theming and dark mode

Astryx supports **brand-level theming** and automatic **dark mode** via CSS
variables:

```tsx
import { ThemeProvider } from '@astryxdesign/core'

export function App() {
  return (
    <ThemeProvider theme="light" // or "dark" or "auto"
      colorScheme={{
        primary: '#6741d9',
        background: '#ffffff',
      }}
    >
      <MyApp />
    </ThemeProvider>
  )
}
```

Dark mode responds to system preference automatically.

### Step 4 — Customize with swizzling

When you need to eject a component and own its implementation:

```bash
# Eject a component's full source into your project
astryx swizzle Button --path src/components/Button

# Now you can modify Button.tsx without forking the library
```

The ejected component is fully yours — customizations survive library upgrades.

### Step 5 — Use templates for common patterns

Astryx ships ready-to-ship templates for common UI patterns:

```bash
# List available templates
astryx templates list

# Scaffold a form template
astryx templates create form --name MyForm

# Scaffold a data table
astryx templates create table --name MyDataTable
```

## Core Concepts

### Open Internals

Astryx **exports primitives and building blocks** at the base level, not locked
behind a closed top-level API. This means:

- You can compose `Button`, `Icon`, `Loader`, `Tooltip` freely in any combination
- AI agents understand the component structure and can modify safely
- You're never fighting a framework-imposed constraint

**Contrast:** many design systems lock you into their compound component structure.
Astryx lets you build compound components yourself when you need them.

### Zero Styling Lock-in

Astryx ships **pre-built CSS** using StyleX, but you're free to:

- Replace styling entirely with Tailwind CSS utilities
- Mix Astryx components with your own CSS framework
- Override component styles via CSS modules or emotion
- Use Astryx as a component anatomy reference while building your own styles

No build plugin required. No styling library forced into your bundle.

### Agent Readiness

Every component is **designed for AI co-creation**:

- Flat export structure (agents find components without traversing nested APIs)
- Consistent prop naming and typing across all components
- TypeScript-first, so type definitions guide agent code generation
- Accessibility patterns built-in (so agents generate a11y-compliant code)
- Composable primitives (agents can extend safely)

## Architecture Overview

### Directory Structure

| Directory | Purpose |
|-----------|---------|
| `packages/core` | 150+ React components, theming engine, hooks |
| `packages/cli` | Scaffolding, swizzling, template generation |
| `packages/build` | Build tooling, asset optimization, CSS bundling |
| `packages/themes` | Pre-built brand themes (light, dark, contrast-enhanced) |
| `apps/docsite` | Full documentation (astryx.atmeta.com) |
| `apps/storybook` | Interactive component explorer |
| `apps/sandbox` | Live playground for quick prototyping |

### Key Exports

```typescript
// Components (150+)
export { Button, TextField, Select, Checkbox, Card, Stack, Grid, Modal, ... }

// Theming
export { ThemeProvider, useTheme, useColorScheme, createTheme }

// Hooks
export { useFormField, useMediaQuery, useOnClickOutside, useFocusTrap, ... }

// Utilities
export { cn, cva, createVar, ... }  // Style utilities
export { a11y, focus, hover, ... }  // a11y helpers
```

## Usage Patterns

### Pattern 1: Component Composition

Freely compose Astryx components without fighting a top-level API:

```tsx
import { Button, Stack, Icon, Loader } from '@astryxdesign/core'

export function SubmitButton({ loading, onClick }) {
  return (
    <Button onClick={onClick} disabled={loading}>
      <Stack direction="horizontal" gap="sm">
        {loading && <Loader size="sm" />}
        <span>Submit</span>
      </Stack>
    </Button>
  )
}
```

### Pattern 2: Custom Theme

Create a custom theme for your brand:

```tsx
import { createTheme, ThemeProvider } from '@astryxdesign/core'

const brandTheme = createTheme({
  primary: '#1f2937',
  secondary: '#6366f1',
  success: '#10b981',
  error: '#ef4444',
  fonts: {
    body: '"Inter", sans-serif',
    heading: '"Poppins", sans-serif',
  },
})

export function App() {
  return (
    <ThemeProvider theme={brandTheme}>
      <MyApp />
    </ThemeProvider>
  )
}
```

### Pattern 3: Responsive Layout

Astryx's `Grid` and `Stack` components support responsive props:

```tsx
import { Grid, Card } from '@astryxdesign/core'

export function Gallery() {
  return (
    <Grid
      columns={{ mobile: 1, tablet: 2, desktop: 4 }}
      gap="lg"
    >
      {items.map(item => (
        <Card key={item.id}>{item.name}</Card>
      ))}
    </Grid>
  )
}
```

### Pattern 4: Accessible Forms

Astryx form components handle a11y automatically:

```tsx
import { FormField, TextField, Button } from '@astryxdesign/core'

export function LoginForm() {
  return (
    <form>
      <FormField label="Email" required>
        <TextField type="email" placeholder="user@example.com" />
      </FormField>
      <FormField label="Password" required>
        <TextField type="password" placeholder="••••••••" />
      </FormField>
      <Button type="submit">Sign In</Button>
    </form>
  )
}
```

## Integration with Agent Skills

### `deep-agents-core`

Use when building **AI-driven component design systems**:

```bash
jeo @deep-agents-core create-component --design astryx
```

Agents can scaffold new components following Astryx patterns.

### `react-best-practices`

Optimize Astryx component performance per Meta's patterns (Rule 2.1: avoid barrel
imports, Rule 4: client-side data fetching optimization):

```tsx
// Correct: direct import, not barrel
import Button from '@astryxdesign/core/Button'

// Avoid (slow dev boot, slow builds)
import { Button } from '@astryxdesign/core'
```

### `responsive-design`

Verify your Astryx layouts work across viewports:

```bash
jeo @responsive-design verify --layout astryx-grid
```

### `react-grab`

Capture exact React element context from a live UI to hand to an agent:

```
jeo @react-grab capture-element --selector ".astryx-button"
```

Returns: component name, source file, line number, HTML structure.

## Common Tasks

### Task 1: Create a new component using Astryx patterns

```bash
# Generate a new component scaffold
astryx generate component MyCard

# Or use the CLI directly
npx @astryxdesign/cli component --name MyCard --destination src/components
```

### Task 2: Customize an existing component

```bash
# Swizzle (eject) the Button component
astryx swizzle Button

# Edit src/components/Button.tsx as needed
# Your customizations survive library upgrades
```

### Task 3: Set up dark mode

Add `prefers-color-scheme` detection:

```tsx
import { ThemeProvider } from '@astryxdesign/core'

export function App() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  
  return (
    <ThemeProvider theme={prefersDark ? 'dark' : 'light'}>
      <MyApp />
    </ThemeProvider>
  )
}
```

Astryx handles CSS variable switching automatically.

### Task 4: Migrate from another design system

Astryx's `cva` (class variance authority) and StyleX utilities work alongside other
CSS frameworks. Start by:

1. Install Astryx alongside your current design system
2. Import only the components you need
3. Gradually replace old components with Astryx equivalents
4. Remove old design system when migration is complete

### Task 5: Build a design token consumer

Export Astryx design tokens for use in other tools (Figma, Zeplin):

```ts
import { theme } from '@astryxdesign/core'

const tokens = {
  colors: theme.colors,
  spacing: theme.spacing,
  typography: theme.typography,
  breakpoints: theme.breakpoints,
}

export { tokens }
```

## Best Practices

1. **Import directly from component modules** — avoid barrel imports in hot code
   paths (see `react-best-practices` Rule 2.1)

2. **Swizzle only when necessary** — eject components only when you need deep
   customization; use props first

3. **Use responsive props** — Astryx's responsive API (`columns={{ mobile: 1,
   desktop: 4 }}`) is performant; favor it over media queries

4. **Compose over subclassing** — build custom components by composing Astryx
   primitives, not by extending classes

5. **Validate accessibility** — test swizzled components with automated a11y
   tools (axe DevTools, Pa11y)

6. **Theme at the app root** — wrap your entire app in `<ThemeProvider>`, not
   individual routes

7. **Leverage StyleX** — Astryx's StyleX integration provides zero-runtime CSS-in-JS
   with zero bundle cost

8. **Document custom components** — add Storybook stories to custom or swizzled
   components for agent discoverability

## Troubleshooting

**Q: My custom theme colors aren't applying**

A: Ensure `<ThemeProvider>` wraps your entire component tree at the app root.
Theme context is not inherited across portals or suspended components.

**Q: TypeScript errors on custom component props**

A: Astryx uses TypeScript 5.0+. Update your tsconfig.json:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "moduleResolution": "bundler"
  }
}
```

**Q: Dark mode preference not detected**

A: Check that `prefers-color-scheme` media query is supported in your browser.
Use `window.matchMedia('(prefers-color-scheme: dark)').matches` for detection.

**Q: Swizzled component not updating when library version bumps**

A: Swizzled components are frozen at the time of ejection. You own all future
updates. Watch the upstream repo for breaking changes you may want to backport.

## Resources

- **Official Docs**: https://astryx.atmeta.com
- **Storybook**: https://facebook.github.io/astryx/storybook/
- **Live Sandbox**: https://facebook.github.io/astryx/sandbox/
- **GitHub**: https://github.com/facebook/astryx
- **Contributing**: https://github.com/facebook/astryx/wiki/Contributing
- **API Conventions**: https://github.com/facebook/astryx/wiki/API-Conventions
- **Design Conventions**: https://github.com/facebook/astryx/wiki/Design-Conventions
- **Component Lifecycle**: https://github.com/facebook/astryx/wiki/Component-Lifecycle
- **Blog**: https://facebook.github.io/astryx/blog/

## Output Format

When the user asks for Astryx help, return a compact brief:

```markdown
# Astryx Routing Brief

## Scope
- Task: setup | build-component | theme | migrate | swizzle | a11y-check | integrate
- Target: new-app | existing-app | design-tokens | agent-driven

## Recommended next move
- install-and-setup | scaffold-component | customize-theme | migrate-from-old-design-system | swizzle-component | run-a11y-tests | integrate-with-agent-skill

## Why
- 2-3 bullets grounded in the user's request

## Route-outs
- `deep-agents-core` for AI-driven component generation
- `react-best-practices` for component performance optimization
- `responsive-design` for layout verification across viewports
- `react-grab` for UI element context capture and inspection
```

## Best Practices for Agents

1. **Discover components via direct exports** — don't traverse nested modules;
   Astryx exports all components at base level for agent simplicity

2. **Respect swizzling boundaries** — only swizzle when a component needs deep
   customization; use props for simple changes

3. **Generate accessible code** — Astryx's built-in a11y patterns (labels,
   ARIA, focus management) are already in place; don't duplicate

4. **Test responsive layouts** — use `columns={{ mobile, tablet, desktop }}` and
   verify on multiple breakpoints; don't hardcode widths

5. **Preserve theming** — respect user theme context; don't hardcode colors

6. **Compose primitives** — stack basic components (Button, Icon, Stack) to build
   complex UI; don't create monolithic components

## References

- Astryx GitHub: <https://github.com/facebook/astryx>
- TypeScript best practices: [`references/typescript.md`](references/typescript.md)
- StyleX documentation: [`references/stylex.md`](references/stylex.md)
- Component swizzling guide: [`references/swizzling.md`](references/swizzling.md)
- Setup scripts: [`scripts/setup.sh`](scripts/setup.sh)
- Component scaffold template: [`scripts/scaffold-component.sh`](scripts/scaffold-component.sh)
