---
name: react-grab
description: >
  Capture exact React element context from a live browser UI and hand it to an AI coding
  agent as component name, source file path, line number, and HTML. Use when the user wants
  `react-grab`, element-context copy, component-source lookup from the browser, clipboard-to-agent
  React debugging, or MCP-backed element selection for React apps. Not for generic browser automation
  or login/session reuse (`browser-harness`, `playwriter`), broad UI annotation/review (`agentation`),
  React performance audits (`react-best-practices`), or general design-system work (`design-system`).
  Triggers on: react-grab, grab element context, copy component to AI, browser component picker,
  React component inspector, clipboard component source, get element context from browser, grab UI element.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
metadata:
  tags: react-grab, grab, element-context, ai-agent, clipboard, component-inspector, dev-tools, react, browser, mcp
  version: "1.1"
  source: https://github.com/aidenybai/react-grab
  license: MIT
---

# react-grab — Browser element context for AI agents

> **Keyword:** `react-grab` · `grab` · `element context`
>
> Point at a live React UI element, capture the exact component/file/HTML context, and feed it
> straight into Claude Code, Cursor, Copilot, Codex, Gemini, or an MCP workflow.

## When to use this skill

- Install `react-grab` in a React project so agents can copy exact component context from the browser
- Choose between clipboard flow, MCP flow, and plugin/API flow for React element capture
- Fix `react-grab` setup issues like wrong load point, missing file paths, or empty MCP responses
- Add or remove an agent integration (`claude-code`, `cursor`, `codex`, `gemini`, `mcp`, etc.)
- Build a custom plugin or use the primitives API for a project-specific workflow

Do **not** use this skill for:
- Fresh-session browser automation, auth flows, or disposable browser verification → `browser-harness`
- Running-browser reuse with existing cookies/extensions/logins → `playwriter`
- Human feedback / annotation packets on rendered UI → `agentation`
- React performance diagnosis, rerender churn, hydration, bundle, or RSC/client-boundary work → `react-best-practices`
- General UI-system / token / component-library design work → `design-system`

## Instructions

### Step 1: Classify the request

Choose one primary mode before giving commands:

1. **Clipboard install/use** — user wants to hover, press Cmd/Ctrl+C, and paste context into an AI agent.
2. **MCP workflow** — user wants the agent to call a tool like `get_element_context` after browser selection.
3. **Plugin/API workflow** — user wants custom actions, lifecycle hooks, formatting, or primitives like `freeze()`.
4. **Troubleshooting/removal** — user wants to fix setup problems or remove the integration cleanly.

### Step 2: Confirm prerequisites truthfully

Use the upstream project as source of truth:
- `npx grab@latest init` is the default install path.
- Upstream `package.json` currently requires **Node.js >=22**.
- The browser overlay is a **development-only** tool; never present it as a production feature.

If the user’s environment is older than Node 22, say so explicitly before giving the install path.

### Step 3: Give the shortest correct path

#### Mode A — Clipboard install/use

Use this as the default path unless the user explicitly asks for MCP or plugins:

```bash
# At the project root
npx -y grab@latest init
```

Then explain the runtime flow:
1. Start the dev server.
2. Open the app in the browser.
3. Hover the target element.
4. Press **Cmd+C** (Mac) or **Ctrl+C** (Windows/Linux).
5. Paste the captured context into the AI agent.

Clipboard output should include:
- component name
- source file path
- line/column when available
- HTML snippet

If the user needs framework-specific setup, use `references/install-and-routing.md`.

#### Mode B — MCP workflow

When the user wants programmatic access from the agent instead of manual paste:

```bash
npx -y grab@latest add mcp
```

Explain the real flow clearly:
1. User selects or hovers the element in the browser overlay.
2. The MCP server exposes the latest selection.
3. The AI agent calls `get_element_context`.
4. The tool returns file path, component, stack, and HTML context.

If the user asks how this differs from clipboard flow:
- **Clipboard** is manual paste into chat.
- **MCP** is tool-based retrieval after selection.

