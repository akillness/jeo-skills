# affectUI Free Components, Registry, and MCP Reference

## Registry Namespace Setup

Add to `components.json`:

```json
{
  "registries": {
    "@affectui": "https://www.affectui.com/r/{name}.json"
  }
}
```

Registry pattern:
- Clean variant (recommended): `https://www.affectui.com/r/<slug>-clean.json`
- Classic variant: `https://www.affectui.com/r/<slug>.json`

## Free Agentic & Core Components (51 items, `-clean` + classic)

### Agent Workflow & AI Interaction
- `tool-call-card` — single-line agent tool execution with timer, status, arguments, result, and retry
- `decision-inbox` — open human-in-the-loop decisions with two quick action choices
- `thinking-loader` — eight-ray spinner and shimmering phase label settling on check
- `message-actions` — action bar under AI messages
- `email-draft` — agent-drafted email review card
- `smart-recommendation` — suggestion card with confidence signal, alternatives, and accept/undo
- `change-summary` — summary of changes since last checkpoint
- `progress-tracker` — animated onboarding/task checklist
- `rating` — star or thumbs-up/down feedback for AI replies

### Core UI Controls, Layout & Overlays
- `avatar`, `badge`, `breadcrumb`, `button`, `card`, `checkbox`, `code-block`, `color-picker`, `comment-thread`, `context-menu`, `date-picker`, `dialog`, `dropdown-menu`, `empty-state`, `filter-menu`, `form-field`, `hover-card`, `icon-button`, `kbd`, `notification-stack`, `number-input`, `otp-input`, `pagination`, `popover`, `profile-menu`, `reaction-bar`, `resizable`, `scroll-area`, `segmented-control`, `select`, `separator`, `skeleton`, `spinner`, `switch`, `tag-input`, `text-area`, `text-field`, `time-picker`, `tips-panel`, `toggle-group`, `tooltip`, `tree-view`

## Free Blocks (2 items, `-clean` + classic)
- `logo-marquee` — endless "Trusted by" strip
- `testimonial-wall` — landing-page wall of quotes

## Free Illustrations (17 items, single slug)
`agent-team`, `cover-flow`, `region-dach`, `empty-calendar`, `enrichment-orbit`, `frost-cloud`, `ghosted-chat`, `glow-cloud`, `integration-beam`, `integration-grid`, `layer-stack`, `lead-sourcing`, `logo-cluster`, `model-wheel`, `side-folder`, `tab-overload`, `team-invite`

## Free Motion Primitives (4 items, single slug)
`grid-background`, `number-ticker`, `shimmer-loader`, `text-reveal`

## Pro-Only Items (Not in OSS Repository)
The following showcase items belong to **affectUI Pro** (commercial) and have no source files in `flohoeller/affectui`:
- `Agent Tree`
- `Agent Inbox`
- `Trace Waterfall`
- `Context Map`
- `Agent Handoff`

## AI Tooling & MCP Integration
- **Claude Code:** `claude mcp add --transport http affectui https://www.affectui.com/api/mcp`
- **Generic MCP JSON:**
  ```json
  {
    "mcpServers": {
      "affectui": {
        "url": "https://www.affectui.com/api/mcp"
      }
    }
  }
  ```
- **Context files:** `https://www.affectui.com/llms.txt` and `https://www.affectui.com/llms-full.txt`
