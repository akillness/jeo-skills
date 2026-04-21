# Modes and routing

## Core boundary

`agent-browser` owns **fresh-session deterministic verification**.

Use it when the job needs:
- a clean disposable browser
- stable snapshot refs for actions
- explicit before/after evidence
- CI-style or automation-friendly reproducibility

Do not use it as the default lane for:
- the user's already-open browser or trusted-device state → `playwriter`
- exact rendered-UI annotation packets → `agentation`
- plan or diff approval → `plannotator`

## Verification modes

| Mode | Use when | Typical command |
|---|---|---|
| Snapshot diff | semantic page structure or accessible state changed | `agent-browser diff snapshot` |
| Screenshot diff | rendered layout or styling matters | `agent-browser diff screenshot --baseline before.png` |
| Targeted extraction | exact text, value, or URL matters | `agent-browser get text @e1` / `agent-browser get url` |
| Capture artifact | output must be saved | `agent-browser screenshot` / `agent-browser pdf` |

## Routing checklist

Ask these in order:
1. **Does the workflow need a clean browser?** If yes, continue with `agent-browser`.
2. **Does it need the user's real browser state, extensions, or live tabs?** If yes, route to `playwriter`.
3. **Is the output a human UI annotation packet?** If yes, route to `agentation`.
4. **Is the artifact a plan or diff under review?** If yes, route to `plannotator`.

## Practical rule

A browser skill gets more reusable when it answers one question clearly:

> "Can I prove this website state in a clean disposable session?"

If the answer is yes, use `agent-browser`.
If the task is really about stateful reuse or human visual feedback, route out early.
