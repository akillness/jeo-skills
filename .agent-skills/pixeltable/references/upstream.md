# Pixeltable pinned-source operator notes

**Repository:** `pixeltable/pixeltable` at `ade3972b3ff88981bbac2e715638cccd1dee0205` (observed 2026-10-16). The pinned docs describe a Python multimodal database. It has a relational/catalog surface and media-aware computation; it is distinct from a Markdown knowledge graph and from a business ontology catalog.

## Local first-use and project configuration

- The `pxt` CLI ships with the `pixeltable` package. The pinned CLI guide documents `pxt --help` and `pxt health`; the first catalog command auto-spawns a daemon on `127.0.0.1:22089` by default, with `PXT_PORT` override. Service commands require the `serve` extra. Verify current installed version and package extras before use.
- `pxt init` writes `pixeltable.toml` at the project root, or appends a `[[tool.pixeltable.database]]` entry to `pyproject.toml` if present. It reports an existing project config instead of overwriting; a project config above the cwd can cause refusal. Inspect cwd and ancestor configs first because this command is a write.
- Configuration can come from process environment, `~/.pixeltable/config.toml`, or `pxt.init()` for the calling process. The docs say Pixeltable does not load `.env` itself; environment variables are preferred for settings and provider keys belong in secrets / `pxt secret`. On hosted Cloud, `PIXELTABLE_API_KEY` takes precedence over config, which outranks login session. Never disclose key values.

## Choose commands by effect

- **Read-only inspection/query:** `health`, `status`, `ls`, `describe`, `columns`, `computed`, `idxs`, `history`, `config`, `rows`, `get`, `count`, `errors`, `schema diff`, service/db status and list operations. Use current `pxt <command> --help` to confirm exact arguments.
- **Catalog mutation:** `drop`, `drop-dir`, `rename`, `mv`, `recompute`, `revert`; schema `update`/`prune`; service updates/prune. The CLI docs support `--dry-run` for listed catalog mutations and selected schema/service/database mutations. Confirm target and expected changes; dry-run does not authorize apply.
- **Remote/cloud:** `login`, `db`, `secret`, `org`, `key`, and service deployment can access hosted resources or change credentials, permissions, or infrastructure. User approval must name the scope before these operations.
- The CLI starts a long-lived local daemon for catalog commands. Daemon startup/stop/restart and public service startup are operational side effects; ask before activation.

## Common diagnosis sequence

1. Check daemon health and status separately from service/Cloud status.
2. Inspect catalog path and target table/view with `ls`, `describe`, `columns`, and `history` before changing it.
3. For failed computed rows, use `errors` and column metadata to identify the failing expression/dependency before `recompute`.
4. For schema reconciliation, use `schema diff` first. `schema update` and `schema prune` mutate catalog state; inspect additions, changes, and removals before approval.
5. For missing media, distinguish row/catalog presence from media destination/storage access. Inspect configured media destinations and Cloud/home-bucket rules without revealing credentials.
6. For hosted services, separate local project-root/config problems from image build, Cloud DB status, API key/login, and service runtime. Verify live state directly; source files do not prove deployment.

## Offline source preflight

Parent-provided command form:

```bash
python3 .agent-skills/pixeltable/scripts/preflight.py --repo /absolute/upstream --json
```

Installed-root form: `python3 /absolute/installed/pixeltable/scripts/preflight.py --json`. Without `--repo`, the helper performs inventory-only checks. It is read-only stdlib code: no subprocess, network, credential-file reads, or writes. `--repo` requires an explicit absolute nonsymlink path. Its secure traversal requires Python 3.10+ on POSIX Linux/macOS or WSL2 on Windows; unsupported native platforms fail closed. This describes helper support only, not Pixeltable's upstream application/platform support. It compares selected pinned public-file hashes, not Git HEAD/full revision, package integrity, local database, Cloud state, or runtime; PATH checks mean command presence only. Exit 0 = offline checks passed, 1 = missing/mismatch, 2 = invalid input; `runtime_verified` remains false. Commands are documentation only here.

## Pinned source links

- [README](https://github.com/pixeltable/pixeltable/blob/ade3972b3ff88981bbac2e715638cccd1dee0205/README.md)
- [CLI reference](https://github.com/pixeltable/pixeltable/blob/ade3972b3ff88981bbac2e715638cccd1dee0205/docs/release/platform/cli.mdx)
- [Configuration reference](https://github.com/pixeltable/pixeltable/blob/ade3972b3ff88981bbac2e715638cccd1dee0205/docs/release/platform/configuration.mdx)
- [`pxt` command dispatch](https://github.com/pixeltable/pixeltable/blob/ade3972b3ff88981bbac2e715638cccd1dee0205/pixeltable_cli/client/main.py)
- [`pxt init` write/refusal behavior](https://github.com/pixeltable/pixeltable/blob/ade3972b3ff88981bbac2e715638cccd1dee0205/pixeltable_cli/client/commands/init.py)
- [Configuration implementation](https://github.com/pixeltable/pixeltable/blob/ade3972b3ff88981bbac2e715638cccd1dee0205/pixeltable/config.py)
- [Apache License 2.0](https://github.com/pixeltable/pixeltable/blob/ade3972b3ff88981bbac2e715638cccd1dee0205/LICENSE): full pinned text inspected; reuse is subject to Apache 2.0 conditions, notices and warranty disclaimer. This skill copies no upstream code.
