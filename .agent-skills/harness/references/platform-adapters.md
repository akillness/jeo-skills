# Platform Adapters

Use this file when the target runtime is not Claude-native.

## Principle

Keep the harness neutral under `.harness/` and map execution at the edge. Do not bake vendor-specific transport primitives into the architecture itself.

## Adapter matrix

| Platform | Native fit | Recommended adapter move | Notes |
|----------|------------|--------------------------|-------|
| Claude Code | strongest native fit | use team-first wording and Agent Teams semantics | upstream `revfactory/harness` maps here directly |
| Codex CLI | adapter mode | preserve agent roster, map execution to Codex delegation/orchestration | avoid pretending shared task list/mailbox are native |
| Gemini CLI | adapter mode | use OHMG or hook-driven workflow wrappers around neutral artifacts | keep vendor-specific hooks outside the harness core |
| OpenCode | adapter mode | use plugin/slash-command registration around the neutral scaffold | treat OpenCode integration as transport |
| Antigravity | adapter mode | map through OHMG-style orchestration or equivalent runtime | focus on role boundaries, not transport details |
| Pi | fallback adapter | export neutral roles and validation contract, then bind later | document as non-native unless stronger evidence exists |
| Claw / claw-style | fallback adapter | use mailbox/file-based coordination with the neutral scaffold | good fit for transport, not for authoring semantics |

## Portable artifact contract

Create these directories first:

```text
.harness/
├── agents/
├── skills/
├── workspace/
└── manifests/
```

Then add platform-specific entry points only if the runtime needs them.

## What to avoid

- claiming `TeamCreate`, shared task lists, or teammate messaging outside native runtimes
- mixing platform config with the portable harness specification
- forcing every runtime to use the same file path conventions
