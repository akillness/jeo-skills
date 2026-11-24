# The docs site

`apps/docs` is a Next.js app with Fumadocs. It serves the docs, the compiled examples and the Markdown files agents read.

## Running it

- `pnpm dev` runs `scripts/docs-dev.sh`: it builds the examples, starts the docs on `localhost:5400` (`DOCS_PORT` changes it), and rebuilds a framework's examples within seconds of a change to its examples or adapter. A change to core rebuilds them all. Reload to see it.
- `pnpm docs:prod` builds the examples and the docs and serves the production build, which is what to browse when you want every page fast.
- `pnpm test:docs` opens every example in every framework and checks the docs pages. It needs the docs server on 5400.

## Layout

- `apps/docs/content/docs/` has one folder per section: `core` and `agents`, which are shared across frameworks, and `react`, `vue`, `svelte`, `solid` and `web-components`, one full copy of the docs per framework.
- A framework's name alone, like `/react`, redirects to its docs at `/docs/react`.
- A framework's docs have no `<Framework only>` blocks. A page differs per framework in its own copy, so an edit that holds for every framework is made in each copy. A component a framework doesn't have gets no page there.
- Core and Agents link to a framework's pages without naming one, like `/docs/components/field`, which redirects to the framework the reader last read (a cookie its pages set), else React. Switching framework keeps the page: a framework's page goes to its copy in the other, and Get Started, Core, Agents and Guides stay put and fetch the page built for the new one (`FollowFramework` in `site-preferences.tsx`). On phones the switch is a select at the top of the menu.
- Get Started, Core and Agents are built once per framework, under `app/for/[framework]`, and `next.config.mjs` rewrites each request to the reader's by that same cookie. Their `<FrameworkContent>`, framework tabs and links render the reader's framework on the server, so nothing changes once the page loads, and the pages stay static. Read the path with `useDocsPathname`, which drops the `/for/<framework>` prefix the server renders under.
- Each section's order is its `meta.json`.

## Component pages

