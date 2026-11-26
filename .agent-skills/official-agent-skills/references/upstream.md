# Upstream Provenance: `anthropics/skills`

- **Repository**: <https://github.com/anthropics/skills>
- **Pinned Commit**: `e4bb5d960d87126ff3b3a8af1a104b7db67560ba` (`2026-11-16`)
- **License**: `Apache-2.0` (per-skill `LICENSE.txt`) + `THIRD_PARTY_NOTICES.md`
- **Local Skill Name Rationale**: Named `official-agent-skills` locally so skill evaluators that ban reserved `anthropic` in folder names pass cleanly while targeting `anthropics/skills`.

## Marketplace Plugins (`.claude-plugin/marketplace.json`)

- Marketplace name: `anthropic-agent-skills` (`/plugin marketplace add anthropics/skills`)
- `document-skills`: `docx`, `pdf`, `pptx`, `xlsx`
- `example-skills`: creative, design, web, dev, and communication examples

## All 19 Reference Skills (`skills/`)

- **Documents & Authoring**: `docx`, `pdf`, `pptx`, `xlsx`, `doc-coauthoring`
- **Creative & Design**: `algorithmic-art`, `brand-guidelines`, `canvas-design`, `frontend-design`, `slack-gif-creator`, `theme-factory`
- **Development & Agent Tooling**: `claude-api`, `mcp-builder`, `skill-creator`, `web-artifacts-builder`, `webapp-testing`
- **Comms & Guides**: `academy-guide`, `discernment-nudge`, `internal-comms`

## Specification & Template

- `spec/agent-skills-spec.md` -> links to <https://agentskills.io>
- `template/SKILL.md` -> minimal `name` + `description` frontmatter starter

## Cross-Routing

- `jeo-skills` frontmatter, TOON, and `skills.json` checks -> `skill-standardization` / `write-a-skill`
- Security & quality scoring -> `nvidia-skill-evaluator`
- Broader marketplace search -> `find-skills`
