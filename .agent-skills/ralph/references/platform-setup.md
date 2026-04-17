# Platform Setup Guide

> Runtime notes for using the `ralph` method on Claude Code, Codex CLI, Gemini CLI, and OpenCode.
>
> Use this file for **current local setup reality**.
> Use [runtime-boundaries.md](./runtime-boundaries.md) for ownership boundaries.

## Platform Support Matrix

| Platform | Support level | Local repo guidance | Notes |
|----------|---------------|---------------------|-------|
| **Claude Code** | Full | Install `ralph` and use Claude-native hooks / runtime surfaces | Detailed orchestration belongs to `omc` |
| **Codex CLI** | Partial / evolving | Repo ships a fallback setup script; native Codex hooks now exist experimentally | Detailed Codex-native runtime behavior belongs to `omx` |
| **Gemini CLI** | Full | Repo ships hook-based local setup | Harness / projection details belong to `ohmg` |
| **OpenCode** | Full | Skills system picks up `ralph` directly | Minimal extra setup |

## Claude Code

### Install

```bash
npx skills add https://github.com/akillness/oh-my-skills --skill ralph
```

You can also use the upstream Ouroboros plugin path:

```bash
claude plugin marketplace add Q00/ouroboros
claude plugin install ouroboros@ouroboros
ooo setup
```

### What `ralph` expects here
- hook-capable runtime
- repo-local verification commands
- explicit seed / drift / completion discipline

### What stays outside this file
- team / autopilot / Claude-native orchestration depth → `omc`
- approval posture / sandbox policy → `ralphmode`

## Codex CLI

### Current repo-local helper path

The repo currently ships a **fallback helper** that installs developer instructions and prompt scaffolding:

```bash
bash .agent-skills/ralph/scripts/setup-codex-hook.sh
```

This configures:
1. `~/.codex/config.toml` with `developer_instructions`
2. `~/.codex/prompts/ralph-ooo.md`
3. `~/.codex/prompts/ouroboros.md`

### Important correction

Older repo-local docs treated Codex as having **no native hook story**.
That is no longer fully true.
Current official Codex docs expose:
- native **experimental hooks**
- `.rules`
- sandbox / approval controls
- profiles and advanced config

So the truthful position is:
- the repo **does provide** a local fallback helper today
- Codex **also has** native hook capabilities upstream
- concrete Codex-native runtime ownership belongs to `omx`, not the `ralph` front door

### Practical use

If you only need the current local fallback flow:

```bash
codex
/prompts:ralph-ooo
/ralph "fix all TypeScript errors" --max-iterations=10
```

If you need native Codex runtime behavior, rules, approvals, or hook wiring, route to `omx`.

### High-autonomy mode

For sandbox environments only:

```bash
codex --dangerously-bypass-approvals-and-sandbox \
  -c model_reasoning_effort="high" \
  -c model_reasoning_summary="detailed"
```

## Gemini CLI

### Local helper path

```bash
bash .agent-skills/ralph/scripts/setup-gemini-hook.sh
```

Or install the upstream extension directly:

```bash
gemini extensions install https://github.com/Q00/ouroboros
```

### Required settings shape

Add the relevant hook and include-directory entries to `~/.gemini/settings.json`.
The repo-local helper script is the easiest path.
A typical shape is:

```json
{
  "hooksConfig": { "enabled": true },
  "context": {
    "includeDirectories": ["~/.gemini/extensions/ralph-ooo"]
  },
  "hooks": {
    "AfterAgent": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.gemini/hooks/ralph-ooo-check.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### Current local caveat

The repo documents a Gemini v0.30.0 bug where `stop_hook_active` stays `false`.
The shipped workaround is to read `.omc/state/ralph-ooo-state.json` directly inside the continuation helper.

### Recommended run mode

```bash
gemini -s -y
```

Use `ohmg` when the real question is Gemini / Antigravity harness projection rather than the `ralph` method itself.

## OpenCode

OpenCode picks up skills directly from `.agent-skills/`.
No extra repo-local helper is required.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": "Use ooo commands for specification-first development. Start with ooo interview when ambiguity is high."
}
```

## Local helper state

The repo-local helper scripts use:

```text
.omc/state/ralph-ooo-state.json
```

You can inspect or reset that helper state with:

```bash
bash .agent-skills/ralph/scripts/ooo-state.sh init "fix all tests"
bash .agent-skills/ralph/scripts/ooo-state.sh status
bash .agent-skills/ralph/scripts/ooo-state.sh checkpoint
bash .agent-skills/ralph/scripts/ooo-state.sh reset
bash .agent-skills/ralph/scripts/ooo-state.sh resume
```

## Official references

- Claude Code settings / hooks docs
- OpenAI Codex config / hooks / rules / approvals docs
- Gemini CLI settings / hooks / trusted-folders docs
- Upstream Ouroboros runtime guides
