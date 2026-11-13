# Pinned upstream operations

## Identity, layout and license

- Repository: <https://github.com/donchitos/claude-code-game-studios>
- Inspected commit: `abc0de79d6ceb0b5d7aa693945849b3937afbe6a`.
- Inventory observed from that checkout: 78 `.claude/skills/*/SKILL.md` files,
  consisting of 75 canonical workflows and three aliases; 49 `.claude/agents/**/*.md`
  files. Counts describe this snapshot, not future upstream releases.
- License: [MIT](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/LICENSE),
  Copyright (c) 2026 Donchitos. This package is an original operator guide, not a
  vendored copy of the template. Retain upstream copyright and permission notices
  when copying or distributing the template; generated games and imported assets
  still need their own rights review.

The selected-file helper manifest has twelve public files. It is intentionally not
an exhaustive dependency closure. `runtime_verified=false` is never upgraded by a
hash match. Do not execute unlisted scripts merely because selected files matched.

## First setup: source retrieval is not activation

Choose a new, approved, nonexistent target directory outside another game project.
After approval for network retrieval and local writes, the source-selection sequence is:

```bash
git clone --no-checkout https://github.com/donchitos/claude-code-game-studios.git my-game
git -C my-game -c core.hooksPath=/dev/null checkout --detach abc0de79d6ceb0b5d7aa693945849b3937afbe6a
git -C my-game rev-parse HEAD
```

This sequence is documentation, not an automatic installer. Check Git configuration
and any local checkout/filter behavior before running it in a customized environment.
Inspect `README.md`, `CLAUDE.md`, `project.yaml`, `.claude/settings.json`, hook scripts
and the relevant skill/references **before** launching Claude Code in `my-game`.
Opening a project session is a distinct activation step; the pinned settings register
shell hooks and permission rules. Do not launch Claude just to check whether it is
installed. The offline helper discovers `claude`, `git`, `python3`, `bash`, `node`,
`jq`, `godot`, and `skillevaluator` without invoking them; discovery is not readiness.

The template's README says to start Claude Code at the project root, not `src/`, so
its hooks, deny rules and ask-first mode have the expected scope. Review the
settings rather than treating those rules as a security boundary or a sandbox.

## Existing-project adoption

Do not copy the template over an existing `.claude/`, `CLAUDE.md`, `project.yaml`,
source tree or test tree. Inventory both layouts, resolve filename/permission
collisions, and preview a file-by-file merge. `/adopt` is an audit and migration-plan
workflow inside an already reviewed upstream environment, not a safe installer.
Its references inspect artifacts, classify gaps, ask before writing the plan and
avoid regenerating existing content. Keep `UPGRADING.md` for version migrations.

The pinned skill headers can execute `yaml-helper.sh resolve_config` via Claude
Code's inline shell expansion. Merely loading one is not equivalent to reading an
inert standalone Markdown file. Dependencies include:

- `.claude/hooks/` (configuration and event hooks), `.claude/scripts/` (helpers).
- `.claude/genres/`, `.claude/engines/engines.tsv`, `.claude/docs/` and templates.
- `project.yaml`, optional personal `project.local.yaml`, design/production/docs
  artifacts and `studio-tests/`.
- Each skill's `references/` phase files. Read the phase that is actually selected,
  not an imagined abbreviated procedure.

Other hosts need an explicit adaptation of Claude tools, shell expansion, hooks and
permissions. Installing this operator skill is cross-host documentation access,
not proof the upstream workflows execute on that host.

## Choose a route

| Request | Entry / behavior |
| --- | --- |
| Where do I start? | `/start` routes based on state; `/next-step` names a next action |
| New playable idea | `/prototype <idea>`; no engine defaults to browser-first |
| Existing browser game | `/prototype --from <path>` imports a copy; preserve the original |
| Explicit engine spike | `/prototype --path engine` or `--path paper`; read its phase files |
| Pin an engine | `/setup-engine <engine> <version>`; review engine/tool installs separately |
| Audit existing artifacts | `/adopt` (full/gdds/adrs/stories/infra); plan before any migration |
| Inspect config | `/project-settings`; `--local` targets personal overrides |
| Test a workflow | `/skill-test static <name>`, `spec <name>`, `category <name>`, or `audit` |
| Propose an improvement | `/skill-improve <name>`; preserve baseline and review diffs |

