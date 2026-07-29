# Upstream reference

## Provenance

- Repository: https://github.com/abagames/agentic-gamedev-skills
- Inspected commit: `d632732fa0f09dfac9bb4d5fa2e5c8872f41cc10`
- Inspected commit date: 2026-07-27
- License: MIT

## Repository contract

Upstream skills live under `.agents/skills/<name>/` and use `SKILL.md` as the entry point. Individual payloads may include `references/`, `assets/`, `scripts/`, `tools/`, or `agents/`; selective installation must preserve the full selected directory.

The collection focuses on mini-games, including one-button controls, visual feedback, procedural audio, telemetry-guided tuning, and optional pixel-art assets. It also includes adjacent agent-workflow skills.

## Update policy

- Pin the full commit hash for reproducible shared installs.
- List the remote inventory before a bulk update.
- Stage and validate a selected payload before replacing anything.
- Do not automatically install the external references mentioned in the upstream README.
- Review upstream `AGENTS.md` when contributing to that repository; it is not automatically a policy for unrelated host repositories.

## Overlap policy

Some upstream names may overlap with skills already installed from other collections. The bundled installer therefore refuses to overwrite by default. Use `--force` only after comparing both directories and choosing the upstream version intentionally.
