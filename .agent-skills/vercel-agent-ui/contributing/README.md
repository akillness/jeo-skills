# Contributing

Everything you need to work on ui-sdk, for people and agents alike. Start with the root `AGENTS.md`, then read what your task needs:

| File                                     | What's in it                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [architecture.md](architecture.md)       | The layers in core, `definePrimitive`, the rendering contract per framework, and the popup layer    |
| [api-guide.md](api-guide.md)             | The API rules: names, state and callbacks, reasons, parts, attributes, controllers, settled choices |
| [code.md](code.md)                       | How code is written, structured and reviewed                                                        |
| [pitfalls.md](pitfalls.md)               | What cost real debugging time, by framework, browser and tool                                       |
| [docs-site.md](docs-site.md)             | How the docs site, examples and agent Markdown are built, and how docs are written                  |
| [docs-writing.md](docs-writing.md)       | The website's writing style, with current pages as references                                       |
| [examples.md](examples.md)               | How the docs examples are styled                                                                    |
| [releasing.md](releasing.md)             | Changesets, the version pull request and publishing to npm                                          |
| [../tests/README.md](../tests/README.md) | Every kind of test, where it runs and the exact command                                             |

## The repo

- `packages/core`: the behaviors, primitives and kernel, with no framework, and in `skills/` the skill that ships to people building with ui-sdk (`ui-sdk`). `packages/react`, `vue`, `svelte`, `solid` and `web` render them.
- `apps/docs`: the docs site, which also serves the compiled examples.
- `apps/playground`: the fixtures the browser specs open, one folder per component and framework.
- `examples`: every docs example, in every framework, compiled by Vite into `apps/docs/public/examples`.
- `tests`: the Playwright specs, fixtures and perf budgets.
- `.claude`: one expert per framework, and the skill that runs their review.
- `scripts`: lint, formatting, the test plan, package checks and docs generation.

## Where things stand

Every component in `packages/core/src/components/` ships in all five frameworks: React, Vue, Svelte 5, Solid 2 and web components. Each has specs, a kitchen sink, docs and examples in every framework. Finishing what exists comes before new components.

## How we work

- **Small steps, each green.** A change ships with the tests that prove it, and a fix with the test that fails without it.
- **Behavior first, then looks.** Core decides behavior; examples decide how it looks.
- **Start from a component that exists.** A new component copies Menu or Tabs, or Popover when it opens a popup: core, the five adapters, the playground fixtures and kitchen sink, the specs, the examples and one docs page per framework.
- **One shape everywhere.** Every component follows the same composable shape, and every framework gets the same contract. When something is right for one component or framework and not the rest, the shape is wrong.
- **Ask before changing what users see.** A public API's name or shape, a new component, a new dependency or a change to a principle needs a maintainer's sign-off. Internal layout, tests and tooling don't.
- **Parallel sessions** each get their own git worktree and their own ports, and run tests through `scripts/test-slot.sh`.
- **Gates.** Before a merge: `pnpm lint`, `pnpm format`, `pnpm typecheck`, unit tests for the packages you touched, `pnpm --filter examples build`, `pnpm check:packages --build` and `pnpm test:pr` (add `--engines` for changes to pointer, scroll, focus, text input, gestures or form-associated elements). After a merge that touches shared code, `pnpm test:sweep`. Check exit codes, and rerun only what failed.
- **Framework experts.** Before merging a change to an adapter, core, the specs, examples or framework docs, run the `ui-sdk-expert-review` skill. `node scripts/expert-scope.mjs` shows which experts a change reaches.
