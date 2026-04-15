# Agentation Platform Setup and Hooks

## Fastest common path

```bash
npm install agentation -D
npx add-mcp "npx -y agentation-mcp server"
npx agentation-mcp doctor
```

This covers the common case: install the toolbar, register the MCP bridge, then verify the bridge before assuming the queue works.

## Claude Code

### Upstream official skill path
```bash
npx skills add benjitaylor/agentation -g
# then use /agentation
```

### Direct MCP registration
```bash
claude mcp add agentation -- npx -y agentation-mcp server
```

### Hook use case
If the goal is to inject pending annotations into each prompt, configure a `UserPromptSubmit` hook in the relevant Claude settings file. Keep the hook command small and focused on fetching pending annotations rather than embedding large formatting logic in the hook itself.

## Codex CLI
- Register the MCP bridge in Codex config or use `add-mcp` when available.
- Keep the setup answer focused on where the config lives, how the bridge is registered, and how to verify it.
- Do not turn the setup path into a generic browser-automation answer.

## Gemini CLI
- Register the MCP bridge in Gemini config or via `add-mcp`.
- Use hook/post-agent style configuration only when pending annotation injection is the explicit requirement.

## OpenCode
- Register the MCP server in the platform's MCP config.
- OpenCode usually needs less hook ceremony; prefer the simplest working registration.

## Verification checklist
1. Toolbar renders in development.
2. `agentation-mcp` server starts successfully.
3. `npx agentation-mcp doctor` passes.
4. A new annotation appears in the queue.
5. The agent loop can see or consume the pending annotation.
6. ACK / resolve behavior works before real work starts.

## Pitfalls
- Avoid hard-coding platform-specific setup for every agent into the main `SKILL.md`.
- Do not present hooks as mandatory when copy-paste review is enough.
- Keep version-sensitive config snippets in references so the main skill stays durable.
