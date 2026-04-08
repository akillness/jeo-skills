# RTK Commands And Config

Use this file when the user asks what RTK can optimize, how to call it directly, or how to control rewrite behavior.

## Direct command families

### Files

```bash
rtk ls .
rtk read file.rs
rtk read file.rs -l aggressive
rtk smart file.rs
rtk find "*.rs" .
rtk grep "pattern" .
rtk diff file1 file2
```

### Git

```bash
rtk git status
rtk git log -n 10
rtk git diff
rtk git commit -m "msg"
rtk git push
```

### Test runners

```bash
rtk test cargo test
rtk vitest run
rtk pytest
rtk go test
rtk cargo test
rtk playwright test
```

### Build and lint

```bash
rtk lint
rtk tsc
rtk next build
rtk cargo build
rtk cargo clippy
rtk ruff check
```

### Analytics

```bash
rtk gain
rtk gain --graph
rtk discover
```

## When direct RTK commands matter

Use explicit `rtk` commands when:

- The agent does not support transparent shell hooks
- The task is running through built-in read or grep style tools
- You want deterministic compact output regardless of hook state
- You are testing RTK itself

## Rewrite behavior and escape hatches

### One-off passthrough

```bash
RTK_DISABLED=1 git status
```

### User config

RTK stores user-owned config in:

```text
~/.config/rtk/config.toml
```

Useful control surface:

- `exclude_commands` to keep specific commands from being rewritten

## Important caveat for coding agents

Hook rewriting only affects shell-command execution paths. It does not automatically compress built-in file or search tools such as:

- Codex `Read`, `Grep`, `Glob`
- Claude Code non-Bash tools
- Similar native tool calls in other agents

For those cases, use shell commands or direct RTK commands such as `rtk read`, `rtk grep`, and `rtk find`.
