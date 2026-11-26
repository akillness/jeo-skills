---
name: official-agent-skills
description: >
  Browse, install, and reference anthropics/skills, the official Anthropic Agent Skills catalog and specification hosting 19 reference skills across documents (docx, pdf, pptx, xlsx, doc-coauthoring), design (frontend-design, algorithmic-art, brand-guidelines, canvas-design, theme-factory, slack-gif-creator), development (skill-creator, mcp-builder, claude-api, web-artifacts-builder, webapp-testing), and comms. Use when adding anthropics/skills plugins, inspecting the agentskills.io template, or auditing per-skill licenses. Do not use for jeo-skills catalog validation (route to skill-standardization) or quality scoring (route to nvidia-skill-evaluator). Triggers on: anthropics/skills, anthropic agent skills, document-skills, example-skills, official-agent-skills.
allowed-tools: Read Glob Grep Bash
compatibility: Claude Code plugin marketplace or manual skill directory copy across Agent Skills compatible hosts. Preflight runs offline in Python 3.10+.
license: Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/anthropics/skills
  upstream_commit: e4bb5d960d87126ff3b3a8af1a104b7db67560ba
  pinned_at: "2026-11-16"
---

# Official Agent Skills (`anthropics/skills`)

Source-pinned operator guide for `anthropics/skills` (`Apache-2.0` + `THIRD_PARTY_NOTICES.md`). Note that this package uses the local name `official-agent-skills` to comply with reserved-word skill evaluator rules (`anthropic`) while pointing directly to `anthropics/skills`.

## When to use this skill

- Adding the official `anthropic-agent-skills` marketplace (`/plugin marketplace add anthropics/skills`) and installing `document-skills` or `example-skills` plugins.
- Consulting the Agent Skills specification pointer (`spec/agent-skills-spec.md`) or starter `template/SKILL.md` from upstream.
- Mapping which of the 19 upstream `skills/` directories already have local `jeo-skills` equivalents (`pdf`, `docx`, `pptx`, `xlsx`, `mcp-builder`, `frontend-design`, etc.) before copying upstream files.
- Auditing `THIRD_PARTY_NOTICES.md` and per-skill `LICENSE.txt` files before vendoring or redistributing reference skills.
- Routing out: use `skill-standardization` and `write-a-skill` for `jeo-skills` manifest/lint rules, `nvidia-skill-evaluator` for security/impact scoring, and `find-skills` for broader multi-repo discovery.

## Instructions

1. **Run offline preflight first**:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Install selective plugins or individual skill directories**:
   - **Claude Code marketplace**:
     - `/plugin marketplace add anthropics/skills`
     - `/plugin install document-skills@anthropic-agent-skills`
     - `/plugin install example-skills@anthropic-agent-skills`
   - **Cross-host manual install**: Copy only the specific `skills/<name>` directory needed instead of dumping all 19 folders into a repo blindly.

3. **Check local `jeo-skills` counterparts before duplicating**:
   - Several reference skills (`docx`, `pdf`, `pptx`, `xlsx`, `mcp-builder`, `frontend-design`, `webapp-testing`, `doc-coauthoring`, `internal-comms`, `brand-guidelines`, `canvas-design`, `algorithmic-art`, `theme-factory`, `slack-gif-creator`, `web-artifacts-builder`) are already packaged inside `jeo-skills` `.agent-skills/`.
   - Prefer invoking the local installed skill when already present unless you explicitly need upstream `academy-guide`, `claude-api`, `discernment-nudge`, or `skill-creator` updates.

4. **Verify license and notice files before redistribution**:
   - While top-level `skills/*/LICENSE.txt` files in this pinned commit use `Apache-2.0`, `THIRD_PARTY_NOTICES.md` includes BSD-2-Clause and third-party dependency attributions (such as `imageio` / `imageio-ffmpeg` in `slack-gif-creator`). Always preserve `LICENSE.txt` and `THIRD_PARTY_NOTICES.md` when redistributing.

## Examples

- **Install official document plugins in Claude Code**:
  Run `/plugin marketplace add anthropics/skills`, then `/plugin install document-skills@anthropic-agent-skills`.
- **Scaffold a spec-compliant skill using the official starter**:
  Inspect `template/SKILL.md` (`name`, `description`, Markdown instructions) and then run `jeo-skills` `skill-standardization` validation before adding to `.agent-skills/`.

## Best practices

- Treat `anthropics/skills` as an upstream reference catalog; install only the specific plugin or skill subfolder you need.
- Never overwrite customized local `.agent-skills/` implementations with raw upstream copies without diffing first.
- Keep `skill-standardization` (`validate_skill.sh` + `skills.json` checks) as the authoritative gate inside `jeo-skills`.

## References

- Pinned upstream 19-skill catalog, marketplace plugins, and license matrix: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
