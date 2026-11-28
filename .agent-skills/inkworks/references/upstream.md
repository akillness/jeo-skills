# Upstream Provenance: `Moh4696/inkworks-skill`

- **Repository**: <https://github.com/Moh4696/inkworks-skill>
- **Pinned Commit**: `8769b7d4191088a94448294d7bd28ae84d34906c` (`2026-11-25`)
- **License**: `MIT`
- **Primary Interface**: `prompt`

## Installation & Setup Channels

- Prompt instructions: `PROMPT.md` in repository root
- Agent skill registration: `.agents/` and `.claude-plugin/`
- Three.js CDN/npm integration: `npm install three`

## Key Architecture & Concepts

- **Engineering Sheet Aesthetic**: Renders 3D scenes with blueprint blue/white color palettes, technical grid planes, and drafted wireframes.
- **Interactive Annotation Callouts**: Synchronizes camera focus with numbered explanatory steps and tooltips.
- **Agent Prompting Protocol**: Structured system prompts instructing LLMs to produce self-contained single-page Three.js applications.

## Boundaries & Cross-Routing

- Generates browser-based WebGL/Three.js web pages, not static SVG/PNG vector exports.
- Route out: Standard 2D flowcharts and sequence diagrams -> `diagram`.
