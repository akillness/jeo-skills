# Agent types and spawn paths

ClawTeam works with CLI agents that already run correctly on their own.

## Rule zero
Verify the raw agent command first.

```bash
claude --version
codex --version
cursor --help
```

If the agent command does not work outside ClawTeam, fix that first.

## Common spawn patterns

| Runtime path | Example | Best for |
|--------------|---------|----------|
| tmux + Claude | `clawteam spawn tmux claude --team my-team --agent-name architect --task "Design the API schema"` | interactive dev/research teams |
| tmux + Codex | `clawteam spawn tmux codex --team my-team --agent-name tester --task "Write integration tests"` | coding/test workers with live monitoring |
| subprocess + Cursor | `clawteam spawn subprocess cursor --team my-team --agent-name reviewer --task "Review the UI copy"` | headless / non-tmux workers |
| profile-based spawn | `clawteam spawn tmux --profile claude-kimi --team my-team --agent-name researcher --task "Compare onboarding flows"` | non-default providers/models |
| custom command | `clawteam spawn subprocess python --team my-team --agent-name helper --task "Run the export check"` | arbitrary CLI wrappers |

## Role naming guidance
Use semantic names:
- `architect`
- `backend`
- `tester`
- `researcher`
- `content-editor`
- `build-reviewer`

Avoid generic names like `worker-1` unless the user truly does not care about ownership clarity.

## Prompt / coordination expectations
Spawned workers are expected to:
- inspect their tasks
- update task status
- read and send inbox messages
- report idle or completion state

Representative operator commands:
```bash
clawteam task list my-team --owner backend
clawteam task update my-team 2 --status in_progress
clawteam task update my-team 2 --status completed
clawteam inbox send my-team leader "Auth flow is ready for review"
clawteam inbox receive my-team
clawteam lifecycle idle my-team
```

## Provider-aware setup
When the blocker is provider/model/runtime configuration, use profiles and presets instead of improvising every spawn command:

```bash
clawteam preset list
clawteam preset generate-profile moonshot-cn claude --name claude-kimi
clawteam profile doctor claude
clawteam profile test claude-kimi
```

## Caveats
- `tmux` is the default happy path for visible teams.
- `subprocess` is useful but deserves more caution for long-running workers.
- Do not assume advanced agent-definition files are fully honored without testing.
