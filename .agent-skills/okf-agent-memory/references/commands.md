# CLI and MCP operator reference

Commands below are examples from the reviewed upstream contract. They are not permission to execute them. Ask for explicit approval before installation, build, bootstrap, writes, MCP registration, vendor/network operations, or Git mutations.

## Offline source preflight

Use the bundled dependency-free helper to check an existing checkout against the pinned commit and fixed source markers:

```sh
python3 /path/to/okf-agent-memory/scripts/preflight.py \
  --repo /path/to/okf-agent-memory --json
```

It requires Python 3.11+, inspects file metadata without reading marker contents, rejects symlinks anywhere in the checkout path or required marker paths, and rejects markers over 1 MiB. It runs only local `git rev-parse` with a restricted Git environment; it never runs `okf`, Go, Make, or upstream scripts. `status: blocked` or a nonzero exit means the checkout is not verified. Do not use `--expect-commit` to weaken the pinned-source claim; that override is for isolated regression fixtures or an explicitly requested alternate revision.

## Read-only checks and retrieval

```sh
okf version
okf search "authorization cookie policy" /path/to/project/knowledge --scope project --limit 10 --json
okf search --for-path src/auth /path/to/project/knowledge --scope project --json
okf show decisions/auth /path/to/project/knowledge --json
okf validate /path/to/project/knowledge --strict --drift --json
```

- `search` uses local BM25 retrieval. The default limit is 10.
- `--scope project` (also called `bundle`) restricts search to the project bundle. The default scope is `all`, which may also include vendor, user, and system memory. Specify `project` unless broader access was requested.
- `--for-path` discovers concepts whose `code_refs` cover the requested source path. It does not prove those concepts are accurate or current.
- `validate --strict` treats broken links, orphans, provenance problems, and schema discrepancies as fatal. `--drift` checks index descriptions and `code_refs`; `--stale` and `--stale-within` are separate lifecycle gates. Validation is not a factuality review.
- Upstream documents exit code 0 for a conformant gate, 1 for a failed gate, and 2 for a filesystem/bundle-loading error. Preserve the JSON result and exact exit code when reporting.

## Approved writes

Use only after the user approves the exact target and operation. Search and inspect the concept first; then use the tool's bookkeeping rather than manually rewriting index/log files.

```sh
okf create decisions/authz /path/to/project/knowledge \
  --type Decision --title "Authorization policy" \
  --desc "One concise, source-backed sentence." \
  --actor "agent/<tool-name>" --json

okf update decisions/authz /path/to/project/knowledge \
  --desc "Updated one-sentence summary." --actor "agent/<tool-name>" --json

okf relate decisions/authz architecture/backend /path/to/project/knowledge \
  --desc "The backend enforces this authorization decision." --json
```

- Persist only durable, non-sensitive facts with source evidence. Never add credentials, PII, raw conversations, private reasoning, speculative claims, or large unparsed logs.
- Mark agent authorship with an agent actor. Never create a human `verified` field or imply a human reviewed something when they did not.
- If the CLI updates `index.md` or `log.md`, include those exact paths in the final diff review.

## Bootstrap and MCP

`okf bootstrap /path/to/project --name "Project Name"` may create or update `knowledge/`, `.agents/skills/okf-memory/`, `AGENTS.md`, and `Makefile`. Inspect all four paths and the current working tree first. Run it only after explicit approval, and verify exactly which existing files were replaced or extended.

A documented stdio MCP configuration uses the `okf` executable and the project knowledge path:

```json
{
  "mcpServers": {
    "okf-memory": {
      "command": "/absolute/path/to/okf",
      "args": ["mcp", "/absolute/path/to/project/knowledge"]
    }
  }
}
```

MCP exposes search/show plus create/update/relate/validate tools. Registering it edits agent configuration and enables future tool writes; obtain approval before changing config. Do not expose user/system scopes unless explicitly requested.

## Install and build caveats

- The getting-started guide lists Homebrew (`brew install okf-memory/tap/okf`), a release binary, and source build. Installing a package, downloading a binary, or changing a host path requires approval.
- The guide's release example uses a moving `releases/latest` URL. Do not treat that as a reproducible pin; verify the exact release and asset before an approved download.
- The guide says Go 1.22+, but the audited commit's `go.mod` says Go 1.26.0. For source builds, follow the pinned `go.mod` and check the actual toolchain before running `make build` or `make check`.
- `okf pull`, `okf restore`, and vendor-management commands can fetch or change bundle content. They are not part of the default local project-memory workflow; get explicit approval and inspect the destination.
