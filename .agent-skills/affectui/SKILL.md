---
name: affectui
description: >
  Integrate and customize flohoeller/affectui React 19 UI components for AI agents and web applications. Use when adding single-file zero-Tailwind TSX agent components (tool-call cards, decision inbox, thinking loaders, message actions, email drafts, smart recommendations, progress trackers), blocks, illustrations, or motion primitives via the shadcn CLI or affectUI HTTP MCP server (`https://www.affectui.com/api/mcp`), choosing between `-clean` and classic styles, or checking affectUI Pro licensing boundaries. Route shadcn/Tailwind v4 glass theme tokens to solid-glass, OpenUI Lang generative UI streaming to open-intelligent-ui, and SKILL.md spec linting to skill-standardization.
allowed-tools: Bash Read Grep Glob
metadata:
  version: 0.1.0
  source: https://github.com/flohoeller/affectui
  upstream_commit: 60308e4e42f1641ab65bb496637f02f3fb5918e3
---

# affectUI

## When to use this skill

Use when building AI agent interfaces or React 19 app screens with `flohoeller/affectui` — a free, MIT-licensed library of 74 single-file `.tsx` components, blocks, illustrations, and motion items whose styles live inside each file (no Tailwind or external CSS configuration required).

### Route-outs
- For Tailwind CSS 4 + shadcn/ui frosted glass design tokens and `solid-glass.css`, use `solid-glass`.
- For streaming OpenUI Lang 1.0 generative UI apps with `$variable` expressions and `@functions`, use `open-intelligent-ui`.
- For general token governance or multi-brand design system architecture, use `design-system`.
- For validating `SKILL.md` format or catalog metadata, use `skill-standardization`.

## Instructions

### 1. Run offline project preflight

Inspect the target React project for React 19 compatibility, `@/*` path aliases, `components.json` `@affectui` registry configuration, and existing installed items before adding components:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --workspace "/absolute/path/to/react-app" --json
```

The preflight script inspects local manifests only (`package.json`, `tsconfig.json`, `components.json`, `components/ui/`) without running `npx` or making network calls.

### 2. Verify prerequisites and clean vs classic style choice

Confirm in the target project:
- **React 19** is installed (TypeScript optional).
- **`@/*` import alias** is configured if installing via `shadcn` CLI.
- **Style variant**: Most components and blocks ship two variants:
  - `-clean` (default recommended modern look, e.g., `tool-call-card-clean.json`)
  - Classic style without `-clean` suffix (e.g., `tool-call-card.json`)
- **Dark mode**: Components react automatically when an ancestor carries `class="dark"` or `data-theme="dark"`. Motion respects `prefers-reduced-motion`.

### 3. Install components via shadcn CLI, namespace, or direct copy

Install a single item directly by registry URL:

```bash
npx shadcn@latest add https://www.affectui.com/r/tool-call-card-clean.json
```

Or register the `@affectui` namespace once in `components.json`:

```json
{
  "registries": {
    "@affectui": "https://www.affectui.com/r/{name}.json"
  }
}
```

Then install using short names:

```bash
npx shadcn@latest add @affectui/decision-inbox-clean
npx shadcn@latest add @affectui/thinking-loader-clean
```

For copy-and-paste without the shadcn CLI, copy the `.tsx` file directly from `components/`, `blocks/`, `illustrations/`, or `motion/` in the upstream repository into `src/components/ui/` and import it.

### 4. Connect the affectUI MCP server or LLM context (optional)

For AI-assisted discovery and component generation, connect the hosted HTTP MCP server only with user approval:

```bash
claude mcp add --transport http affectui https://www.affectui.com/api/mcp
```

For other MCP clients (`Cursor`, `VS Code`, `Codex`), add `{ "mcpServers": { "affectui": { "url": "https://www.affectui.com/api/mcp" } } }`. Without MCP, point assistants at `https://www.affectui.com/llms.txt` or `llms-full.txt`.

### 5. Respect the MIT vs affectUI Pro boundary

Only 74 items (free components, `logo-marquee`, `testimonial-wall`, 17 illustrations, 4 motion items) live in `flohoeller/affectui` under the MIT license. **Pro items** shown in showcase docs (`Agent Tree`, `Agent Inbox`, `Trace Waterfall`, `Context Map`, `Agent Handoff`) are commercial [affectUI Pro](https://www.affectui.com/pricing) components and are **not** in the open-source repository or public registry. Do not fabricate or attempt to fetch Pro registry URLs; use open-source alternatives or inform the user when a requested component is Pro-only.

## Examples

### Add an agent tool-call and approval workflow UI

```bash
# 1. Check React 19 + shadcn alias readiness
python3 "$SKILL_DIR/scripts/preflight.py" --workspace /path/to/app --json

# 2. Install free agentic components (clean style)
npx shadcn@latest add https://www.affectui.com/r/thinking-loader-clean.json
npx shadcn@latest add https://www.affectui.com/r/tool-call-card-clean.json
npx shadcn@latest add https://www.affectui.com/r/decision-inbox-clean.json
npx shadcn@latest add https://www.affectui.com/r/message-actions-clean.json
```

```tsx
import { ThinkingLoader } from "@/components/ui/thinking-loader-clean";
import { ToolCallCard } from "@/components/ui/tool-call-card-clean";
import { DecisionInbox } from "@/components/ui/decision-inbox-clean";
```

## Best practices

1. **Choose one variant family consistently:** Use `-clean` across a project unless intentionally targeting the classic aesthetic.
2. **Do not add Tailwind hacks for internal styles:** affectUI files bundle self-contained styles and container queries inside each `.tsx`; pass state callbacks and props rather than overriding internals.
3. **Wire human-in-the-loop permissions explicitly:** Use `DecisionInbox` or `EmailDraft` callbacks to gate side-effecting backend tool execution behind user confirmation.
4. **Keep Pro vs OSS boundaries explicit:** Verify item availability in `references/components-and-mcp.md` before recommending `Agent Tree`, `Trace Waterfall`, `Context Map`, `Agent Inbox`, or `Agent Handoff`.

## References

- [Free Components, Registry & MCP Reference](references/components-and-mcp.md): Full inventory of 74 MIT items (`-clean` vs classic), MCP config, and Pro exclusions.
- [Sources and Provenance](references/sources.md): Upstream pin (`60308e4e42f1641ab65bb496637f02f3fb5918e3`), MIT license, and operational boundaries.
- [Evaluation Scenarios](evals/evals.json): Five behavioral test scenarios covering component selection, MCP config, preflight checks, and Pro boundaries.
