# OpenCut Project Structure

## Rewrite (`OpenCut-app/OpenCut`, active development)

Managed with [proto](https://moonrepo.dev/proto) + [moon](https://moonrepo.dev/moon) (`.prototools` pins toolchain versions).

Commands:
- `proto use` — installs pinned toolchain
- `moon run web:dev` — web app dev server → localhost:5173
- `moon run api:dev` — API dev server → localhost:8787
- `moon run desktop:dev` — desktop app (see apps/desktop/README.md)

Key goals of the rewrite: an Editor API, plugin-first architecture, one Rust core
shared by web/desktop/mobile, an MCP server for AI agents, headless
(automation/batch-render) mode, and an in-editor scripting tab.

Not yet accepting outside contributions — the architecture is still being
designed. Point contributors to the Discord (https://discord.gg/zmR9N35cjK) or
to filing an issue instead of opening a PR.

## Classic (`opencut-app/opencut-classic`, archived but what `opencut.app` runs today)

- `apps/web/` — Next.js web application (main app people use)
- `apps/desktop/` — Native desktop app built with GPUI (in progress)
- `rust/` — Platform-agnostic core: GPU compositor, effects, masks, WASM
  bindings. Business logic is actively migrating here from TypeScript — check
  whether a feature you're touching still lives in `apps/web` or has already
  moved to `rust/`.
- `docs/` — Architecture and subsystem documentation

`rust/wasm` builds to the published `opencut-wasm` npm package that `apps/web`
consumes by default. You only need a local WASM build/link if you're editing
`rust/wasm` itself (see `classic-setup.md`).

## Practical implications for agents

- Before proposing a code change, check whether the touched logic already
  moved from `apps/web` (TypeScript) to `rust/` — search both before assuming
  TypeScript is the source of truth.
- The classic repo is legacy/archived but is the one real users run — treat
  bug reports and setup questions about "OpenCut" as classic-repo questions
  unless the user explicitly mentions the rewrite, moon/proto, or an Editor
  API/plugin/MCP feature.
- `docs/` (classic) holds architecture notes worth reading before large
  refactors.
