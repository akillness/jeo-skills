---
name: react-bits
description: >
  Integrate, customize, and contribute to react-bits (github.com/DavidHDev/react-bits) —
  the largest and most creative library of animated React components. It covers Vite,
  Tailwind CSS v4, Three.js/Fiber, GSAP, and Framer Motion integrations. Use when the
  user asks about react-bits, animated React components, jsrepo registry, or contributing
  new animated components to the react-bits repository.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Universal — works with any agent that has shell access. Requires Node.js 18+ and
  Tailwind CSS v4 support.
metadata:
  tags: react-bits, animated-components, gsap, three-js, framer-motion, tailwind-v4, jsrepo, react, vite
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: DavidHDev/react-bits
---

# react-bits

**Version 1.0.0**  
DavidHDev/react-bits  
January 2026

> **Note:**  
> This skill provides guidance for integrating, customizing, and contributing to  
> `react-bits` — the largest and most creative library of animated React components.  
> It covers Vite 4/5/6, Tailwind CSS v4, Three.js/Fiber, GSAP, and Framer Motion integrations.

---

## When to use this skill

- When you need to integrate highly creative, animated React components (text animations, background effects, interactive UI elements) into a React/Next.js project.
- When you need to customize or debug existing `react-bits` components (e.g., adjusting GSAP timelines, Three.js canvas setups, or Tailwind classes).
- When contributing new animated components to the `react-bits` repository under the `feat/<feature-name>` branch convention.

## When NOT to use this skill

- For standard, non-animated UI components (use standard component libraries like Radix, Shadcn, or Tailwind UI instead).
- When the target project cannot support heavy animation libraries (Three.js, GSAP, Framer Motion) due to strict bundle size constraints.

## Project Shape

- **Stack**: React, Vite, Tailwind CSS v4, GSAP, Three.js (`@react-three/fiber`, `@react-three/drei`), Framer Motion (`motion`), jsrepo (for registry management).
- **Registry**: Uses `jsrepo` to build and distribute components.
- **Scripts**:
  - `npm run dev`: Concurrently runs `jsrepo build --watch` and `vite` docs server.
  - `npm run build`: Builds the registry, generates LLMs text, sitemap, and builds the Vite site.
  - `npm run new:component`: Generates a new component template using `scripts/generateComponent.js`.
  - `npm run lint`: Lints the codebase using ESLint.
  - `npm run format`: Formats the codebase using Prettier.

## Instructions

### Step 1: Component Integration & Installation
1. Identify the desired component from the `react-bits` catalog (e.g., Text Animations, Backgrounds, UI Components).
2. Install the required peer dependencies in the target project (e.g., `gsap`, `motion`, `@react-three/fiber`, `lucide-react` depending on the component).
3. Copy the component source code or use `jsrepo` if configured in the target project.

### Step 2: Customization & Performance Optimization
1. **Tailwind CSS**: Ensure Tailwind CSS is configured (Tailwind v4 is used in the source repo).
2. **GSAP Contexts**: When customizing GSAP animations, always clean up timelines/tweens inside `useLayoutEffect` or use `@gsap/react`'s `useGSAP` hook to prevent memory leaks and double-triggering in React 18/19 Strict Mode.
3. **Three.js Canvas**: Ensure `<Canvas>` components are properly sized and unmounted to free WebGL contexts.

### Step 3: Contributing a New Component
1. Run `npm run new:component` to scaffold a new component.
2. Implement the component under `src/components/` using clean React patterns.
3. Verify the component works in the local docs server (`npm run dev`).
4. Run `npm run lint` and `npm run format` before committing.
5. Create a branch named `feat/<feature-name>` and submit a PR to `main`.

## Best practices

- **GSAP Cleanup**: Always clean up GSAP timelines/tweens on unmount to prevent memory leaks.
- **Self-Contained Components**: Ensure components do not import internal utilities that won't be available when a user installs the component via `jsrepo`.
- **Branch Naming**: Follow the `feat/<feature-name>` branch naming convention for all pull requests.

## Examples

### Example 1: Safe GSAP Animation Component
```tsx
import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export default function AnimatedBox() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.to('.box', { rotation: 360, duration: 2, repeat: -1, ease: 'linear' });
  }, { scope: container });

  return (
    <div ref={container}>
      <div className="box w-16 h-16 bg-blue-500 rounded" />
    </div>
  );
}
```

## References

| File | Purpose |
| --- | --- |
| `package.json` | Project dependencies (GSAP, Three.js, Tailwind v4) and scripts |
| `CONTRIBUTING.md` | Branch naming conventions (feat/<feature-name>) and PR guidelines |
| `jsrepo.config.ts` | Registry configuration for component distribution |
