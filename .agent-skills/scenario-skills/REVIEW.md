# Review instructions

This repository publishes Agent Skills: Markdown that teaches AI agents to use the Scenario MCP
server, plus the scripts some skills ship. The rules live in `AGENTS.md`. This file says what to
report and at what severity, in text that reads alone: Cursor Bugbot gets it as `.cursor/BUGBOT.md`,
a copy the pre-commit hook writes, and follows no link.

## Important

Report these as Important:

- A crash or wrong result on a reachable path: a script, a check, a hook, a GitHub Actions workflow.
- A public-content leak: an internal repository, hostname, team, project, or customer name, an
  unreleased feature, a credential, a token, a signed asset URL (`AGENTS.md` "Public content only").
- A tool, parameter, field, or capability name absent from the tool reference,
  mcp.scenario.com/docs/tools (`AGENTS.md` "Models and discovery").
- A worked example that breaks the `scenario` skill's job loop: `model_schema_get` before
  `model_run`, `dry_run` only once inputs exist, at most `actionLimit` jobs in flight, `jobs_wait`
  until no `pending_job_ids`, a stop on `no_match` (`AGENTS.md` "Models and discovery").
- An ask, approval, or paid step that does not say what happens unattended, or billed work that
  starts unattended outside a budget or count the task states (`AGENTS.md` "Scope and surface").
- Text that contradicts the code it describes: a flag, default, path, or behavior the shipped script
  does not have.
- Two files of one skill, or a skill and the `scenario` skill, stating one fact differently.
- A gate or check that passes on what it cannot read: a missing file, a failed parse, an empty
  match.
- A shipped script that overwrites a file it did not create (its inputs, a project file, the user's
  saved scene) unless the user asks (`AGENTS.md` "Validation and testing").

The tool-reference and job-loop items cover core skills only. Expert tools, under `skills/dcc/` and
`skills/game-engines/`, drive local applications and follow `docs/expert-tools.md`.

Everything else is a Nit: wording, style, structure, refactoring.

## How to report

- Cite the `AGENTS.md` section behind a finding only when one applies. Never invent a rule.
- Verify a concern in the diff or the repository before reporting it, or leave it out.
- Behavior the PR description or a linked issue declares intended is not a Nit. Report an Important
  finding anyway: agents write most descriptions.
- A suggested addition to a `SKILL.md` must fit its body budget, 2,500 words at most. When the body
  is near the cap, say what to cut.

## Do not report

- What CI enforces: formatting, spelling, em dashes, frontmatter fields, the body word cap, links.
- A request to restate what the `scenario` skill owns, such as connection setup or the job loop's
  details. Skills reference it on purpose.
- A request to name a generative model, a model version, or a brand alias for one. Skills discover
  models at runtime (`AGENTS.md` "Models and discovery"). The fixed `model_scenario-*` utility ids
  that section lists are allowed.
- A wrong-arguments finding on a call into a test suite's `helpers.py`. Each suite in
  `tests/<name>/` runs alone (`unittest discover -s`), so `import helpers` loads that suite's file,
  never another suite's file of the same name.
- Generated or vendored files: `.claude-plugin/marketplace.json`, `.cursor/BUGBOT.md`,
  `CHANGELOG.md`, `version.txt`, `.release-please-manifest.json`, `pnpm-lock.yaml`,
  `skills-lock.json`, and the vendored skills in `.agents/skills/` (skill-creator,
  skill-development, pr-summary, pr-squash-message, pr-handle-comments).
