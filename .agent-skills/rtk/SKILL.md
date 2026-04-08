---
name: rtk
description: >
  Install, initialize, verify, and troubleshoot RTK (Rust Token Killer) for AI
  coding agents. Use when you need to reduce shell-command token output, confirm
  that the correct `rtk` binary is installed, choose between Homebrew, install.sh,
  or Cargo installation, wire `rtk init` for Claude Code, Codex, Gemini CLI,
  Cursor, Copilot, Windsurf, Cline, or OpenCode, or use compact wrappers such as
  `rtk git status`, `rtk read`, `rtk grep`, `rtk test`, `rtk lint`, and
  `rtk gain`. Triggers on: rtk, rust token killer, token saver cli, rtk init,
  rtk gain, codex rtk, gemini rtk, opencode rtk, claude hook token reduction.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
license: MIT
metadata:
  tags: rtk, rust-token-killer, token-optimization, claude-code, codex, gemini, opencode, cursor, copilot, shell-hooks
  version: "1.0"
  source: https://github.com/akillness/rtk
---

# rtk - Rust Token Killer for AI Coding Agents

> **Keyword**: `rtk` · `rust token killer` · `rtk init` · `rtk gain`
>
> The target repository is the `akillness/rtk` fork of `rtk-ai/rtk`. The fork tracks upstream code, while the bundled `install.sh` still downloads release artifacts from `rtk-ai/rtk`.

RTK is a high-performance CLI proxy that rewrites common shell commands into token-optimized equivalents before their output reaches an AI agent. Use this skill to verify the right RTK binary, install or repair it, choose the correct `rtk init` mode for the user's agent, and fall back to direct `rtk` commands when no automatic hook exists.

## When to use this skill

- Verify whether RTK is already installed and whether it is the correct project
- Repair the common `cargo install rtk` name-collision mistake
- Install RTK with Homebrew, the repository `install.sh`, or Cargo
- Initialize RTK for Claude Code, Codex, Gemini CLI, Cursor, Copilot, Windsurf, Cline, or OpenCode
- Explain when `rtk init -g` is better than local project setup
- Use direct `rtk` wrappers such as `rtk git status`, `rtk read`, `rtk grep`, `rtk test`, or `rtk lint`
- Diagnose why automatic rewriting is not happening
- Explain why built-in file tools do not pass through shell hooks and when to use direct `rtk` commands instead

## Instructions

### Step 1: Verify the current installation before reinstalling anything

Run the local status helper first:

```bash
bash scripts/check-status.sh --show
```

Interpret the result in this order:

1. If `rtk gain` works, the correct RTK is already installed. Do not reinstall unless the user wants an upgrade.
2. If `rtk --version` works but `rtk gain` fails, the user likely has the wrong `rtk` package, usually Rust Type Kit.
3. If `rtk` is missing entirely, move to installation.

The install and verification decision tree lives in [references/install-and-verify.md](references/install-and-verify.md).

### Step 2: Install or repair RTK with the narrowest method that fits

Use the wrapper:

```bash
bash scripts/install.sh
```

Important installer choices:

- Default `auto` prefers Homebrew on macOS when available, then the fork's `install.sh`, then Cargo
- Use `--method brew` when Homebrew is available and the user wants a standard system-managed install
- Use `--method script` for the repository install script path
- Use `--method cargo` when the user explicitly wants a git-source build or is working from the fork
- Use `--force-uninstall-wrong` when the user already installed the wrong `rtk`

Examples:

```bash
bash scripts/install.sh --method brew
bash scripts/install.sh --method script
bash scripts/install.sh --method cargo --repo akillness/rtk
bash scripts/install.sh --force-uninstall-wrong
```

Keep these installation rules explicit:

- Always verify with `rtk gain` after installation
- Treat `cargo install rtk` as unsafe unless the user already confirmed the correct package
- If the install script path is used, remember the script still pulls release artifacts from `rtk-ai/rtk`

### Step 3: Choose the correct `rtk init` mode for the agent

Use the init wrapper instead of hand-building flags:

```bash
bash scripts/init-agent.sh --agent claude --global
```

Default mapping:

- Claude Code: `--agent claude --global` for hook-first setup
- Codex: `--agent codex --global` or local `--agent codex --local`
- Gemini CLI: `--agent gemini --global`
- Cursor: `--agent cursor --global`
- Copilot: `--agent copilot --global`
- OpenCode: `--agent opencode --global`
- Windsurf: `--agent windsurf --local`
- Cline / Roo Code: `--agent cline --local`

