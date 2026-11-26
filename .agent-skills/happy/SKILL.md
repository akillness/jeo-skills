---
name: happy
description: >
  Operate slopus/happy, an end-to-end encrypted mobile and web remote control client for Claude Code and Codex sessions using device-held TweetNaCl keys, zero-knowledge relay sync, and instant desktop-mobile handoff. Use when installing happy via npm, launching happy or happy claude or happy codex sessions, pairing mobile QR keys, configuring happy-mcp, or auditing self-hosted happy-server setups. Do not use for local Git worktree fleets (route to orca) or API provider switching (route to cc-switch). Triggers on: happy coder, happy claude, happy codex, slopus/happy, happy-mcp, mobile agent relay.
allowed-tools: Read Glob Grep Bash
compatibility: Node.js, npm (npm install -g happy), and local Claude Code or Codex CLI; optional iOS/Android/Web app or self-hosted happy-server. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "0.13.0"
  source: https://github.com/slopus/happy
  upstream_commit: 92826ef40fc96daec2ac87e975ce14ff00ad3a43
  pinned_at: "2026-11-26"
---

# Happy (`slopus/happy`)

Source-pinned operator guide for `slopus/happy` (`happy` CLI v0.13+, MIT), an end-to-end encrypted remote control wrapper for Claude Code and Codex sessions across terminal, mobile (iOS/Android), and web.

## When to use this skill

- Installing the `happy` CLI (`npm install -g happy` — note upstream migrated from `happy-coder` to `happy`) and verifying `happy` / `happy-mcp` binaries.
- Launching encrypted remote-controllable sessions via `happy` (defaults to Claude Code), `happy claude`, or `happy codex`.
- Pairing a mobile/web client via local QR/device encryption keys or switching control seamlessly between terminal and phone.
- Evaluating self-hosted relay architecture (`packages/happy-server` + `packages/happy-wire`) vs hosted relay defaults.
- Routing out: use `orca` for desktop Git-worktree agent orchestration, `cc-switch` for API provider/MCP profile switching, and `jarrodwatts-hud` for terminal statusline HUDs.

## Instructions

1. **Run offline preflight first** to inspect `happy`, `happy-mcp`, `node`, and `npm` availability:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Install and start an encrypted session**:
   - Install CLI globally (verify package name is `happy`, not deprecated `happy-coder`):
     ```bash
     npm install -g happy
     ```
   - Launch Claude Code session with mobile E2E sync: `happy` or `happy claude`
   - Launch Codex session with mobile E2E sync: `happy codex`
   - Scan the terminal QR pairing prompt from the Happy mobile/web app to exchange device-held keys.

3. **Understand encryption and relay boundaries**:
   - Session prompts and tool output are encrypted locally on-device (TweetNaCl) before leaving the host; relay servers transmit ciphertext without holding plaintext decryption keys.
   - **Important safety boundary**: Mobile push notifications and remote permission taps can approve local tool/bash actions remotely — keep normal workspace/git safeguards active and lock pairing keys strictly to your personal device.

4. **Gate self-hosted server and daemon changes**:
   - Before deploying `packages/happy-server`, verify TLS termination, PostgreSQL/Redis credentials, firewall rules, and auth boundaries explicitly with the user.
   - Never share pairing QR screenshots, local auth tokens, or encryption key files in logs or issues.

## Examples

- **Remote-ready Claude Code session**:
  Run `npm install -g happy`, start `happy claude` inside the target project directory, pair via the mobile app, and hand off long-running reviews while away from the desk.
- **Codex mobile control**:
  Run `happy codex` when driving an OpenAI Codex CLI session with mobile approval notifications.

## Best practices

- Prefer `happy` package on npm (`packages/happy-cli/package.json` v0.13+) over legacy `happy-coder` references.
- Always check `git status` and avoid running unattended destructive permissions over mobile approvals on critical repos.
- Keep `happy-server` self-hosting TLS-protected and never log pairing keys.

## References

- Pinned upstream architecture, packages, and security boundaries: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