Use `references/agent-workflows.md` for agent-specific install and routing guidance.

#### Mode C — Plugin/API workflow

When the user wants custom behavior, automation, or a deeper integration:
- Route installation and workflow choice first.
- Then point to:
  - `references/api.md` for full API surface
  - `references/agent-workflows.md` for practical plugin/MCP patterns

Common primitives to mention:
- `getElementContext(element)`
- `freeze()` / `unfreeze()`
- `openFile(filePath, lineNumber?)`
- `registerPlugin(...)`

Do **not** dump the full API unless the user asked for the deep path.

#### Mode D — Troubleshooting/removal

If the user wants fixes or teardown:
- Use `references/troubleshooting.md` for symptom-first triage.
- For removal, use upstream CLI removal commands:

```bash
npx -y grab@latest remove <agent>
```

### Step 4: Keep the boundary sharp

Keep `react-grab` focused on **React element context capture from the browser**.

Route out when the user is actually asking for:
- general browser automation → `browser-harness` or `playwriter`
- UI review / visual annotation → `agentation`
- performance / profiling / hydration / bundle / RSC issues → `react-best-practices`
- reusable component-system design → `design-system` or `ui-component-patterns`

### Step 5: Prefer reference docs over bloating the front door

After classifying the mode, load only the matching support doc:
- `references/install-and-routing.md`
- `references/agent-workflows.md`
- `references/troubleshooting.md`
- `references/api.md`

Keep the main answer short unless the user explicitly asks for the long path.

## Examples

### Example 1: install in a Next.js app and use clipboard flow

**User:** “Set up react-grab in my Next.js app so I can copy a component into Claude Code.”

**Response shape:**
1. Confirm Node 22+ prerequisite.
2. Use `npx -y grab@latest init` as the default path.
3. Explain dev-server → browser hover → Cmd/Ctrl+C → paste into Claude Code.
4. Only load framework-specific setup if auto-detect is not viable.

### Example 2: MCP setup for agent tool access

**User:** “Install react-grab MCP so the agent can grab the selected button context.”

**Response shape:**
1. Confirm Node 22+ prerequisite.
2. Run `npx -y grab@latest add mcp`.
3. Explain that the browser selection happens first, then the agent calls `get_element_context`.
4. Route generic browser-control questions to `browser-harness` / `playwriter` if needed.

### Example 3: custom plugin workflow

**User:** “Create a react-grab plugin that adds a Jira action to the context menu.”

**Response shape:**
1. Keep `react-grab` as the plugin/API lane.
2. Use `registerPlugin(...)` with an action and optional hooks.
3. Point to `references/api.md` for the full hook surface.
4. Keep the example focused on the requested action rather than reproducing the whole API.

### Example 4: fix setup drift

**User:** “`grab init` keeps failing on my machine.”

**Response shape:**
1. Check Node version first and call out the Node 22+ requirement.
2. Confirm they are running from the project root.
3. Use `references/troubleshooting.md` for overlay/load/MCP/path failures.
4. Route unrelated framework build issues to the appropriate frontend skill.

## Best practices

1. **State the Node.js >=22 prerequisite truthfully** before recommending install commands.
2. **Default to `npx -y grab@latest init`** unless the user explicitly needs manual framework setup.
3. **Keep it dev-only** — never imply this belongs in production builds.
4. **Explain clipboard vs MCP clearly** so users do not confuse paste-based and tool-based workflows.
5. **Route broad browser or UI-review work out early** instead of letting `react-grab` absorb adjacent skills.
6. **Use support docs for depth** instead of pasting long installation or API manuals into the main response.

## References

- [react-grab GitHub](https://github.com/aidenybai/react-grab)
- [react-grab.com](https://react-grab.com)
- [Install and routing guide](references/install-and-routing.md)
- [Agent workflows](references/agent-workflows.md)
- [Troubleshooting](references/troubleshooting.md)
- [Full API reference](references/api.md)
- [Helper scripts](scripts/) — `install.sh` and `add-agent.sh`
