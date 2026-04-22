# stitch-skills — Agent Skills for Stitch MCP

> AI-powered UI design generation, prompt refinement, and screen-to-code workflows.

← [Back to README](../../README.md)

---

## What `stitch-skills` owns

`stitch-skills` is a library of Agent Skills for the [Stitch MCP server](https://stitch.withgoogle.com), following the Agent Skills open standard for compatibility with Claude Code, Cursor, and Gemini CLI.

Use this skill when you need to:
- **Generate high-fidelity UI screens** from natural-language prompts
- **Create multi-page websites** from a single prompt with automated file organization
- **Produce DESIGN.md documentation** in a Stitch-optimized semantic language
- **Refine vague UI prompts** into polished, Stitch-ready descriptions
- **Convert Stitch screens to React** component architectures with shadcn/ui
- **Generate walkthrough videos** from Stitch projects using Remotion

> **Note:** This is not an officially supported Google product.

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add google-labs-code/stitch-skills
```

### npm / npx
```bash
# List all available skills
npx skills add google-labs-code/stitch-skills --list

# Install individual skills globally
npx skills add google-labs-code/stitch-skills --skill stitch-design --global
npx skills add google-labs-code/stitch-skills --skill stitch-loop --global
npx skills add google-labs-code/stitch-skills --skill enhance-prompt --global
npx skills add google-labs-code/stitch-skills --skill react-components --global
npx skills add google-labs-code/stitch-skills --skill remotion --global
npx skills add google-labs-code/stitch-skills --skill shadcn-ui --global
npx skills add google-labs-code/stitch-skills --skill design-md --global
```

### Skill (oh-my-skills)
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill stitch-skills
```

---

## Available skills

| Skill | Purpose |
|-------|---------|
| `stitch-design` | Primary: prompt refinement + screen generation via Stitch MCP |
| `stitch-loop` | Multi-page website generation from a single prompt |
| `enhance-prompt` | Transform vague UI ideas into polished Stitch-optimized prompts |
| `design-md` | Generate DESIGN.md in Stitch-friendly semantic language |
| `react-components` | Convert Stitch screens to React component architectures |
| `remotion` | Create walkthrough videos from Stitch projects |
| `shadcn-ui` | Integrate shadcn/ui components into React apps from Stitch designs |

---

## Quick start

```bash
# 1. Enhance your prompt
stitch enhance-prompt "a dashboard for monitoring server health"

# 2. Generate screens (stitch-design or stitch-loop)
stitch generate "A clean health dashboard with overview, alerts, and settings pages"

# 3. Convert to React + shadcn/ui
stitch react-components ./screens/
npx shadcn-ui@latest add card badge table

# 4. Generate walkthrough video
stitch remotion ./screens/ --output walkthrough.mp4
```

---

## Skill workflow

```
enhance-prompt → stitch-design → react-components → shadcn-ui
                       ↓
                 stitch-loop (multi-page)
                       ↓
                  design-md (DESIGN.md)
                       ↓
                   remotion (video)
```

---

## Key rules

| Rule | Detail |
|------|--------|
| Always enhance first | Run `enhance-prompt` before `stitch-design` for better generation quality |
| DESIGN.md before loop | Use `design-md` before `stitch-loop` for consistent multi-page output |
| Component tree first | Establish the React component tree with `react-components` before adding `shadcn-ui` |
| Screens directory | Keep Stitch outputs in `screens/` for `remotion` to consume |
| Iterate | enhance → generate → review → refine is the recommended cycle |

---

## Further reading

- [`.agent-skills/stitch-skills/SKILL.md`](../../.agent-skills/stitch-skills/SKILL.md)
- [google-labs-code/stitch-skills](https://github.com/google-labs-code/stitch-skills)
