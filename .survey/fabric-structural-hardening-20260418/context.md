# Context: fabric structural hardening

## Workflow Context
`fabric` sits in the utilities / developer-workflow lane as the pattern-first CLI for reusable text transforms over stdin, files, transcripts, notes, logs, and cleaned article text. The repo already modernized it into six modes, but the current `SKILL.md` still carries too much explanation that can live in support docs instead. The structural question this run is not whether Fabric deserves a skill; it does. The question is whether the front door can become smaller and faster while preserving the same durable boundary.

Primary-source evidence still supports the current boundary: the upstream README positions Fabric around a large pattern library, stdin/file workflows, custom patterns, and a built-in REST API server (`https://raw.githubusercontent.com/danielmiessler/Fabric/main/README.md`). The REST API docs confirm that `fabric --serve` exposes pattern listing, CRUD, apply, and chat endpoints, plus optional `--api-key` auth (`https://raw.githubusercontent.com/danielmiessler/Fabric/main/docs/rest-api.md`). GitHub API repo metadata also shows that Fabric remains an active upstream with frequent April 2026 releases and a large operator community (`https://api.github.com/repos/danielmiessler/Fabric`, `https://api.github.com/repos/danielmiessler/Fabric/releases?per_page=5`).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| CLI operator | Run repeatable text transforms over existing content | intermediate |
| Workflow maintainer | Put Fabric inside scripts, shells, or HTTP pipelines | intermediate to advanced |
| Team knowledge worker | Reuse custom pattern packs for recurring summaries/extraction | intermediate |
| Skill maintainer | Keep `fabric` clearly separated from coding assistants and generic prompt wrappers | advanced |

## Current Workarounds
1. Keep all routing, examples, and caveats in one long `SKILL.md`, which preserves information but slows trigger scanning.
2. Rely on support docs manually, but still duplicate too much of that material in the front door.
3. Describe Fabric as a generic AI terminal tool, which over-triggers against coding assistants, ad hoc LLM CLIs, or workflow automation.
4. Reach for Fabric before the upstream input-cleaning layer is solved, which creates avoidable friction around noisy transcripts, HTML, or provider setup.

## Adjacent Problems
- Boundary drift with general LLM CLIs when users say “CLI prompt tool” without mentioning reusable patterns.
- Boundary drift with coding assistants when users want repo-aware edits after a Fabric transform.
- Boundary drift with workflow automation when Fabric should only be one step in a larger deterministic pipeline.
- Operator friction from provider configuration, pattern discoverability, and server-mode auth assumptions.

## User Voices
- Fabric’s upstream README says the project’s primary value is helping people collect and integrate prompts, called patterns, into real workflows rather than just chatting (`https://raw.githubusercontent.com/danielmiessler/Fabric/main/README.md`).
- The upstream docs explicitly document custom-pattern precedence and update-safe separation from built-in patterns, which reinforces the recurring-workflow boundary (`https://raw.githubusercontent.com/danielmiessler/Fabric/main/README.md`).
- The REST API docs show that server mode is real operator surface area with auth, pattern CRUD, and apply endpoints, so `serve-api` deserves to remain a route rather than a footnote (`https://raw.githubusercontent.com/danielmiessler/Fabric/main/docs/rest-api.md`).
- Recent GitHub issues still cluster around operator friction such as provider/model resolution and server behavior, which argues for concise route-outs plus focused support docs instead of an even larger front door (`https://api.github.com/repos/danielmiessler/Fabric/issues?state=open&per_page=10`).
