# zvec-grep upstream and setup notes

## Audited source

- Repository: <https://github.com/zvec-ai/zvec-grep>
- Package command reference: <https://unpkg.com/@zvec/zvec-grep@0.2.2/docs/02-cli.md>
- Audited package: `@zvec/zvec-grep@0.2.2`
- Runtime: Node.js `>=22`
- License: Apache License 2.0, verified from the repository `LICENSE` file
- Primary executable: `zg`
- Primary MCP endpoint: `http://127.0.0.1:7999/mcp`

The project is active and GitHub `main` currently documents a different,
unreleased long-action CLI contract. This skill pins the released npm 0.2.2
subcommand form: `zg query`, `zg index`, `zg status`, `zg install`, and
`zg server`. Treat installed `zg help` as the final operational truth.

## Installation choices

```bash
npm install -g @zvec/zvec-grep@0.2.2
zg version
```

Do not run a blanket `npm install`, model download, server startup, index build,
agent config mutation, or remote provider setup during catalog installation.
Those are task-triggered operations. The npm package includes native zvec
bindings and local model dependencies; the host must be able to load the native
binding for actual indexing or query execution.

## What the skill does not vendor

This catalog skill is a thin operational router. It does not copy upstream
TypeScript, `dist`, native bindings, models, benchmark datasets, generated assets,
or agent configuration files. Read upstream docs through the pinned links when a
version-specific detail is needed.
