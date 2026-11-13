# Operations

The pinned source and upstream links are in [sources.md](sources.md). Features can differ in installed releases: check their help and advertised MCP schemas, without assuming the snapshot matches the installation.

## Choose a surface

- Existing MCP: `resolve-library-id` takes `libraryName` and `query`; `query-docs` takes `libraryId`, `query`, and optional `language`. Use the schemas exposed by the host. Some deployments advertise experimental `query-code`; do not assume it is enabled. It takes `libraryId`, optional `version`, `operation` and operation-specific fields: `grep`, `definition`, `references`, `outline`, `read`, `list`. `pattern` is a regex, not a natural-language question; use `fixed_strings` for literal errors. Read library source paths only and cite file/line. An indexing response is not proof the requested version was found.
- Installed CLI: `ctx7 search "question"` selects libraries; optional `--library` can be repeated up to four times, and `--library-version`, `--language`, `--json` narrow or structure results. For explicit selection, `ctx7 library React "question"` then `ctx7 docs /reactjs/react.dev "question" --language TypeScript --json`. A supplied exact ID can bypass resolution. The CLI requires Node.js 22.13 or later. These lookup commands contact the service; first verify network and data-sharing authorization.
- REST: `GET /api/v3/search` takes `query`, optional repeated `library`, `version`, `language`, `type`; `GET /api/v2/libs/search` takes `libraryName`, `query`; `GET /api/v2/context` takes `libraryId`, `query`, optional `type`, `language`. The API guide specifies `Authorization: Bearer` API-key authentication; CLI/MCP anonymous availability and quota differ. Never paste a real key into an example or expose it in logs. `GET /api/v3/fetch` fetches a supplied page URL; do not send private URLs or tokens without specific authorization.

IDs are Context7 paths such as `/vercel/next.js` or `/websites/uploadcare`, with version as `/version` or `@version`. An unavailable numeric version can return a different indexed release/current docs; inspect the JSON `version` object or text note. An unavailable named branch/channel can return `404 version_not_found`. Do not call a fallback exact.

## Setup and lifecycle

After approval, inspect the intended project/global target and the installed CLI's help, then choose `ctx7 setup --mcp` or `ctx7 setup --cli` with the appropriate agent and `--project` if project-local. Setup can write MCP configuration, agent rules and skills; the default is global. Without supplied auth options, setup initiates device OAuth and can create/store an API key. `--oauth` is MCP-only. `ctx7 login`, `ctx7 whoami`, and `ctx7 logout` affect or inspect an account session; do not run them as offline probes. `ctx7 remove` removes generated configuration and is not the same as uninstalling the CLI. Preview existing files, collisions and rollback before any change.

On-prem `ctx7 setup --mcp --base-url https://context7.internal.example --codex` uses the deployment root, not `/mcp` or `/api`; custom base URL cannot be combined with `--oauth`, `--stdio`, or `--cli`. Pinned docs say setup probes the deployment and skips cloud telemetry/update/rule fetches for this mode. Treat actual installed behavior as unverified until checked. Cloud MCP URL is `https://mcp.context7.com/mcp`; credentials are configured through the client's secure mechanism.

## API administration and errors

`GET /api/v2/usage`, `/api/v2/libs/metrics` and `/api/v2/policies` are account/teamspace reads and need authorized scope. `POST /api/v1/refresh`, `PATCH /api/v2/policies`, and `POST /api/v2/add/...` change or submit data; require separate approval for the exact resource and content. Ingestion may expose submitted materials to the service. The upstream API backend, crawler and parser are private; this repository is not a self-hosted replacement for the full cloud service.

For `401`, check authentication without printing secrets; for `403`, check scope; for `404`, distinguish missing library/version from v3 `no_documentation_found`; for `429`, honor `Retry-After` and quota; for `503`, report temporary failure. `202` means processing is incomplete, not successful documentation retrieval. Avoid unbounded retries. Upstream notes `301` can provide `redirectUrl`: verify the new ID before following it.
