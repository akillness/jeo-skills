# OpenCut Classic — Local Setup

Repo: `opencut-app/opencut-classic` (archived, but the codebase actually
running at opencut.app today).

## Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Node.js](https://nodejs.org/en/) v18+ (some tooling still expects it)
- [Docker](https://docs.docker.com/get-docker/) + [Docker Compose](https://docs.docker.com/compose/install/) — optional but recommended; needed for local Postgres + Redis. Skip if only touching frontend-only features.
- Rust toolchain — only needed for `apps/desktop` or local `rust/wasm` edits.

## Setup (web app)

1. Fork and clone the repository.
2. Copy the env file:

   ```bash
   # Unix/Linux/Mac
   cp apps/web/.env.example apps/web/.env.local
   # Windows PowerShell
   Copy-Item apps/web/.env.example apps/web/.env.local
   ```

   The example defaults already match the Docker Compose config, so it should
   work out of the box once Docker services are up.
3. Start the database and Redis:

   ```bash
   docker compose up -d db redis serverless-redis-http
   ```
4. Install dependencies and start the dev server:

   ```bash
   bun install
   bun dev:web
   ```
5. Open http://localhost:3000.

Web development uses the **published** `opencut-wasm` npm package by default —
a fresh clone does not need a local WASM build.

## Desktop setup (opt-in)

Only needed if working on `apps/desktop`. See `apps/desktop/README.md` — it is
a two-step process: Rust toolchain first (`script/setup-rust`), then desktop
native dependencies (`apps/desktop/script/setup`).

## Local WASM development (opt-in)

Only needed if editing `rust/wasm` and you want `apps/web` to use your local
build instead of the published package.

Prerequisites (install once):

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust toolchain
cargo install wasm-pack
cargo install cargo-watch   # used by `bun dev:wasm`
```

Steps:

```bash
# from repo root — build the package once
bun run build:wasm

# register the generated package for linking
cd rust/wasm/pkg && bun link

# link apps/web to the local package
cd ../../../apps/web && bun link opencut-wasm

# rebuild on changes while working
bun dev:wasm
```

To switch back to the published package:

```bash
cd apps/web
bun add opencut-wasm
```

## Self-hosting everything with Docker

```bash
docker compose up -d
```

The full production build becomes available at http://localhost:3100.

## Gotchas

- Re-check `.env.example` after pulling — new required env vars are a common
  source of "works for maintainers, broken for me" setup failures.
- Docker Compose service names (`db`, `redis`, `serverless-redis-http`) can
  change; re-read `docker-compose.yml` if `docker compose up -d db redis ...`
  fails with an unknown-service error.
- If a change touches WASM-exported functionality, confirm whether you need
  the local-link workflow above or whether the published package already
  covers it.
