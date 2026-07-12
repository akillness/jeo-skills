# Astryx Skill

Build agent-ready, fully customizable design systems with **Astryx** — Meta's open
source design system proven across 13,000+ apps.

## Quick Links

- **Skill Guide**: [`SKILL.md`](./SKILL.md) — Full activation guide and routing brief
- **Official Docs**: https://astryx.atmeta.com
- **GitHub**: https://github.com/facebook/astryx
- **Storybook**: https://facebook.github.io/astryx/storybook/
- **Live Sandbox**: https://facebook.github.io/astryx/sandbox/

## References

- **TypeScript Setup**: [`references/typescript.md`](references/typescript.md)
- **StyleX Integration**: [`references/stylex.md`](references/stylex.md)
- **Component Swizzling**: [`references/swizzling.md`](references/swizzling.md)

## Scripts

- **Setup**: [`scripts/setup.sh`](scripts/setup.sh) — Initialize a new Astryx project
- **Scaffold Component**: [`scripts/scaffold-component.sh`](scripts/scaffold-component.sh) — Generate a new component

## Installation

### Quick Install

```bash
npm install -g skills
skills add -g https://github.com/akillness/jeo-skills --skill astryx -a claude-code -y
```

### With Claude Code

Hand the [`setup-all-skills-prompt.md`](../../setup-all-skills-prompt.md) to Claude Code
to install this skill alongside others.

## Usage

### 1. Setup a new Astryx project

```bash
bash ./skills/astryx/scripts/setup.sh my-astryx-app
cd my-astryx-app
pnpm dev
```

### 2. Scaffold a new component

```bash
bash ./skills/astryx/scripts/scaffold-component.sh MyButton
bash ./skills/astryx/scripts/scaffold-component.sh MyForm src/ui form
```

### 3. Use Astryx in your React app

```typescript
import { Button, Card, Stack, ThemeProvider } from '@astryxdesign/core'

export function App() {
  return (
    <ThemeProvider theme="light">
      <Card>
        <Stack gap="md">
          <h1>Hello Astryx</h1>
          <Button variant="primary">Click me</Button>
        </Stack>
      </Card>
    </ThemeProvider>
  )
}
```

### 4. Customize a component

```bash
# Eject the Button component to customize
astryx swizzle Button

# Edit src/components/Button/index.tsx as needed
```

## Key Features

- **150+ accessible React components** — production-proven at Meta
- **Zero styling lock-in** — use StyleX, Tailwind, vanilla CSS, or emotion
- **Agent-ready** — full composability, no locked APIs
- **Component swizzling** — eject and customize without forking
- **Dark mode** — automatic theme switching
- **Brand theming** — customizable design tokens
- **TypeScript-first** — full type safety
- **CLI tooling** — scaffolding, templates, component generation

## When to Use This Skill

✅ **Perfect for:**
- Building production component libraries
- Design systems that support AI co-creation
- React apps needing 150+ accessible components
- Teams wanting open design internals
- Projects requiring dark mode and theming

❌ **Not ideal for:**
- Quick one-off prototypes (use Shadcn or Mantine)
- Non-React projects
- Headless-only needs

## Integration with Other Skills

- **`deep-agents-core`** — AI-driven component design
- **`react-best-practices`** — Component performance optimization
- **`responsive-design`** — Layout verification
- **`react-grab`** — UI element context capture

## Support

- **Issues**: https://github.com/facebook/astryx/issues
- **Discussions**: https://github.com/facebook/astryx/discussions
- **Contributing**: https://github.com/facebook/astryx/wiki/Contributing

## License

MIT (Astryx) · MIT (This skill)

---

**Version**: 1.0.0  
**Upstream**: https://github.com/facebook/astryx  
**Maintained by**: akillness/jeo-skills
