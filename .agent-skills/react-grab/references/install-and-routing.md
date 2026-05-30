# react-grab install and routing guide

## Default installation path

Use the upstream CLI from the project root:

```bash
npx -y grab@latest init
```

Why this is the default:
- upstream README positions `init` as the primary install path
- it auto-detects framework/project shape
- it keeps the main skill from teaching too many manual snippets by default

## Prerequisites

Before recommending install steps, confirm:
- **Node.js >=22** (upstream `package.json` requirement)
- project root context (where `next.config.*`, `vite.config.*`, or equivalent lives)
- development-only usage; this should not ship to production

## When to stay on the default path

Stay with `grab init` when the user says things like:
- “set up react-grab”
- “install it in my app”
- “I want to copy element context into Claude/Cursor/Codex/Gemini”
- “make the component picker work”

## When to use framework-specific setup

Only drop to manual instructions when:
- `grab init` cannot detect the app correctly
- the user needs to patch a specific entry point
- the user is working inside a custom setup and asks for the exact insertion point

### Next.js App Router

Add to `app/layout.tsx`:

```tsx
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Next.js Pages Router

Add to `pages/_document.tsx`:

```tsx
import Script from "next/script";
import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
```

### Vite

Add to the entry path or top-level module loaded in development:

```tsx
if (import.meta.env.DEV) {
  import("react-grab");
}
```

### Webpack

Install the package if needed, then gate it to development:

```bash
npm install --save-dev react-grab
```

```tsx
if (process.env.NODE_ENV === "development") {
  import("react-grab");
}
```

## Routing boundaries

Use `react-grab` when the real need is **React element context capture**.

Route elsewhere when the real need is:
- **fresh disposable browser automation** → `browser-harness`
- **running-browser reuse / existing auth state** → `playwriter`
- **rendered UI review / annotation packets** → `agentation`
- **React performance / hydration / RSC / bundle issues** → `react-best-practices`
- **component-system / token / UI-architecture work** → `design-system` or `ui-component-patterns`

## Quick decision table

| Situation | Best move |
|-----------|-----------|
| User just wants react-grab installed | `npx -y grab@latest init` |
| Auto-detect fails or user needs exact insertion point | Use manual framework snippet |
| User wants tool-based element retrieval | `grab add mcp` |
| User wants a custom action or hook | Plugin/API path |
| User is really asking for browser automation or visual review | Route out to adjacent skills |
