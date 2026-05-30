# Playwriter modes and routing

## Use Playwriter for the running-browser lane

Choose `playwriter` when the task depends on one or more of these:

- the browser the user already has open
- existing cookies or trusted-device session state
- installed extensions
- passkey / SSO / MFA flows where manual login is expected
- live-tab continuity with a human using the same browser

## Route away from Playwriter when these matter more

Choose `browser-harness` or another fresh-session browser tool when the task needs:

- disposable isolation
- CI-style reproducibility
- deterministic verification against a clean state
- automation that should not touch the user’s real browser profile

## Why the boundary matters

`playwriter` is valuable because it solves a different runtime problem than a fresh browser:

- **Running-browser reuse** trades determinism for access to the real browser state.
- **Fresh-session automation** trades local continuity for reproducibility and isolation.

Do not flatten both into “browser automation.” The trigger quality of the skill depends on making this boundary explicit.
