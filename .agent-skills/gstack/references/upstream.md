# Upstream Provenance: `garrytan/gstack`

- **Repository**: <https://github.com/garrytan/gstack>
- **Pinned Commit**: `0febbce1e4382b140a930f6a17c53234de2b05e7` (`2026-11-26`)
- **License**: `MIT`
- **Runtime Requirement**: `bun` (builds headless Playwright Chromium daemon `$B`)

## Host Setup (`./setup`)

- `./setup --host claude|codex|opencode|cursor|factory|kiro|copilot|agy|gemini|openclaw|hermes|auto`
- Compiles skill templates (`SKILL.md.tmpl`) and builds the persistent `$B` browser binary (`~100ms` commands over warm Chromium daemon).

## Role & Sprint Skills

- **Product & Architecture**: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/design-shotgun`, `/design-html`
- **Code Quality & Security**: `/review`, `/investigate`, `/cso`, `/codex`
- **Browser QA & Performance**: `/browse`, `/qa`, `/qa-only`, `/canary`, `/benchmark`
- **Release & Retro**: `/ship`, `/land-and-deploy`, `/document-release`, `/retro`, `/gstack-upgrade`
- **Safety Guardrails**: `/careful`, `/freeze`, `/guard`, `/unfreeze`

## Boundaries & Cross-Routing

- Gate `/ship`, `/land-and-deploy`, and remote deploy steps behind explicit user approval.
- On macOS when Aside browser is running, follow local `aside-browser` priority first unless gstack `$B` QA flows are specifically invoked.
- Route pure Socratic TDD methodology to `superpowers` and Chrome DevTools traces to `chrome-devtools-mcp`.