- One page per framework: `apps/docs/content/docs/<framework>/components/<name>.mdx`. Write React's first, then copy it to each framework and rewrite only what differs: installation, composition, code, callback names (`@open-change` in Vue, the `openchange` event on web components) and framework notes.
- Examples render with `<ComponentExample name="<name>/<example>" />`.
- The API reference comes from the code: `<TypeTable path="../../packages/core/src/components/<name>/<name>.ts" name="..." />`, `<StateTable>`, `<ReasonTable>` and `<ControllerTable>` (same `path` and `name` props, read from the exported types), `<DataAttributes component="<name>" part="<slot>" />` and `<CssVariables component="<name>" part="<slot>" />` (one part's table each, from `lib/data-attributes.ts` and `lib/css-variables.ts`), and `<SpecList spec="<name>" />`, which lists behavior from spec titles.
- `TypeTable` example links use heading text in the `examples` map. When renaming a heading, update these maps and incoming fragment links too.
- Add the component to `tests/docs/props.spec.ts`, which checks that every exported prop and state field appears in at least one React example.

## Examples

- Laid out framework first, with the same example names in every framework, each doing the same thing. `pnpm test:docs` fails if a folder is missing one.

  ```
  examples/components/<name>/react/<example>.tsx     exports Example
  examples/components/<name>/vue/<example>.vue
  examples/components/<name>/svelte/<example>.svelte
  examples/components/<name>/solid/<example>.tsx     exports Example
  examples/components/<name>/web/<example>.ts        exports mount(root)
  ```

- Next never compiles the examples. `examples/vite.config.ts` builds each framework's, with the SDK bundled, to `apps/docs/public/examples/<framework>` (`pnpm --filter examples build`, or `node examples/scripts/build.mjs react vue` for some). Every file name carries a hash, so the site serves them as immutable static files.
- The examples bundle Vue, Svelte and Solid, but not React: the React examples borrow the docs' own React, Next's copy, which `lib/examples-react.ts` puts on `globalThis.__docsReact`. The build reads that copy's exports and fails on an import it lacks. So in the docs the examples run on Next's React, while the specs run on the catalog's.
- `ComponentExample` looks the example and its framework's mount up in the build's `manifest.json` (`lib/example-modules.ts`). The first two on a page preload every chunk they import with `<link rel="modulepreload">`, so the files download while the page parses. `ExamplePreview` preloads and imports the rest as they near the viewport, or when the reader reaches their frame.
- Until then the preview shows the example's HTML, rendered in Node by `examples/prerender/<framework>.ts` and written to `prerender.json` beside the manifest, `inert` and `aria-hidden`. The example replaces it in the same frame. A React example renders in the page's tree, under `Suspense` with that HTML as its fallback and an error boundary; the other frameworks mount into the preview. Web components have no server rendering, so their previews start empty, as does an example that fails to render in Node, which the build lists. A web example's `mount(root)` may return a cleanup, which the preview calls.
- The build also writes each example's stylesheets to `styles.json` beside the manifest, and the shared stylesheets to `public/examples/styles` (`node examples/scripts/build.mjs styles`). `ComponentExample` renders them as `<link rel="stylesheet" precedence="examples">`, which React moves into the head once per page, so a page loads only its examples' styles, before the first paint.
- `apps/docs/public/examples` is gitignored, so a deploy runs `pnpm --filter examples build` before `next build`. A page reads the manifest when it renders, so rebuilding the examples under `next dev` needs a reload.
- Examples render in the page, not in an iframe, so overlays and focus behave as they do in apps.
- Example code renders as Shiki's HTML, one element per block.
- How to style them is in [examples.md](examples.md).

## Core and Agents

- `/docs/core` explains building components from core. Shared pages can use `FrameworkContent` for framework-specific snippets, as Preferences does. Each framework's Rendering page covers rendering primitives in that framework.
- Core's Reference is generated from `packages/core/src/index.ts` (`apps/docs/lib/core-exports.ts`), so a new export appears with its JSDoc.
- The walkthrough's code blocks are extracted from Compose Behaviors and the framework's Rendering page, and run by `packages/react/test/docs-walkthrough.test.tsx` and `packages/web/test/docs-walkthrough.test.ts`. Edit the pages and the tests together.
- A new public block gets its own page under `core/`, an entry in its section's `meta.json`, and a mention on the Behaviors overview.

## Markdown for agents

- `/docs/core.md` and `/docs/agents.md` serve each section as one Markdown file (`lib/section-markdown.ts`), and `/llms.txt` points to them.
- `/docs/<framework>/llms.txt` (`app/docs/[section]/llms.txt/route.ts`, `lib/llms.ts`) is where an agent starts building with that framework: its guides whole, then an index of every component with its import and a link to its page, then its utilities in compact form (`pageMarkdown(..., { compact: true })`). It stays small enough to read in one go.
- `pnpm docs:packages` writes the same docs as Markdown into each package's `docs/` folder (gitignored) with `scripts/package-docs.mjs`, so the docs reach whoever installs a package. The release workflow runs it before packing. It bundles `apps/docs/lib/package-docs.ts` and reads the same MDX and tables as the site, so a new docs tag needs a Markdown case in `apps/docs/lib/page-markdown.ts`. A table's data lives in `apps/docs/lib`, its rendering in `apps/docs/components`.
- `@ui-sdk/web` also ships `custom-elements.json` and VS Code's `html-custom-data.json`, generated from the real define calls by `apps/docs/lib/custom-elements.ts`. Descriptions come from the docs page's summary and the comment above each define call, so write that comment for users. `packages/web/test/custom-elements.test.ts` fails on any attribute, property, event or method without a description. A slot takes its part's public prop type, never an inline copy, or the JSDoc doesn't reach the manifest.

## Writing

Follow [Writing Website Docs](docs-writing.md) for prose, page scope, examples, and captions. Agents writing or reviewing these pages use [ui-sdk-write-docs](../.agents/skills/ui-sdk-write-docs/SKILL.md).
