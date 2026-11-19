# Solid Glass Sources and Provenance

## Upstream Repository
- **Repository:** [https://github.com/deeplethe/solid-glass](https://github.com/deeplethe/solid-glass)
- **Documentation & Registry:** [https://deeplethe.github.io/solid-glass](https://deeplethe.github.io/solid-glass)
- **Registry Index:** [https://deeplethe.github.io/solid-glass/r/registry.json](https://deeplethe.github.io/solid-glass/r/registry.json)
- **Upstream Commit:** `6e8903e494a15491ceda38fafea5056c95a74d44`
- **Default Branch:** `main`
- **License:** MIT License (`NOTICE.md` records upstream shadcn/ui MIT attribution)

## Stack Prerequisites
- React 19
- Tailwind CSS 4 (`@tailwindcss/vite` or PostCSS v4)
- shadcn/ui using Base UI (`@base-ui/react`) and `tw-animate-css`

## Operational Boundaries
- **Offline Preflight:** `scripts/preflight.py` inspects local `package.json`, `components.json`, and CSS files only; it never runs `npx`, modifies files, or opens network connections.
- **Registry Fetching:** Running `npx shadcn@latest add deeplethe/solid-glass/...` downloads files from GitHub/GitHub Pages and writes into the target project; confirm target paths first.
