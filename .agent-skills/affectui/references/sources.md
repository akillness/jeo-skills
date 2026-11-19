# affectUI Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/flohoeller/affectui](https://github.com/flohoeller/affectui)
- **Website & Registry:** [https://www.affectui.com](https://www.affectui.com)
- **Author:** Flo Hoeller (`@flohoeller`)
- **Upstream Commit:** `60308e4e42f1641ab65bb496637f02f3fb5918e3`
- **Default Branch:** `main`
- **License:** MIT License (74 free items in repository; affectUI Pro items are commercial and excluded)

## Technical Requirements
- **React:** React 19 (TypeScript or JavaScript)
- **Frameworks:** Next.js, Vite, Remix, or plain React
- **Styling:** Self-contained inline styles inside each `.tsx` file (zero Tailwind or CSS file dependencies)
- **Dark Mode:** Triggered via ancestor `.dark` class or `data-theme="dark"` attribute

## Operational Boundaries
- **Offline Preflight:** `scripts/preflight.py` uses Python standard library only, makes zero network calls, spawns no child processes, and reads no credential values.
- **Registry/MCP Consent:** Installing registry items via `npx shadcn@latest add` or registering `https://www.affectui.com/api/mcp` fetches external assets and requires explicit user approval.
- **Pro Exclusion:** Never fabricate registry URLs for commercial Pro-only components (`Agent Tree`, `Agent Inbox`, `Trace Waterfall`, `Context Map`, `Agent Handoff`).
