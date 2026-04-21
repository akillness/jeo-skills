# Playwriter session workflow

## Upstream-oriented flow

```bash
playwriter browser start
playwriter session new
playwriter -s 1 -e 'await page.goto("https://example.com")'
playwriter -s 1 -e 'console.log(await snapshot({ page }))'
```

## Observe → act → observe

1. Create or pick a session.
2. Observe current state with `snapshot({ page })`.
3. Take one action.
4. Observe again before the next action.

This is the safest pattern for live-browser work because the browser state can change outside the agent’s control.

## Useful commands

```bash
playwriter session list
playwriter session reset 1
playwriter session delete 1
```

## Failure recovery

- If the wrong tab appears active, observe again before acting.
- If the connection feels stale, use `playwriter session reset <id>`.
- If quoting breaks your `-e` code, switch to a heredoc.
- If the browser state is too messy, restart with a fresh session or route to a fresh-session browser tool.
