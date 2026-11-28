---
name: inkworks
description: >
  Guide coding agents with Moh4696/inkworks-skill to generate interactive 3D how-it-works visual explainers styled like an engineering blueprint or architectural schematic in Three.js. Use when creating interactive product architecture diagrams, mechanical exploded views, animated process flows, or technical documentation with blueprint shader aesthetics, annotated callouts, and OrbitControls navigation. Do not use for standard 2D vector Mermaid/D2 diagrams (route to diagram) or pure video rendering (route to media-video). Triggers on: inkworks, interactive 3d diagram, engineering sheet explainer, threejs blueprint, architectural how-it-works, Moh4696/inkworks-skill.
allowed-tools: Read Glob Grep Bash
compatibility: Node.js 18+, Three.js, modern WebGL browser. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/Moh4696/inkworks-skill
  upstream_commit: 8769b7d4191088a94448294d7bd28ae84d34906c
  pinned_at: "2026-11-25"
---
# Inkworks (`Moh4696/inkworks-skill`)

Source-pinned operator guide for `Moh4696/inkworks-skill` (MIT), providing verified instructions and offline preflight validation.

## When to use this skill

- Generate interactive 3D how-it-works explainers styled like engineering drawings and blueprint sheets in Three.js.
- For complete trigger patterns: inkworks, 3d-diagram, threejs, blueprint, explainer, technical-visualization.
- Cross-routing boundaries: route out to `diagram`, `threejs-fundamentals`, `web-design` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Prompt instructions: `PROMPT.md` in repository root
   - Agent skill registration: `.agents/` and `.claude-plugin/`
   - Three.js CDN/npm integration: `npm install three`

3. **Execute verified workflows & operations**:
   - **Engineering Sheet Aesthetic**: Renders 3D scenes with blueprint blue/white color palettes, technical grid planes, and drafted wireframes.
   - **Interactive Annotation Callouts**: Synchronizes camera focus with numbered explanatory steps and tooltips.
   - **Agent Prompting Protocol**: Structured system prompts instructing LLMs to produce self-contained single-page Three.js applications.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Generates browser-based WebGL/Three.js web pages, not static SVG/PNG vector exports.
   - Route out: Standard 2D flowcharts and sequence diagrams -> `diagram`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
