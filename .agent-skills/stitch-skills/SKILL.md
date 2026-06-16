---
name: stitch-skills
description: >
  A collection of Agent Skills for the Stitch MCP server: generate high-fidelity
  UI screens, create multi-page websites from a single prompt, produce DESIGN.md
  documentation, enhance vague UI prompts, convert designs to React/shadcn-ui
  components, and generate walkthrough videos via Remotion. Use when the user
  needs AI-assisted UI design generation, prompt refinement, or screen-to-code
  workflows. Triggers on: stitch, stitch-design, stitch-loop, enhance-prompt,
  react-components, remotion, shadcn-ui, screen generation, ui generation.
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: stitch, stitch-design, stitch-loop, screen-generation, ui-generation, enhance-prompt, react-components, remotion, shadcn-ui, design-md, mcp, agent-skills
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: stitch-skills
  version: latest
  source: google-labs-code/stitch-skills
  license: Apache-2.0
---

# stitch-skills — Agent Skills for Stitch MCP

> AI-powered UI design generation, prompt refinement, and screen-to-code workflows.

`stitch-skills` is a library of Agent Skills for the [Stitch MCP server](https://stitch.withgoogle.com), following the Agent Skills open standard for compatibility with Claude Code, Cursor, and Gemini CLI.

> **Note:** This is not an officially supported Google product.

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add google-labs-code/stitch-skills
```

### Skill (any platform)
```bash
# List available skills
npx skills add google-labs-code/stitch-skills --list

# Install a specific skill globally
npx skills add google-labs-code/stitch-skills --skill stitch-design --global
npx skills add google-labs-code/stitch-skills --skill stitch-loop --global
npx skills add google-labs-code/stitch-skills --skill enhance-prompt --global
npx skills add google-labs-code/stitch-skills --skill react-components --global
npx skills add google-labs-code/stitch-skills --skill remotion --global
npx skills add google-labs-code/stitch-skills --skill shadcn-ui --global
npx skills add google-labs-code/stitch-skills --skill design-md --global

# Install from jeo-skills
npx skills add https://github.com/akillness/jeo-skills --skill stitch-skills
```

## When to use

- Generate **high-fidelity UI screens** from natural-language prompts via Stitch
- Create **multi-page websites** from a single prompt with automated file organization
- Produce **DESIGN.md documentation** that translates design systems for AI agents
- **Refine vague UI ideas** into polished, Stitch-optimized prompts with specificity
- Convert Stitch designs into **React component architectures** with consistency checks
- Generate **walkthrough videos** from Stitch projects using Remotion
- Integrate **shadcn/ui components** into React applications

## Do not use when

- You need token-level design system lint/diff/export → route to `google-design`
- You need WCAG contrast audit only → route to `web-accessibility`
- You need full backend API design → route to `backend-api`
- You need generic React state management → route to `react-patterns`

## Available skills

### stitch-design
Primary skill for prompt refinement and screen generation through the Stitch MCP system.

```
Workflow:
1. Enhance the user's prompt for Stitch
2. Call stitch_generate_screen MCP tool
3. Validate and iterate on the output
```

### stitch-loop
Automates multi-page website creation from a single prompt.

```
Workflow:
1. Parse top-level pages from the prompt
2. Generate each screen via stitch_generate_screen
3. Organize files and validate output
4. Produce a complete, linked website
```

### enhance-prompt
Transforms vague UI ideas into polished, Stitch-optimized prompts.

```bash
# Example: add design keywords, specificity, and system context
Input:  "a login page"
Output: "A clean, minimal login page with email/password fields,
         a primary CTA button using brand colors, subtle card elevation,
         and a 'Forgot password?' link below the form."
```

### design-md
Generates `DESIGN.md` documentation that translates design systems into natural, semantic language optimized for Stitch screen generation.

```bash
# Output: repo-root DESIGN.md with brand tokens in Stitch-friendly language
```

### react-components
Converts Stitch screens to React component architectures with consistency validation.

```
Workflow:
1. Parse Stitch screen JSON/HTML output
2. Map elements to React component tree
3. Validate component naming and prop consistency
4. Output component files with TypeScript types
```

### remotion
Creates walkthrough videos from Stitch projects using Remotion with smooth transitions, zooming, and text overlays.

```bash
# Requires: npx remotion studio
# Output: MP4 walkthrough video of Stitch screens
```

### shadcn-ui
Provides guidance on implementing shadcn/ui components within React applications built from Stitch designs.

```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card input form
```

## Repository structure

Each skill follows the Agent Skills open standard:

```
stitch-skills/
├── stitch-design/
│   ├── SKILL.md        — agent mission documentation
│   ├── scripts/        — validation and networking executables
│   ├── resources/      — knowledge base (checklists, style guides)
│   └── examples/       — reference implementations
├── stitch-loop/
├── enhance-prompt/
├── react-components/
├── remotion/
├── shadcn-ui/
└── design-md/
```

## Operating rules

1. Run `enhance-prompt` before any `stitch-design` generation for better results
2. Use `design-md` to produce a DESIGN.md before starting `stitch-loop` multi-page work
3. Validate React components for naming consistency after `react-components` output
4. Keep Stitch screen outputs in a dedicated `screens/` directory for `remotion` to consume
5. Use `shadcn-ui` integration only after `react-components` has established the component tree
6. Iterate: enhance → generate → review → refine is the recommended cycle

## Examples

```bash
# Full UI generation workflow
# 1. Enhance your prompt
stitch enhance-prompt "a dashboard for monitoring server health"

# 2. Generate screens via Stitch MCP
stitch generate "..." --pages overview,alerts,settings

# 3. Convert to React
stitch react-components ./screens/

# 4. Add shadcn/ui
npx shadcn-ui@latest add card badge table

# 5. Generate walkthrough video
stitch remotion ./screens/ --output walkthrough.mp4
```

Source: [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills) — Apache-2.0 License
