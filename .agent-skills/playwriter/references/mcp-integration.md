# Playwriter MCP integration

## What MCP does here

MCP is the transport/integration layer that lets a model client expose Playwriter as a tool server.

It does **not** replace Playwriter’s runtime decisions:
- running browser vs fresh browser
- session reuse vs isolated session
- artifact capture
- auth handoff expectations

## Minimal MCP config

```json
{
  "mcpServers": {
    "playwriter": {
      "command": "npx",
      "args": ["-y", "playwriter@latest"]
    }
  }
}
```

## Good trigger examples

Use Playwriter over a generic browser server when the prompt sounds like:
- “use the browser I already have open”
- “don’t make me log in again”
- “work in my current Chrome session”
- “keep my extensions and tabs”

## Bad trigger examples

Route elsewhere when the task sounds like:
- “run this browser test in CI”
- “verify a flow from a clean state”
- “take isolated repeatable snapshots across environments”
