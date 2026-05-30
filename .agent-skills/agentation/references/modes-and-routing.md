# Agentation Modes and Routing

## What `agentation` owns
`agentation` owns the moment when a rendered UI issue must become a **precise feedback packet** for an agent:
- exact element targeting
- structured annotation output
- human ↔ agent feedback handoff
- watch-loop queue behavior

It is not the default browser runtime and it is not a generic review tool.

## Mode selection

### 1. Copy-paste review
Use when a human reviewer is present and wants to paste a packet into chat.

Choose this when:
- setup should stay light
- the review is synchronous
- the agent only needs one or a few targeted fixes

### 2. Synced watch loop
Use when annotations should flow into the agent context automatically.

Choose this when:
- the frontend is under active iteration
- multiple annotations may arrive over time
- ACK / RESOLVE queue behavior matters

### 3. Self-driving critique
Use when an agent/browser loop is repeatedly checking UI output and `agentation` is the structured review packet.

Choose this when:
- the loop already has a browser runtime
- the system needs repeatable rendered-UI evidence
- the coding agent will fix and re-check repeatedly

### 4. Platform setup
Use when the real task is wiring the bridge into Claude Code, Codex, Gemini CLI, or OpenCode.

Choose this when:
- the user already understands the UI-review job
- the blocker is MCP or hook configuration
- the next step is verifying that pending annotations enter the agent context

## Route-outs

### Route to `browser-harness`
Use `browser-harness` when the real need is:
- clean disposable browser sessions
- deterministic refs / replayable checks
- headless or CI-style verification
- browser automation even without a human reviewer

### Route to `playwriter`
Use `playwriter` when the real need is:
- the browser the user already has open
- existing cookies, SSO, extensions, or passkeys
- shared human/agent tab continuity

### Route to `plannotator`
Use `plannotator` when the review target is:
- a plan
- a diff
- an execution checklist
- an approval/rejection workflow before implementation

## Minimal React integration

```tsx
import { Agentation } from 'agentation';

function App() {
  return (
    <>
      <YourApp />
      {process.env.NODE_ENV === 'development' && <Agentation />}
    </>
  )
}
```

Only add `endpoint`, callbacks, session wiring, or webhook behavior after the mode is chosen.
