# Authentication workflows

## Boundary first

`agent-browser` can save and load auth state, but it is still the **clean-session** browser lane.

Use explicit auth-state files when you need bounded reproducible reuse.
If the task depends on the user's already-open browser, passkeys, active SSO state, extensions, or trusted-device continuity, route to `playwriter` instead.

## Login once, save bounded state

```bash
agent-browser open https://app.example.com/login
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser fill @e1 "$USERNAME"
agent-browser fill @e2 "$PASSWORD"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json
```

## Reuse saved auth state later

```bash
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
agent-browser snapshot -i
```

## Security notes

- Prefer environment variables or a secret manager for credentials.
- Do not commit auth files to the repository.
- Scope auth-state files per environment and rotate them regularly.
- Treat saved auth as a bounded automation artifact, not a substitute for a real running-browser workflow.
