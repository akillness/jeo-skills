# Contributing Focus & Guidelines

## Branch Naming Convention

When contributing to React Bits, you must follow the branch naming convention:
- **Features / Components**: `feat/<feature-name>` (e.g., `feat/fix-x-component` or `feat/new-text-animation`)

## Pull Request Guidelines

1. **Scaffold Component**: Use `npm run new:component` to ensure the component follows the standard structure.
2. **Self-Contained**: Ensure the component is self-contained and does not import internal utilities that won't be available when a user installs the component via `jsrepo`.
3. **Clean Up Animations**:
   - For GSAP: Always clean up timelines/tweens on unmount. Use `useGSAP` or clean up manually in `useEffect`/`useLayoutEffect`.
   - For Framer Motion: Use standard declarative props.
   - For Three.js: Ensure WebGL contexts and geometries/materials are disposed of properly.
4. **Lint & Format**: Run `npm run lint` and `npm run format` before submitting a PR.
5. **Documentation**: Add a corresponding documentation page or example under `src/docs/` to showcase the component.