Good follow-up checks:

```bash
bash scripts/init-agent.sh --agent claude --global --auto-patch
bash scripts/init-agent.sh --agent codex --global
bash scripts/init-agent.sh --agent opencode --global
bash scripts/init-agent.sh --agent claude --show
```

Read [references/platform-init.md](references/platform-init.md) when the user needs the per-agent hook type, scope, or uninstall behavior.

### Step 4: Use direct RTK commands when hooks are absent or insufficient

Automatic rewrite only applies where the agent actually executes shell commands through a supported hook or plugin. Prompt-only integrations such as Codex, Windsurf, and Cline still benefit from explicit `rtk` commands, but they do not transparently mutate built-in file tools.

Use direct commands when:

- The agent uses a built-in `Read`, `Grep`, or `Glob` tool instead of shell
- The workflow is in Codex and the user wants compact output immediately
- The user wants deterministic verification independent of hook state

Common commands:

```bash
rtk git status
rtk read src/main.rs
rtk grep "pattern" .
rtk test cargo test
rtk lint
rtk gain
```

The command families and config knobs are summarized in [references/commands-and-config.md](references/commands-and-config.md).

### Step 5: Diagnose failures explicitly

Use `bash scripts/check-status.sh --show` as the first diagnostic pass, then branch:

- Wrong binary installed: fix the name collision and reinstall
- Hook missing or stale: rerun the correct `rtk init` mode
- Agent still verbose: confirm whether the task used shell commands or built-in tools
- PATH issue: ensure `~/.local/bin` or `~/.cargo/bin` is on `PATH`
- Windows wrapper failure: recommend RTK `0.23.1+`

The troubleshooting matrix is in [references/troubleshooting.md](references/troubleshooting.md).

## Examples

### Example 1: Verify whether the correct RTK is already installed

```bash
bash scripts/check-status.sh --show
```

### Example 2: Install from the fork-aware script path

```bash
bash scripts/install.sh --method script --repo akillness/rtk
```

### Example 3: Repair the wrong `cargo install rtk` package

```bash
bash scripts/install.sh --force-uninstall-wrong --method cargo
```

### Example 4: Claude Code global hook setup

```bash
bash scripts/init-agent.sh --agent claude --global --auto-patch
```

### Example 5: Codex global prompt setup

```bash
bash scripts/init-agent.sh --agent codex --global
```

### Example 6: OpenCode plugin install

```bash
bash scripts/init-agent.sh --agent opencode --global
```

### Example 7: Use RTK directly for compact output

```bash
rtk read Cargo.toml
rtk grep "rtk init" README.md
rtk test cargo test
```

### Example 8: Temporarily bypass rewrite for one command

```bash
RTK_DISABLED=1 git status
```

## Best practices

1. Check `rtk gain` before reinstalling; it is the quickest way to distinguish the correct RTK from the wrong package.
2. Use the lightest install path that meets the user's needs: Homebrew for convenience, install script for release binaries, Cargo for source-driven workflows.
3. Treat `rtk init -g` as the normal path for hook-capable agents and local rules files as the normal path for Windsurf and Cline.
4. Use `rtk init --show` after setup or upgrades so stale hook state is visible immediately.
5. Remember that built-in read/search tools do not pass through shell hooks; switch to shell commands or direct `rtk` wrappers when token savings matter.
6. Keep `RTK_DISABLED=1` in mind for one-off passthrough commands instead of uninstalling hooks.
7. Re-run the installer plus `rtk init` after RTK upgrades because hook artifacts can change between releases.
8. When users say "RTK is broken", separate installation correctness, hook registration, and actual command path before proposing a fix.

## References

- [references/install-and-verify.md](references/install-and-verify.md)
- [references/platform-init.md](references/platform-init.md)
- [references/commands-and-config.md](references/commands-and-config.md)
- [references/troubleshooting.md](references/troubleshooting.md)
- [scripts/install.sh](scripts/install.sh)
- [scripts/init-agent.sh](scripts/init-agent.sh)
- [scripts/check-status.sh](scripts/check-status.sh)
- [RTK Repository Fork](https://github.com/akillness/rtk)
- [Upstream RTK Project](https://github.com/rtk-ai/rtk)