### Config and engine boundaries

`project.yaml` is shared configuration. `modes.rigor` is `minimal` (default),
`standard` or `full`, bundling six process controls. `modes.automation` is separate;
personal `project.local.yaml` can override selected settings. Do not silently raise
rigor or automation to get more impressive-looking output.

The engine table records Godot `src` / `tests`, Unity `Assets` / `Assets/Tests`,
Unreal `Source` / `Source/<Module>/Private/Tests`, Web `src` / `tests`. These are
configuration defaults, not permission to move existing code. Web defaults include
`npm run build`, `npm test`, `npm run smoke`; Unity and Unreal rows contain unset
commands (`-`). Never invent a passing engine command where one is not configured.
Godot commands depend on the project and gdUnit4; do not assume the test addon is
installed from the presence of a table row.

### Prototype evidence

The browser route asks questions, creates a brief for approval, builds and checks
it, and hands it over for a human verdict. The source explicitly allows NOT
ASSESSED and distinguishes a browser smoke from human play. Preserve “Not yet
played by a person” until that changes. The engine/paper route and grow-to-project
route have different code reuse contracts; follow their actual references rather
than imposing the engine throwaway rule on browser growth.

### Compatibility names

| Old name | Canonical workflow |
| --- | --- |
| `/help` | `/next-step` |
| `/settings` | `/project-settings` |
| `/changelog` | `/write-changelog` |

These wrappers emit a rename line and forward `$ARGUMENTS` unchanged through the
`Skill` tool. They are explicitly not model-invoked. Do not merge their bodies into
the canonical workflows or inflate them with duplicated tutorials.

## Testing and improvement

`studio-tests/README.md` documents four `/skill-test` modes:

- `static` reads structural observations (seven skill checks, not game tests).
- `spec` compares against the selected behavioral specification.
- `category` uses `studio-tests/quality-rubric.md`.
- `audit` reports catalog coverage; missing coverage is not a pass.

Removing `studio-tests/` breaks spec/category and degrades audit/improvement.
After reviewing the script and approving execution, the observation helper is:

```bash
# In the upstream project root, not this guide's directory:
bash .claude/scripts/skill-lint.sh prototype --root /absolute/path/to/my-game
# all observes every discovered skill folder, including compatibility names.
bash .claude/scripts/skill-lint.sh all --root /absolute/path/to/my-game
```

It returns TSV facts, not a PASS/FAIL verdict. Do not treat exit 0 as a behavioral
pass. Its `--help` comment describes exits 0 done, 1 missing root/skills, 2 usage,
3 unknown skill. No upstream script execution is necessary for this guide's
selected-file preflight, and none is claimed by packaging it.

For NVIDIA commands, use `nvidia-skill-evaluator` and its matching approvals. The
historic baseline was the keyless `quality-check` lane only. `--no-llm` on Tier 1
is not a no-network guarantee; scanner downloads, dependency audits, Tier 2 egress,
Tier 3 execution and CI publishing need separate review. Never turn publication
`incomplete` into `pass`.

## Package verification versus behavior

From the jeo-skills repository root:

```bash
python3 -B scripts/test_donchitos_game_studios.py -v
bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/donchitos-game-studios
python3 scripts/validate-catalog-projections.py
```

Tests exercise the offline helper and package contracts with synthetic public data;
they do not run the template's skills, hooks or games. `evals/evals.json` supplies
routing/error/authority cases for future fresh-context paired model runs. Track
those runs separately, with model, tools, permissions, network, task, token/time
cost and human review fixed or reported.
