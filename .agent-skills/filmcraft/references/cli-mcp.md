# CLI and MCP contract

Evidence: [`docs/agents.md`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/docs/agents.md), [`apps/filmcraft-cli/src/main.rs`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/apps/filmcraft-cli/src/main.rs), and [`apps/filmcraft-cli/src/args.rs`](https://raw.githubusercontent.com/storytold/filmcraft/1fdfd8324db4aa23b08c69f518b086e632f75f84/apps/filmcraft-cli/src/args.rs), all at pinned commit `1fdfd8324db4aa23b08c69f518b086e632f75f84` (inspected 2026-10-12).

## Build and launch (permission gate)

```sh
cargo build --release -p filmcraft-cli -p filmcraft
./target/release/filmcraft --control 9876
./target/release/filmcraft-cli --demo inspect
./target/release/filmcraft-cli mcp --demo
./target/release/filmcraft-cli mcp --bridge 127.0.0.1:9876
```

A release install may provide `filmcraft-cli` separately: macOS ships a separate CLI zip, Linux packages use `/usr/bin/filmcraft-cli`, and the Windows MSI defaults to `C:\Program Files\FilmCraft\filmcraft-cli.exe` (not `PATH`). If the user has already authorized this exact install/build, do not ask again; otherwise obtain permission before installing or building.

`filmcraft-cli` options may appear anywhere. Headless options include `--project`, `--demo`, `--save`, `--save-as`, `--data-dir`, and `--compact`; commands include `exec`, `run`, `commands`, `describe`, `inspect`, `import`, `export`, `render`, `probe`, `bench-decode`, and `mcp`. The `mcp` subcommand rejects unknown options with exit 2; other subcommands may silently ignore typo options, so verify with `help`, `commands`, or `describe`. For `mcp`, do not combine `--bridge` with `--project` or `--demo`: the bridge backend wins and those flags are silently ignored; verify the running desktop app's current project instead.

## Headless CLI

```sh
filmcraft-cli --project /abs/project.fcproj inspect
filmcraft-cli --project /abs/project.fcproj inspect sequence
filmcraft-cli --project /abs/project.fcproj commands
filmcraft-cli --project /abs/project.fcproj describe sequence.inspect
filmcraft-cli --project /abs/project.fcproj probe /abs/source.mov
filmcraft-cli --project /abs/project.fcproj render --seconds 2 --out /abs/frame.png
filmcraft-cli --project /abs/project.fcproj export /abs/out.mp4 --format h264
```

`exec <id> [key=value ...]` accepts JSON-parsable values (numbers, booleans, arrays, objects) and dotted keys; it also accepts one JSON object. `run` consumes JSONL command steps. Use `--save` to write back to `--project`, or `--save-as /abs/copy.fcproj` for a new path. `export`/`render` fail with exit 1 when offline media produced placeholders unless `--allow-offline` is explicit.

## MCP modes and tools

- Headless: `filmcraft-cli mcp --demo`, `filmcraft-cli mcp --project /abs/project.fcproj`, or neither for an empty in-process session.
- Bridge: `filmcraft-cli mcp --bridge 127.0.0.1:9876` drives `filmcraft --control 9876`. Do not combine `--bridge` with `--project` or `--demo`; those flags are accepted but ignored in the MCP branch.
- The server is stdio. The repository `.mcp.json` registers bridge and headless examples against a built release binary; an MCP client may also register an absolute binary path.
- Core tools: `command_list`, `command_run`, `command_batch`, `doc_inspect`, `project_inspect`, `sequence_inspect`, `media_import`, `render_preview`, and `render_frame`.
- Bridge tools: `ui_inspect`, `ui_elements`, `ui_click`, `ui_drag`, `ui_key`, `ui_type`, `ui_screenshot`, and `ui_control`.
- Resources: `filmcraft://document` and `filmcraft://commands`.

The robust loop is `project_inspect`/`sequence_inspect` → verify backend, current project, and media paths → obtain ids → `command_run`/`command_batch` → inspect → `render_frame` or `ui_screenshot`. Resolve target mismatches before mutation. Edits are undoable. Tool arguments are strict; unknown arguments return JSON-RPC `-32602`. `command_run` with `file.exportMedia` and `wait: true` can report progress and cancellation; without `wait`, it returns a job and path for polling.

## MCP registration example

```sh
claude mcp add filmcraft-headless -- /abs/path/filmcraft-cli mcp --demo
```

```json
{"mcpServers":{"filmcraft":{"command":"/abs/path/filmcraft-cli","args":["mcp","--bridge","127.0.0.1:9876"]}}}
```

Changing client/MCP configuration is covered by the same authorization rule: existing explicit authorization for that exact change is sufficient; ask only when consent is missing or the destination/configuration is unclear. The docs do not establish a hosted FilmCraft MCP service.
