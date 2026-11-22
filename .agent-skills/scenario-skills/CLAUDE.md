# AGENTS.md

Guidance for AI agents (and humans) working in this repository. The history and evidence behind its
rules live in [docs/decisions.md](docs/decisions.md).

## What this repo is

Public Agent Skills for [Scenario](https://scenario.com): procedural knowledge that teaches AI
coding agents to create production-ready content through the
[Scenario MCP server](https://mcp.scenario.com). The content spans images, video, audio, textures,
skyboxes, 3D, and custom models, for games, entertainment, and any creative vertical.

- Format: [Agent Skills](https://agentskills.io).
- Install: `npx skills add scenario-labs/skills`.
- Listing: [skills.sh](https://www.skills.sh/scenario-labs/skills).
- The one exception to the MCP focus: the expert tools, teams of skills that drive DCC software and
  game engines installed on the user's machine (see Expert tools).

## Quick start

- `pnpm install`: once after cloning.
- `pnpm format && pnpm validate`: before committing. `format` rewrites files locally; `validate`
  runs the checks CI runs, `format:check` included.
- `pnpm test`: after touching a script.

- `/skills:validate <name>` (`$skills-validate` in Codex): the application test, before merging a
  skill change.

## Layout

```
skills/<name>/SKILL.md                         # name must equal the directory name
skills/<category>/<family>/README.md           # expert tools: the family's build notes
skills/<category>/<family>/<name>/SKILL.md     # expert tools: dcc/ or game-engines/
tests/<name>/                                  # test suite for any script shipped with skill <name>
```

- `scripts/lib/skills.mjs` defines this layout, and every check finds skills through it.
- Skill names are unique repo-wide (`pnpm skill-files` checks). The skills CLI installs every skill
  flat under its name, whatever its folder, and silently keeps only the first of two that share one.
- A supporting file (heavy reference, script) sits next to a SKILL.md only when its content is too
  large to inline.
- Link every supporting file directly from SKILL.md. Agents resolve file references one level deep,
  so a file reached only through another may never be read.
- A skill may carry a `README.md` recording how it was built and why it makes its choices. It is for
  the agents and humans working on the skill, not the agent running it.
  - It is the one supporting file exempt from the link rule (`pnpm skill-files` skips it).
  - Leave it unlinked: linking it spends body words and invites a runtime agent to read maintainer
    notes as instructions, which once made an agent discount a fact it needed.
- Every script shipped with a core skill has a test suite in `tests/<name>/` at the repo root, never
  in the skill directory: a published skill directory carries only what an agent needs at runtime.
  Expert tools test per family instead (see Expert tools). See Validation and testing.

## Public content only

This repository is public. Everything in it, commit messages, PR text, and issue text included, uses
publicly shareable language only.

- Reference only public surfaces: scenario.com, app.scenario.com, help.scenario.com (the Scenario
  Knowledge Base), mcp.scenario.com and its `/docs`, docs.scenario.com, the public model catalog,
  and the Scenario for Blender extension's public repository and releases
  (github.com/scenario-labs/blender-plugin) with its `docs/MCP.md` tool reference and handbook at
  blender.scenario.com.
- Never reference internal repositories, source file paths, internal hostnames or environments,
  internal project or team names, customer names, real team/project/API identifiers, credentials,
  pricing internals, or unreleased features.
- Every fact must be verifiable from public surfaces: the tool reference at
  mcp.scenario.com/docs/tools, the Blender extension's `docs/MCP.md` for its local tools, live
  public catalog searches. A fact knowable only from internal sources stays out.
- In doubt, treat it as internal: ask, or drop it. Example: no internal repository naming.

## Authoring contract

CI enforces the mechanical parts on every push and PR: the spec rules through
[`skills-ref validate`](https://github.com/agentskills/agentskills/tree/main/skills-ref) (the Agent
Skills reference validator), plus house-style greps, prettier, cspell, and supporting-file checks.
Spec-validate one skill with:

```bash
uvx --python 3.12 --from "git+https://github.com/agentskills/agentskills.git#subdirectory=skills-ref" skills-ref validate skills/<name>
```

### Frontmatter and budget

- Published skill frontmatter: `name`, `description`, and `license: MIT`, nothing else. The spec
  caps `name` at 64 characters and `description` at 1024. The other spec-optional fields
  (`compatibility`, `metadata`, `allowed-tools`) are unused here.
- `name`: lowercase letters, numbers, and hyphens, equal to the directory name.
- `description`: third person, starting "Use when". It names triggering conditions only, never a
  summary of the skill's steps. Under 500 characters, rich in keywords an agent would search for.
- Body: 1000 words is the target; the build fails past 2500 (`pnpm style`). Structure: Overview,
  Quick reference, one excellent worked example, Common mistakes.
- Measure before trimming:
  `awk '/^---$/{c++; next} c>=2' skills/<name>/SKILL.md | LC_ALL=C.UTF-8 wc -w` is the exact number
  `pnpm style` checks. The pinned locale makes a local count equal CI's.
- Why a budget: agents load only `name` and `description` at startup. The body enters context only
  when the skill triggers, and then every word competes with the user's task. Spend words on facts
  an agent would otherwise guess wrong, not on prose.
- Why these numbers: after compaction, Claude Code re-attaches the first 5000 tokens of each invoked
  skill from a 25,000-token pool they share. 2500 words is about 4400 tokens, inside that share. The
  cap is the guardrail; the mean protects the pool. The full derivation, and why no line cap, is in
  [docs/decisions.md](docs/decisions.md#word-budget).
- Over budget? Trim first, split last.
  - The body loads on every trigger. A linked file loads only when the agent follows the link.
  - Facts every run needs stay in the body. A linked file holds only situational content: deep
    tables, per-mode detail, scripts.
  - A linked file the agent always reads is a longer body plus a hop.
- Context fan-out: a skill plus the siblings it names is the closest stand-in for one session's
  load, and after compaction they share the re-attach pool. `pnpm style` prints a notice once a
  fan-out approaches it, never a failure, since the total moves when a skill nobody touched grows.
  Answer it by trimming the body or dropping a sibling reference the skill does not need.

### Models and discovery

- Ground every tool and parameter claim in the
  [tool reference](https://mcp.scenario.com/docs/tools).
- Never name a generative model, whoever built it: availability differs per team, and the generation
  named today is superseded within months.
- Name a model id in two cases only:
  - **Platform utility**: Scenario ships exactly one deterministic tool for the operation, and
    nothing third-party does the same job, so discovery would only re-derive the id. These are the
    compositors (`model_scenario-compose-video`, `model_scenario-compose-image`), the timeline tools
    (`model_scenario-video-cut`, `model_scenario-video-split`, `model_scenario-video-concat`,
    `model_scenario-video-to-image-seq`, `model_scenario-image-seq-to-video`), the exact-dimension
    resize tools (`model_scenario-resize-video`, `model_scenario-resize-image`), the audio
    structural tools (`model_scenario-audio-cut`, `model_scenario-audio-split`,
    `model_scenario-audio-extract`), the small image utilities (`model_scenario-grid-maker`,
    `model_scenario-image-slicer`, `model_scenario-padding-remover`), and the
    `model_scenario-postprocessing-*` effects. Say in the body why the id is fixed, so the next
    author does not read it as an oversight.
  - **Dedicated member**: a skill built around one first-party tool model names its id outright
    (scenario-caption-studio runs `model_scenario-caption-studio`). Running that member is the
    skill's whole purpose, so a discovery step would only re-derive the subject. The contested-lane
    test below governs skills reaching the capability, never the skill dedicated to the member.
- Being Scenario's own is necessary, not sufficient:
  - Check the provider first. `modelProvider: "Scenario"` on a `tool`-tagged model is the marker,
    and an upstream vendor there means the operation is a market: the FLUX upscale variants report
    BFL, and upscaling has competitors.
  - Then confirm nothing third-party does the job. These lanes are Scenario-built and still
    contested:
    - reframing and expanding: `model_scenario-smart-reframe` and `model_scenario-gemini-reframe`,
      against Photoroom Expand and Uncrop;
    - splitting an image into layers: `model_scenario-image-layers-extractor`, against Ideogram and
      Seedream;
    - transcription: `model_scenario-audio-to-text`, against Gemini Transcribe;
    - subtitles: `model_scenario-caption-studio` and `model_scenario-video-subtitles`, two Scenario
      tools for one job, so the lane fails the test internally;
    - segmentation: `model_scenario-detection` is unique for ControlNet preprocessor maps, but SAM
      covers object masks.
  - Ids split across `model_scenario-` and `model_sc-`: confirm one against the catalog, never
    reconstruct it.
- Discovery:
  - `recommend` when the skill needs a capability. It takes the capability plus the user's own
    words, ranks members on measured cost and latency, names the purpose-built pick, and warns when
    a generative model is the wrong instrument.
  - `search` when the member is already known by name or is private. It ranks by keyword, and its
    `filters` hold no capability key, so a capability-worded query fails: `query="image edit"`
    returned 318 hits with nothing to choose between them.
  - Lane tables carry capabilities (`img2video`), not query strings.
  - `dry_run` still prices the exact payload: `recommend`'s figures are modeled, and one quoted 48.2
    CU where 55 was billed.
  - Leave the `next_step` discipline to the `scenario` skill and reference it. A worked example runs
    its loop whole: `model_schema_get` before `model_run`, `dry_run` only once inputs exist, jobs in
    flight within the task's count (after a `parallel-custom-jobs` 429, within its `actionLimit`),
    `jobs_wait` until no `pending_job_ids`, a stop on `no_match`.

### Scope and surface

- Model-family skills group one provider family each and carry no version number
  (`scenario-seedance`, never `scenario-seedance-2-5`). A skill name is permanent (installs, README
  rows, `skills.sh.json` groupings, sibling cross-references), while generations churn every few
  months: versions are data, not identity.
  - Version and generation keywords go in the `description` (the seedance one carries "Seedance 2.5
    and 2.0"), so a search for a specific version still triggers the skill.
  - The body teaches per-member differences by reading caps off `model_schema_get`, with
    authoring-time numbers hedged as such.
  - Split a family only when coexisting members target different output types, never by version.
- One skill, one output type: image, video, 3d, or audio.
  - A brand spanning types splits by surface (`scenario-grok-imagine-image` and
    `scenario-grok-imagine-video`, `scenario-luma-image` and `scenario-luma-video`), leaving the
    other type's members to the sibling skill.
  - An intermediate asset of another type inside one pipeline (a skybox still on the way to a splat)
    does not change the skill's type.
- MCP is the surface a skill teaches.
  - Every step the agent performs itself goes through an MCP tool, even one reachable another way.
    Never route it through the Scenario REST API, the official SDK, or a CLI where an MCP tool
    exists.
  - A capability the MCP server does not expose is a gap to report, not one to bridge with an API
    call.
  - Fetching a URL an MCP tool already returned (`asset_download` then `curl -L`) is not an API
    call.
- Scripts are the exception.
  - A script under `skills/<name>/scripts/` may use the official public SDK where it is the better
    tool, whether a maintainer runs it or a skill has an agent run it.
  - The SDK must not become the route the body teaches. Keep the agent's own steps on MCP, and have
    the script's link in SKILL.md say what it does and who runs it, so no agent reads it as the
    steps to follow.
  - `pnpm style` prints a notice, never a failure, when skill markdown mentions the SDK, to prompt
    that judgment.
- Cross-reference the `scenario` skill for connection setup; never repeat it.
- A skill that names a sibling skill carries the sibling-install invitation, byte-identical across
  skills (copy it from any SKILL.md: "If a sibling skill named here is missing from your available
  skills, load it with `skill_get`..."). Neither the Agent Skills spec nor the skills CLI resolves
  dependencies (issue #49 tracks the upstream work), so this sentence is the mechanism. It names no
  install command; `pnpm style` fails on one in a skill
  ([why](docs/decisions.md#no-install-commands-in-skills)).
- Every ask, approval, and paid step says what happens unattended: the task's answer, else a named
  default or stop and report.
  - Unattended, billed work starts only inside a budget or count the task states; otherwise report
    the price and stop.
  - Never claim a confirmation the host or server does not enforce: the agent then spends unasked.
- No disclosure marks: a skill never tells an agent to burn AI-disclosure marks, badges, or
  compliance overlays into generated content, by default or as an option. The skills serve
  professionals who own their distribution compliance; the pipeline does not decide it for them.

## Writing

These rules cover skill bodies and references, scripts, commit messages, PR text, and replies.

- Lead with the instruction or the fact. No preamble, no restating the question, no closing summary.
- One fact per sentence, about 20 words. Past 40, split it or make a list.
- Three or more parallel items make a list. Prefer short bullets to a long sentence.
- Keep the words that carry a condition: only, unless, never, before, after. Terse is not
  telegraphic: drop "only when" and an agent applies the rule everywhere.
- Give a reason only when it prevents a mistake, in one clause. The debate behind a rule goes in the
  skill's `README.md`, in [docs/decisions.md](docs/decisions.md) for this file, or in the PR, not in
  the body.
- Hedge only a fact that changes, like an authoring-time number. State the rest flatly.
- Use one name per thing, from the glossary below.
- Say it once, then stop: noise is paid on every future read. Never spend a paragraph where a clause
  serves, and link to a rule in this file rather than restate it.
- Before cutting a passage as a duplicate, compare the two item by item. Topic overlap is not
  content overlap, and nothing tests whether a fact that used to be present still is.
- Changing a rule: search the skill's folder (and the `scenario` skill, for a shared rule) for the
  topic, and update or delete every other statement of it in the same PR.
- A comment records only what the code cannot say: a constraint, a trap that already bit someone, a
  why not visible in the lines below. Never narrate the next line. A stale comment costs more than a
  missing one.
- No em dashes, ever: use a comma, a colon, parentheses, or two sentences.
- No marketing language.
- Agent-agnostic wording: assume no specific agent outside clearly labeled setup snippets.
- American spelling (color, behavior, center, modeling, optimize). cspell's en-US dictionary accepts
  some British forms, so those are forbidden words, prefixed with `!`, at the top of
  `project-words.txt`. Add a form there when one slips through.
- Tables hold short lookups: a capability against its lane, a parameter against its range. A row
  never wraps (a line break ends it), and prettier pads every row to the widest cell. So one
  sentence in a cell makes every line long, and widening it rewrites every row in the diff. A cell
  that needs a sentence becomes a list item: `- **term**: sentence`.

`pnpm style` prints notices, never failures, for staged skill markdown:

- a table cell past 200 characters, anywhere in a staged file, so old tables convert when next
  edited;
- a sentence past 40 words, on added lines only;
- "workflow" on added lines outside the workflow skills.

Before, one 84-word sentence:

> A reference-audio field is guidance the prompt has to claim: what it conditions (timing and energy
> on one family, a voice on another) and whether it rides alone or needs an image or video reference
> beside it are the family skill's contract, but on every member a track passed silently beside a
> character reference is easily ignored, so the prompt says what the track is for ("the reference
> audio is her own voice, lip-synced" for speech; the beat the cuts land on for music).

After, the same facts:

- Reference audio is guidance the prompt has to claim.
- The family skill says what it conditions (timing and energy, or a voice) and whether it needs an
  image or video reference beside it.
- On every member, a track passed silently beside a character reference is easily ignored.
- So the prompt names the track's job: "the reference audio is her own voice, lip-synced" for
  speech, the beat the cuts land on for music.

### Glossary

| Term          | Means                                                              | Not                              |
| ------------- | ------------------------------------------------------------------ | -------------------------------- |
| skill         | A folder holding a `SKILL.md`, installed by the skills CLI         | workflow, recipe, guide, plugin  |
| sibling skill | Another skill a skill names                                        | dependency (nothing resolves it) |
| workflow      | A Scenario workflow: a node graph run with `workflow_run`          | a skill, or the steps it teaches |
| tool          | An MCP tool: `model_run`, `jobs_wait`                              | a tool model                     |
| tool model    | A `tool`-tagged catalog model, run with `model_run`                | a tool                           |
| member        | One catalog model within a family or capability                    |                                  |
| job           | One run of `model_run` or `workflow_run`, awaited with `jobs_wait` | task, request                    |
| asset         | A file stored in Scenario: an upload or a generated output         | image (when the type varies)     |
| plugin        | One grouping in `.claude-plugin/marketplace.json`                  | a skill                          |

GitHub Actions files under `.github/workflows/` keep their name. For what a skill teaches, say
steps, procedure, or pipeline.

## Expert tools

`skills/dcc/` (ZBrush, Blender, Maya) and `skills/game-engines/` (Unreal Engine, Unity, Godot,
Roblox Studio) hold teams of skills, ported from Emmanuel de Maistre's expert-skill build projects.
They drive applications installed on the user's machine through their Python, bridges, MCP servers,
and command lines.

- Each family is a lead `scenario-<app>-expert` plus specialists named `scenario-<app>-<topic>`. The
  specialists import the lead's `scripts/`, so a family installs as one set.
- The family folder's `README.md` records how the family was built and how far it was verified. It
  sits outside every skill folder, so no install ships it. It carries no version; this repository's
  releases do.
- Before editing anything under `skills/dcc/` or `skills/game-engines/`, read
  [docs/expert-tools.md](docs/expert-tools.md). The authoring contract applies there with
  differences: no MCP rules, longer descriptions and bodies, family-level tests instead of a suite
  per skill, and the expert groupings last.

## Authoring aids

- Two of Anthropic's skills are vendored as dev skills in `.agents/skills/`, symlinked from
  `.claude/skills/`, so agents working in a clone pick them up automatically:
  - [skill-creator](https://www.skills.sh/anthropics/skills/skill-creator) (Apache-2.0, from
    anthropics/skills);
  - [skill-development](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/plugin-dev/skills/skill-development)
    (MIT per the plugin-dev README, vendored from anthropics/claude-code before the plugin moved).
- `skills-lock.json` records each source and hash; refresh with `npx skills update`. Their entries
  there exclude them from CLI discovery. Agent directories alone do not, since the CLI also scans
  `.agents/skills/` and `.claude/skills/`.
- Where their generic guidance and this file disagree, this file wins.
- Repository commands live in `.agents/skills/skills-*/SKILL.md`, with Claude command symlinks under
  `.claude/commands/`. Before adding or editing one, read
  [docs/agent-commands.md](docs/agent-commands.md).

## Repo tooling

### Setup

- `pnpm install` installs commitlint, cspell, prettier, and the husky git hooks.
- The prerequisites are listed in [CONTRIBUTING.md](CONTRIBUTING.md#setup). Without uv, every commit
  fails.
- In Claude Code, a SessionStart hook (`.claude/hooks/ensure-husky.sh`) runs it when the hooks are
  missing.
- In Codex, run `pnpm install --frozen-lockfile` if `node_modules` is missing or
  `git config --local core.hooksPath` is not `.husky/_`. The Claude Code hook does not run there.

### Commits and checks

- Commit messages and PR titles follow Conventional Commits. commitlint (`commitlint.config.js`)
  enforces them in three places: the husky `commit-msg` hook, a commitlint job on PR commits, and
  the `pr-name-linter` workflow on the PR title.
- Valid scopes: the skill directory names (derived from `skills/`) plus `skills`, `agents`, `ci`,
  `deps`, `docs`, and `tooling`.
- The husky `pre-commit` hook runs, in order:
  1. `pnpm words:sort`: sorts `project-words.txt` in place, re-staging it only when it is part of
     the commit.
  2. `pnpm manifest`: regenerates `.claude-plugin/marketplace.json` from `skills.sh.json` and the
     skill folders, and stages the copy rendered from their staged versions, so unstaged moves and
     edits never reach the commit.
  3. `pnpm bugbot`: the same for `.cursor/BUGBOT.md`, a copy of `REVIEW.md`.
  4. `pnpm validate`: the checks CI runs as separate steps, spec validation on staged skills only.
- The husky `post-commit` hook runs `scripts/sync-generated-index.mjs`. A path-limited commit
  (`git commit <paths>`) stages those files in a temporary index, and this step copies them into the
  real one.
- Read [docs/ci-and-releases.md](docs/ci-and-releases.md#checks) when a check fails unexpectedly, or
  before changing a check script, a hook step, or the prettier config. It lists what each check
  covers, the prettier settings, and the git variables a hook step must not leak.

### Formatting and spelling

- Markdown prose wraps at 100 columns. Tables and code never wrap.
- After authoring markdown, run `pnpm format` before `pnpm validate`: prettier reflows prose and
  rewrites tables, so `format:check` rejects correct hand-written markdown.
- Add legitimate project terms to `project-words.txt`; never disable cspell inline. The file stays
  sorted (byte order, deduplicated): the pre-commit hook sorts it, and `pnpm words:sort` does it by
  hand.

### Adding a skill

- List it in a `skills.sh.json` grouping and give it one row in the README Skills section
  (`pnpm groupings` and `pnpm readme` check both).
- A core skill also joins the README default install command, the `INSTALL.md` role it serves (as an
  outcome bullet when it leads one), and any goal it leads or serves. Add any sibling it names that
  a command lacks, then update the "N skills." counts.
- An expert skill joins its family README's install command.
- How skills.sh, the installer picker, and the install commands work:
  [docs/listing-and-install.md](docs/listing-and-install.md).

### Pull requests and releases

- PRs are squash-merged, so the PR title becomes the commit header on `main`: title a new PR with
  it, under 72 characters (commitlint's cap is 120). Shared Scenario PR skills, vendored like the
  Anthropic dev skills (pinned in `skills-lock.json`, never edited here, refreshed with
  `npx skills update`), handle the routine:
  - `/pr-squash-message` drafts the squash message;
  - `/pr-summary` refreshes the PR body;
  - `/pr-handle-comments` answers review threads.
- `/skills:pr-handle <PR>` (`.claude/commands/skills/`) handles a whole PR: it adds the fork
  quarantine, the discovery and script audits, and the validation decision to `/pr-handle-comments`.
- A PR body follows the template, "What and why" in two sentences at most. It links the report
  `/skills:validate` posts as a PR comment.
- Update a pushed PR branch by merging its base into it. Never rebase or force-push a pushed branch.
- A branch built on an open PR's branch targets that branch, never `main`, and its body names the
  parent. After the parent lands, merge `main` into it.
- release-please cuts releases (`.github/workflows/release-please.yml`, configured in
  `release-please-config.json`).
  - feat, fix, docs, perf, and revert commits squash-merged to `main` land in the next release,
    which release-please stages as an open release PR.
  - Every other Conventional Commits type is invisible to the changelog: chore and ci by design, but
    also refactor, test, style, and build. A release window holding only those cuts no release at
    all, so a change to shipped skill content must be typed feat, fix, or docs.
- release-please owns `CHANGELOG.md`, `version.txt`, and `.release-please-manifest.json`, like the
  marketplace manifest: never hand-edit them.
- Forcing a version, the tag format, the changelog post, and Dependabot:
  [docs/ci-and-releases.md](docs/ci-and-releases.md).

### CI and review agents

- Every `uses:` in `.github/workflows/` names a full commit SHA with the release in a trailing
  comment (`actions/checkout@<sha> # v7.0.1`), never a tag: a tag is a pointer its publisher can
  move.
- The `skill-files-reviewer` agent (`.claude/agents/`) reviews supporting files added or changed
  next to a SKILL.md, core or expert: justified, linked from SKILL.md, runnable, MCP for the agent's
  own steps (core skills only), text that matches the code, gates that fail closed, public content
  only, house style.
- The `skill-tester` agent in the same directory is the clean-room runner `/skills:validate` spawns
  when a separate process cannot reach the MCP server. It is not for ordinary work.

### Review guidelines

Follow [REVIEW.md](REVIEW.md): what is Important, how to report, and what not to report. Edit it,
never its copy `.cursor/BUGBOT.md`.

## Validation and testing

- `skills-ref validate` must pass for every published skill: CI runs it on every skill via
  `pnpm spec`, the pre-commit hook on the skills a commit changes.
- Python suites use stdlib `unittest` (`test_*.py`), TypeScript ones vitest (`*.test.ts`).
- Unless the user asks, a shipped script never overwrites a file it did not create (its inputs, a
  project file, the user's saved scene) and keeps the user's document open. It writes a new file or
  folder; its suite tests that.
- Scripts run on macOS, Linux, and Windows unless the skill names an OS: text opened as UTF-8, a
  fallback for every POSIX-only call, shell under Bash 3.2, the oldest Python documented for it.
- `pnpm test` runs every suite and fails when a core skill's script has no suite; CI runs it on
  every push and PR, on two ffmpeg versions ([docs/ci-and-releases.md](docs/ci-and-releases.md#ci)).
  It is not in the pre-commit hook, since suites may need system tools such as ffmpeg.
- A `tests/<name>/requirements.txt` declares extra Python dependencies.
  - Locally, `pnpm test` runs that suite under uv with them on Python 3.12, CI's version, and falls
    back to the bare `python3` only when uv is missing.
  - CI installs only hashed locks: after changing a suite's requirements, regenerate the locks
    covering it ([docs/ci-and-releases.md](docs/ci-and-releases.md#ci)).
- `pnpm test` runs the command, plugin-manifest, Bugbot-copy, index-sync, style, hook, readme, and
  test-runner regression suites as well as the shipped-script suites.
- `pnpm test:coverage` runs the shipped-script suites with line coverage of core skills, report only
  ([docs/ci-and-releases.md](docs/ci-and-releases.md#ci)).
- Before merging a new or changed skill, run the application test. Mechanical validation checks the
  format; the application test checks whether the skill actually teaches. When it may be skipped:
  [docs/application-test.md](docs/application-test.md#when-to-run-it).
- `/skills:validate <name>` (`.claude/commands/skills/`) drives that test:
  - it writes a use case for the skill;
  - installs the working-tree copy into a clean-room agent with no repository context;
  - runs it end to end against the real MCP server, in a team and project you choose;
  - grades the transcript;
  - posts the report to the current branch's PR, or asks what to do with it when there is none.
  - `--plan-only` runs the zero-cost planning variant of the protocol instead of live generation.
- Before running or grading an application test, read
  [docs/application-test.md](docs/application-test.md): the protocol, plus the rules learned from
  past runs (MCP argument traps, `usage` and CU attribution, video checks, paid-run discipline).

## Codex commit attribution

- For Codex-assisted commits and prepared squash messages, add a co-author trailer naming the model
  and, when verified, the reasoning effort and speed tier:
  `Co-authored-by: Codex <model> <effort> <tier> <noreply@openai.com>`. Example:
  `Co-authored-by: Codex gpt-6-astra low fast <noreply@openai.com>`.
- Use the contributing session's actual settings, not repository defaults or the example.
- Omit unknown fields rather than guess. If the model is unavailable, use
  `Co-authored-by: Codex <noreply@openai.com>`.
- Preserve the human author and existing contributor trailers, and carry these trailers into the
  final squash message so attribution survives squash merges.

## Conventions

- PRs target `main`, unless stacked; see Repo tooling.
- `CLAUDE.md` is a symlink to this file, so Claude Code and Codex read the same conventions.
- This file stays under 32 KiB, all Codex reads by default (`pnpm style` fails past it, and prints a
  notice past 30 KiB). Content only some tasks need goes in `docs/`, behind a pointer saying when to
  read it.
- Shared Codex defaults live in `.codex/config.toml`; model selection stays in user configuration.
