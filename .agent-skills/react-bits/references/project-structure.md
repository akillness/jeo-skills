# Project Structure & Stack

## Stack Table

| Technology | Version / Details | Purpose |
| --- | --- | --- |
| **React** | ^19.0.0 / ^18.0.0 | Core UI library |
| **Vite** | ^6.0.0 | Build tool and dev server |
| **Tailwind CSS** | ^4.0.0 | Utility-first styling |
| **GSAP** | ^3.13.0 | High-performance timeline animations |
| **Three.js** | Fiber/Drei | 3D rendering and canvas components |
| **Framer Motion** | ^12.0.0 | Declarative UI animations |
| **jsrepo** | Registry CLI | Component distribution and packaging |

## Directory Layout

```
react-bits/
├── .github/             # GitHub Actions and workflows
├── .context/            # Context files for LLMs/agents
├── public/              # Static assets
├── scripts/             # Scaffolding and build scripts
│   └── generateComponent.js
├── src/
│   ├── assets/          # Logos and common images
│   ├── components/      # Animated components (Text, Backgrounds, UI)
│   ├── docs/            # Documentation pages and examples
│   └── main.tsx         # Application entry point
├── jsrepo.config.ts     # jsrepo registry configuration
├── package.json         # Scripts and dependencies
└── vite.config.js       # Vite configuration
```

## Component Registry & jsrepo

React Bits uses `jsrepo` to manage its component registry. This allows users to add components directly to their projects via CLI.
- Registry build output is generated via `npm run registry:build`.
- Components are structured to be self-contained, including their styles and internal hooks, making them easy to copy-paste or install.
