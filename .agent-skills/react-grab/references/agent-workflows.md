# react-grab agent workflows

## The three practical workflows

### 1. Clipboard workflow
Best for: quick human-in-the-loop use with Claude Code, Cursor, Copilot Chat, Codex, or Gemini.

```bash
npx -y grab@latest init
```

Flow:
1. Start the app in development mode.
2. Hover the UI element in the browser.
3. Press **Cmd+C** (Mac) or **Ctrl+C** (Windows/Linux).
4. Paste the captured context into the coding agent.

Expected payload:
- component name
- file path
- line/column when available
- HTML snippet

Use this as the default path unless the user explicitly wants MCP.

### 2. MCP workflow
Best for: agent tool calls after browser selection.

```bash
npx -y grab@latest add mcp
```

Flow:
1. User selects or hovers an element in the browser.
2. The local MCP server stores/exposes the latest selection.
3. The agent calls `get_element_context`.
4. The tool returns structured context for the selected element.

Clarify this if needed:
- MCP does **not** replace the browser-side selection step.
- It replaces manual clipboard paste after selection.

### 3. Plugin/API workflow
Best for: project-specific customization, workflow automation, or custom actions.

Use when the user wants to:
- add a Jira/Figma/GitHub action to the context menu
- transform copied content before it hits the clipboard
- override open-file behavior
- freeze the page for hover-only or transient UI states
- integrate element capture into tests or custom scripts

Minimal plugin example:

```ts
import { registerPlugin } from "react-grab";

registerPlugin({
  name: "jira-action",
  actions: [
    {
      id: "jira",
      label: "Create Jira Ticket",
      shortcut: "J",
      onAction: async (context) => {
        await createJiraTicket({
          filePath: context.filePath,
          componentName: context.componentName,
          html: context.element.outerHTML,
        });
        context.hideContextMenu();
      },
    },
  ],
});
```

## Agent-specific commands

```bash
npx -y grab@latest add claude-code
npx -y grab@latest add cursor
npx -y grab@latest add copilot
npx -y grab@latest add codex
npx -y grab@latest add gemini
npx -y grab@latest add opencode
npx -y grab@latest add amp
npx -y grab@latest add droid
npx -y grab@latest add mcp
```

Removal:

```bash
npx -y grab@latest remove <agent>
```

## Boundary reminders

Use `react-grab` for **exact React element context**.

Route out when the user really wants:
- browser navigation, auth, screenshots, or scripted flow control → `browser-harness` or `playwriter`
- rendered-UI markup/annotation and review packets → `agentation`
- performance triage on the React app itself → `react-best-practices`

## Common answer shapes

### “I want to feed a selected button to Claude Code”
- confirm Node 22+
- recommend `grab init`
- explain clipboard flow

### “I want the agent to pull the selected component without paste”
- confirm Node 22+
- recommend `grab add mcp`
- explain browser-selection-first, tool-call-second

### “I need a custom context-menu action”
- stay in `react-grab`
- show `registerPlugin(...)`
- route full hook/API detail to `references/api.md`
