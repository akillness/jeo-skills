# ui-sdk

ui-sdk is a TypeScript library of UI behaviors for building interfaces. It isn't a component library. It's the layer underneath one: keyboard navigation, focus, selection, dismissal, popups, drag and drop and the ARIA they need, as small functions you combine in `@ui-sdk/core`.

## How it fits together

- **Behaviors** are the building blocks. Each is one thing an interface does, like moving focus with the arrow keys (`createRovingFocus`).
- **Primitives** put one component's options, state, behaviors and parts together in a single definition (`definePrimitive`), with no styles.
- **Adapters** render a primitive in React, Vue, Svelte, Solid and web components, with the same names everywhere (`createParts`). You write the markup and styles. State shows up as data attributes and CSS variables.
- **Checking.** `@ui-sdk/core/testing` checks the result against its WAI-ARIA pattern, in right to left and on the server.
- **Agents** can operate a finished interface through `@ui-sdk/core/agent` (`snapshot`, `act`).

## Why we're building it

Component libraries cover familiar patterns like menus, dialogs and tabs. Real products also need things nobody ships: a kanban board, a timeline you can scrub, a picker made for one task. Agents can now generate those interfaces, but each time they rebuild focus, arrow keys and screen reader support from scratch, and they get it subtly wrong. ui-sdk gives people and their agents tested behaviors to build any component on, and a way to check the result.

## Principles

- No runtime dependencies.
- Works with SSR and before hydration. Right to left works without a provider. Popups work without portals.
- Small, predictable APIs with one shape across components and frameworks, so a model writes them correctly in few tokens.

## Read first

1. [contributing/README.md](contributing/README.md): the repo, where things stand and how we work, with links to the architecture, the API guide, the code standard, the pitfalls and the docs site.
2. [tests/README.md](tests/README.md): every kind of test and the exact command.

## Rules

- **Zero runtime dependencies** in shipped packages. Behavior lives in core; adapters stay generic.
- **One shape everywhere.** Every component follows the same composable shape, with the same contract in every framework. A part changes its element through `render`, never an `as` prop.
- **Discuss first** before changing a public API's name or shape, adding a component or a dependency, or changing a principle.
- **Commits** are conventional, with a lowercase subject.
- **Code** follows [contributing/code.md](contributing/code.md): no return type annotations, inline types, named exports listed at the end of each file. `pnpm lint` and `pnpm format` check what they can; `pnpm format:write` fixes formatting.
- **Comments are rare.** Write none unless a reader would get the code wrong without it: a browser bug, an APG rule, a trade-off. Three lines at most, ending in a period. Never say what the code does, what a value is or how the pieces connect. `pnpm lint` checks the length.
- **Finish with unslop.** Write code with [ui-sdk-write-code](.agents/skills/ui-sdk-write-code/SKILL.md), and run [ui-sdk-unslop](.agents/skills/ui-sdk-unslop/SKILL.md) on your diff before you commit.
- **Examples** have no comments, and follow [contributing/examples.md](contributing/examples.md).
- **Docs.** When writing or reviewing website docs, use [ui-sdk-write-docs](.agents/skills/ui-sdk-write-docs/SKILL.md). [Writing Website Docs](contributing/docs-writing.md) records the current style; [the docs-site guide](contributing/docs-site.md) covers the implementation.
- **Tests.** Every server command sets its own port. Run tests through `scripts/test-slot.sh`. Check exit codes, not grep output. Run the specs for what you touched (`pnpm test:pr`), and rerun only what failed.

## Skills

- `.agents/skills/` holds the skills for working on ui-sdk: `ui-sdk-write-code`, `ui-sdk-write-docs`, `ui-sdk-unslop` and `ui-sdk-expert-review`. [Its README](.agents/skills/README.md) says when to use each. Plain Markdown, usable from any harness: read `SKILL.md` and follow it.
- `packages/core/skills/ui-sdk` ships inside `@ui-sdk/core` to people building their own components on it. `skills.sh.json` points `npx skills add vercel-labs/ui` at that folder. The skills in `.agents/skills/` are marked `internal`, so it doesn't offer them.

## Framework experts

One expert per framework in `.agents/experts/<framework>/` (react, vue, svelte, solid, web): who it is in `expert.md`, what it knows in `knowledge.md` and what's already decided in `decisions.md`. Claude Code also loads each one as a named subagent from `.claude/agents/<framework>-expert.md`. Ask one any question about its framework, or ask it to review code. Before merging a change to an adapter, core, the specs, examples or framework docs, run `ui-sdk-expert-review` on it; `node scripts/expert-scope.mjs` shows which experts it reaches.
