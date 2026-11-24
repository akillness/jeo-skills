# Code standard

Write code a highly skilled team would be glad to read, review and extend. Readable first, then fast, and never clever for its own sake. This applies to every file: core, adapters, tests, fixtures, examples and scripts.

## Style

- No semicolons. Double quotes. Lines up to 80 characters. Prettier formats every file: `pnpm format` checks, `pnpm format:write` fixes.
- Every `if`, `else`, `for` and `while` body goes in braces, even a one-line one. `pnpm lint` checks it (`scripts/check-braces.mjs`), and `pnpm format:write` adds them.
- Comments are rare, at most three lines, and full sentences ending in a period. `pnpm lint` checks the length (`comment-length`).
- Never annotate function return types; let them infer. One exception: a component's api gets a named type, `interface ComboboxApi extends ReturnType<typeof comboboxApiBody> {}`, and the function the primitive takes is typed with it, `const comboboxApi: (...args: Parameters<typeof comboboxApiBody>) => ComboboxApi = comboboxApiBody`. Without the name, declaration files repeat the whole api at every slot, which made core's types ten times their size. `pnpm lint` checks it (`named-api`).
- Prefer inline types. A Svelte component's props are the exception: an `interface Props` above `let { ... }: Props = $props()`.
- Named exports, listed once at the end of the file.
- Never write markup or a URL from a string in `packages/*/src`: no `innerHTML`, `dangerouslySetInnerHTML`, `{@html}` or `v-html`, and no write to `href` or `src`. Build elements, set text with `textContent`, and leave URLs to the app. The few files that must are on an allowlist in `scripts/check-code.mjs`, each with why its string is safe. `pnpm lint` checks it (`html-sinks`, `url-sinks`).
- `pnpm lint` (`scripts/check-code.mjs`, `scripts/check-comments.mjs` and `scripts/check-braces.mjs`) checks the rules a script can. Every new convention lands with its lint rule.

## Structure

- **One job per module.** Split a file by concern once it passes about 500 lines, or earlier when it holds two ideas. A component's core is usually: state and API, keyboard and focus, and parts and attributes.
- **Three folders in core.** `packages/core/src/foundation/` holds what components build on, `packages/core/src/components/` one folder per component, and `packages/core/src/page/` what works across a page. Imports go downward only; `import-layers` checks it. See [architecture.md](architecture.md).
- **One way to split a component.** A component's core starts in `<name>.ts`. Once it passes about 400 lines, `<name>-api.ts` (state and methods, with the function that builds the api, like `comboboxApi`) and `<name>-parts.ts` (slots) go beside the definition, and its keys go in `<name>-keyboard.ts`. `pnpm lint` checks the api file (`api-files`).
- **Exports at the end.** Declare everything without `export`, and list a file's exports once, in an `export { }` at its end, with re-exports and a default export after it, so one look at the bottom shows a file's whole surface. `pnpm lint` checks it (`exports-at-end`).
- **Entries are public.** Everything a package entry exports is public API, so an entry names its exports one by one, never `export *` or `export type *`. What only adapters need lives in a module that isn't an entry: core's goes out through `@ui-sdk/core/renderer`, an adapter's in a file like `toast-parts.tsx`. `pnpm lint` flags an `@internal` export an entry reaches (`internal-exports`). An adapter's entry for a component re-exports every type core's entry for it exports, by name, so each framework offers the same types. When the entry gives one of those names to something else, like the `SelectValue` component, it exports core's type with `Data` added (`SelectValueData`, `ToastData`). `pnpm lint` checks it (`entry-types`).
- **Share before you copy.** Before writing a helper, look in core's foundation folders and the adapters. If two components need the same logic, move it into one shared module in the same change.
- **Keep behavior in core,** and keep adapters thin and generic. If a component needs an adapter change, it must help every primitive.
- **Parts through the contract.** A component's parts come from `createParts`, typed and documented from the primitive's schema. Write a part by hand with `usePart` only when it renders something of its own, and say why in a comment. Schemas are plain object literals, never spreads, so esbuild can drop unused primitives.
- **Side effects at the edges.** Decisions are pure functions with plain inputs, and they're unit tested. `bind`, listeners and DOM writes call them.
- **No dead code:** no commented-out code, unused exports, leftover probes or `console.log`.
- **No dependencies.** Shipped packages depend only on `@ui-sdk/core` and their framework as a peer. Write it yourself before adding a package: core's positioning is its own. Dev tooling is fine.

## Names and functions

- **Names say what a thing is or does,** in full words: `highlightedItem`, not `hi`. Booleans read as questions: `isOpen`, `hasValue`.
- **Short functions with one level of abstraction.** Return early instead of nesting. Name complex conditions with a well-named `const` or a small function.
- **Prefer plain data and functions** over classes and inheritance. Closures over hidden module state.
- **Most code needs no comment.** A name and a type say what a thing is. Write one only when a reader would get the code wrong without it: a browser bug, an APG rule, a trade-off. Never describe what the next line does, what a value holds, where it's stored or how the pieces connect: the code shows that. An explanation that needs more than three lines belongs in the docs page, a test title or `contributing/`. Examples have no comments: their docs page explains them (`example-comments`).

## Types

- **Precise types that infer well;** no `any`. `unknown` plus narrowing at boundaries is fine.
- **Non-null assertions (`!`) and casts only with a reason** the code makes obvious, or a comment. No `as never`.
- **Public types carry JSDoc on every field.** That's the API reference. Every export of core's public entries and of every adapter entry has a JSDoc comment too, components and hooks included, since agents read the types to build components and people learn a part from its hover in their editor. Say what the part is and anything they must know, like the role it renders or where it goes, in the words of its docs page and the same words in every framework. A Svelte component takes a `<!-- @component -->` comment at the top of its file instead. `pnpm lint` checks it (`public-docs`). Each one but its types and its primitives is named on a docs page too, with what it's for (`public-docs-pages`).
- **Every public export says how settled it is,** with `@stable` (follows semver) or `@experimental` (may change in any minor release). New blocks start experimental. `pnpm lint` checks it (`stability`).
- **Avoid `Required<…>` on option types that grow.** Adding an option becomes a breaking type change for every caller.

## Performance

- **No layout reads inside loops,** and never read layout after a write in the same frame. Batch reads, then writes.
- **No allocations or object identity churn on hot paths:** pointer moves, scroll, highlight, typing. Keep render-state arrays and objects stable.
- **Linear work over collections.** Watch for O(n²) hiding in `find` inside `map`, or in repeated `querySelectorAll`.
- **Measure before optimizing,** and say what you measured.
- **Live state never causes framework renders.**

## Tests

- **One behavior per test,** titled as a plain sentence a reader can check. Docs pages list behavior from spec titles.
- **Role-based locators,** and waits on real conditions, never fixed sleeps.
- **Fixtures as small as the behavior needs.**
- **A fix comes with the test that fails without it.**

## Before you finish: review your own diff

Read your whole diff as a strict reviewer would, and fix what you find:

- Is every name clear?
- Is any function doing two things?
- Is anything duplicated that exists elsewhere?
- Is any file now too long?
- Any dead code, debug output, stray `any` or unexplained casts?
- Would the code read as well without each comment you added? Then delete it.
- Any hot-path allocation or layout thrash?
- Would a new teammate understand each module from its first screen?
