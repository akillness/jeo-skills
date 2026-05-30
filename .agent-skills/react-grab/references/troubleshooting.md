# react-grab troubleshooting

## First checks

Before deeper debugging, verify:
- Node.js is **>=22**
- install happened from the project root
- the app is running in development mode
- the overlay is loaded before the relevant React tree renders

## Symptom → likely cause → fix

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Overlay never appears | not loaded in development path, or disabled globally | confirm dev-only insertion point and check `window.__REACT_GRAB_DISABLED__` |
| Component name is `null` | overlay loaded too late or React/source-map context unavailable | load earlier (`beforeInteractive` in Next.js) and stay in dev mode |
| File path missing | source maps or development metadata unavailable | verify dev build / source maps / unminified environment |
| Clipboard copy works poorly on transient hover UI | target disappears before capture | use `freeze()` / `unfreeze()` primitives workflow |
| MCP tool returns empty | no recent browser-side selection | select/hover element first, then call `get_element_context` |
| `grab init` fails immediately | old Node version or broken package-manager environment | upgrade to Node 22+ and retry from repo root |
| Agent-specific install feels wrong for browser automation | user actually wants browser control, not element capture | route to `browser-harness` or `playwriter` |

## Quick commands

```bash
# Check Node version
node --version

# Retry default install from project root
npx -y grab@latest init

# Add MCP workflow
npx -y grab@latest add mcp

# Remove an integration
npx -y grab@latest remove <agent>
```

## When to escalate out of react-grab

Escalate when the issue is really about:
- full browser automation, auth state, navigation, screenshots, or replay → `browser-harness` / `playwriter`
- visual review packets, layout comments, rendered annotations → `agentation`
- React performance, hydration, bundle size, or rerender churn → `react-best-practices`

## Truthfulness rule

Do not keep repeating the local helper-script story if upstream has moved.
For prerequisite disputes, prefer the current upstream raw sources:
- `README.md` for install shape
- `package.json` for runtime requirements
