---
name: agentation
description: ">"
compatibility: React 18+, Node.js 18+
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: ui-feedback, browser-annotation, visual-feedback, mcp, react, ai-agent, design-review, css-selector
  platforms: Claude Code, Codex, Gemini CLI, OpenCode, Cursor, Windsurf, ChatGPT
  keyword: agentation
  version: 1.1.0
  source: benjitaylor/agentation
---












# agentation

`agentation` is the **rendered-UI feedback bridge** in this repo.

Use it when a human needs to click the actual UI, attach feedback to the exact element or region they mean, and pass a structured packet to the coding agent. The main job is **annotation routing**: choose the right annotation mode, capture precise evidence, then hand the fix loop to the right adjacent skill or agent runtime.

## When to use this skill

Use `agentation` when the task needs one or more of these:

- a human reviewer pointing at a real UI element instead of describing it vaguely
- structured feedback packets with selectors, element paths, bounding boxes, or copied markdown
- a local copy-paste review loop between a browser and a coding agent
- an MCP-backed sync/watch loop where new annotations flow into the agent context automatically
- a self-driving critique/fix loop that still starts from rendered UI evidence
- platform setup for passing pending UI annotations into Claude Code, Codex, Gemini CLI, or OpenCode

Do **not** use `agentation` by default for:

- fresh-session browser verification or deterministic regression checks → `browser-harness`
- running-browser, logged-in, or extension-dependent browser reuse → `playwriter`
- plan review, diff approval, or visual sign-off on a proposed artifact → `plannotator`
- generic design-system, accessibility, or heuristic audits without a concrete rendered UI packet

## Quick routing rule

| If the job needs... | Use |
|---|---|
| Human clicks the UI and leaves exact feedback for the agent | `agentation` |
| Browser verification in a clean repeatable session | `browser-harness` |
| The user's already-open browser, cookies, or logged-in tabs | `playwriter` |
| Review or approval of a plan/diff before execution | `plannotator` |

## Instructions

### Step 1: Choose the right annotation mode

Pick **one** mode before touching setup details:

| Mode | Use when | Output |
|---|---|---|
| **Copy-paste review** | One reviewer wants to annotate UI and paste the packet into chat | a structured markdown packet |
| **Synced watch loop** | New annotations should appear in the agent workflow automatically | pending-annotation queue + loop |
| **Self-driving critique** | An agent/browser loop will generate or consume annotations repeatedly | a review/fix loop packet |
| **Platform setup** | The core problem is wiring the annotation bridge into Claude/Codex/Gemini/OpenCode | a setup checklist and config target |

If the task is really “test the website” or “drive the logged-in browser,” route out first and only come back to `agentation` if exact human UI feedback is the missing piece.

### Step 2: Keep the browser boundary explicit

`agentation` does **not** replace the browser runtime choice.

- Use `browser-harness` when you want a clean disposable verification browser.
- Use `playwriter` when you must reuse the user's real browser session.
- Use `agentation` once there is a rendered page that a human or loop should annotate precisely.

### Step 3: Follow the core loop

1. **Prepare the rendered UI**
   - Choose the correct browser/runtime skill first if needed.
2. **Add the Agentation toolbar** to the app in development.
3. **Pick the annotation mode**: copy-paste, watch loop, self-driving, or setup.
4. **Capture one concrete UI packet**.
5. **Hand the packet to the coding agent**.
6. **Re-verify after the fix** using the same review lane.

### Step 4: Use the fastest safe install path

For most setups, the practical order is:

```bash
# React toolbar
npm install agentation -D

# MCP bridge / auto-registration for supported agents
npx add-mcp "npx -y agentation-mcp server"

# verify the bridge
npx agentation-mcp doctor
```

Claude Code users can also install the upstream official skill when that is the simplest way to bootstrap the experience:

```bash
npx skills add benjitaylor/agentation -g
# then use /agentation in Claude Code
```

### Step 5: Use a minimal toolbar integration first

Start with the smallest useful embed:

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

Only add `endpoint`, callbacks, or webhook behavior when the chosen mode actually needs them.

### Step 6: Choose the right handoff pattern

#### A. Copy-paste review
Use when a human is actively reviewing the page and pasting the packet into an agent chat.

Good for:
- quick bug/UI polish rounds
- one-off targeted fixes
- low-setup collaboration

#### B. Synced watch loop
Use when the agent should poll or ingest pending annotations continuously.

Good for:
- repeated QA/fix passes
- designer ↔ agent loops
- local review queues during active frontend work

Use the bundled verification script before trusting the loop:

```bash
bash .agent-skills/agentation/scripts/verify-loop.sh
```

#### C. Self-driving critique
Use when an agent/browser loop is reviewing UI repeatedly and `agentation` is the structured feedback packet, not the browser runtime itself.

Typical shape:
- browser tool captures current state
- `agentation` encodes concrete feedback targets
- coding agent applies the fix
- browser tool re-checks the result

### Step 7: Keep platform setup narrow

When the request is really about platform wiring, answer only:
- where the config lives
- how `agentation-mcp` is registered
- how pending annotations enter the agent loop
- how to verify the setup

Push the platform-specific config blocks into the references instead of bloating the main workflow.

## Scripts

Prefer the bundled scripts before retyping long commands:

| Script | Purpose |
|---|---|
| `scripts/setup-agentation-mcp.sh` | Register the MCP bridge for supported agents |
| `scripts/verify-loop.sh` | Validate annotation queue / ACK → RESOLVE style watch-loop behavior |

## Examples

### Example 1: Human reviewer wants exact UI feedback
- Prompt: "I can point at the broken checkout button, but I don't want to describe selectors manually."
- Expected behavior: choose `agentation`, recommend copy-paste review or sync mode, keep browser-runtime choice separate.

### Example 2: Browser verification is the real job
- Prompt: "Run a repeatable headless UI regression check and compare the results."
- Expected behavior: route to `browser-harness`, not `agentation`, unless human annotation becomes a follow-up step.

### Example 3: Logged-in browser reuse
- Prompt: "Use the browser I'm already signed into and let me annotate a billing page issue."
- Expected behavior: route the browser runtime to `playwriter`, then use `agentation` for the annotation packet.

### Example 4: Planning review, not UI review
- Prompt: "Open the generated plan in a browser so I can approve or reject steps before coding starts."
- Expected behavior: route to `plannotator`, because the artifact is a plan/diff rather than a rendered UI issue.

## Best practices

1. Pick the browser/runtime lane first; `agentation` is the feedback bridge, not every browser tool.
2. Prefer one annotation mode at a time instead of mixing copy-paste, watch loop, and platform setup in a single answer.
3. Keep the first integration minimal; only add hooks, callbacks, or webhooks when the workflow needs them.
4. Re-verify after fixes with the same review lane that produced the annotation.
5. Treat exact UI feedback as the deliverable — not a giant dump of install permutations.
6. Route out aggressively when the task is really plan review, fresh-browser verification, or running-browser reuse.

## References

Deep-dive docs in this skill:
- modes-and-routing
- platform-setup-and-hooks
- watch-loop-and-self-driving

Primary sources:
- https://github.com/benjitaylor/agentation
- https://agentation.com
- https://www.npmjs.com/package/agentation
- https://www.npmjs.com/package/agentation-mcp

## Metadata

- Version: 1.1.0
- Last updated: 2026-04-15
- Scope: exact rendered-UI feedback packets, watch loops, and platform handoff for coding agents
