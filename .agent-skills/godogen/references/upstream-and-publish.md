# Godogen upstream and publish contract

## Pinned source

This reference was verified against:

- repository: `https://github.com/htdt/godogen`
- commit: `05cebffc8b10c5817e8a3db495b82e7b6004ab84`
- commit date: 2026-07-02
- default branch at verification: `master`
- license: MIT

Durable URLs:

- [README](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/README.md)
- [publish.sh](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/publish.sh)
- [runtime manifest](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/prompts/runtime.md)
- [changelog](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/CHANGELOG.md)
- [contributing](https://github.com/htdt/godogen/blob/05cebffc8b10c5817e8a3db495b82e7b6004ab84/CONTRIBUTING.md)

Re-read upstream before treating this pin as the latest release. Use the pin when a
repeatable publication matters.

## Current architecture

Godogen is a publish-time source repository, not a generated game and not a globally
installed CLI:

```text
godogen source -> game repo -> game
```

The 2026-07-02 docs-only runtime intentionally removed the old planner, decomposer,
architecture, scene, scaffold, quirks, capture, `godot-api`, `bevy-help`,
`babylon-help`, Vite-scaffold, and hook pipeline. Current publication contains only:

1. one agent manifest rendered from `prompts/runtime.md`;
2. one literal engine guide from `engines/`;
3. the cross-engine `asset-gen` skill;
4. an engine/agent-specific `.gitignore` when the target has none;
5. a Git repository initialized with `git init`.

Do not reconstruct the removed pipeline from stale articles or pre-July commits.

## Command surface

```bash
./publish.sh --engine godot|bevy|babylon \
  --agent claude|codex \
  --out <target-directory> \
  [--force]
```

The target may also be the final positional argument instead of `--out`. Unknown engines,
agents, or options fail. The output target is required.

## Rendered layouts

### Claude Code

```text
<target>/
  CLAUDE.md
  godot.md | bevy.md | babylon.md
  .claude/
    skills/
      asset-gen/
        SKILL.md
        rembg.md
        tools/
  .gitignore          # created only when absent
  .git/               # initialized by publish.sh
```

Template values:

- `AGENT_NAME=Claude`
- `ASSET_SKILL_COMMAND=/asset-gen`
- `ASSET_GEN_SKILL_DIR=.claude/skills/asset-gen`

### Codex

```text
<target>/
  AGENTS.md
  godot.md | bevy.md | babylon.md
  .agents/
    skills/
      asset-gen/
        SKILL.md
        rembg.md
        tools/
        agents/openai.yaml
  .gitignore          # created only when absent
  .git/               # initialized by publish.sh
```

Template values:

- `AGENT_NAME=Codex`
- `ASSET_SKILL_COMMAND=$asset-gen`
- `ASSET_GEN_SKILL_DIR=.agents/skills/asset-gen`

The generated `agents/openai.yaml` is produced by
`scripts/generate_codex_metadata.py` after template rendering.

### Engine-specific values

| Engine | Display name | Guide | Runtime asset directory |
|---|---|---|---|
| `godot` | Godot | `godot.md` | `assets` |
| `bevy` | Bevy | `bevy.md` | `assets` |
| `babylon` | Babylon.js | `babylon.md` | `src/assets` |

## Destructive behavior

### `--force` removes the whole resolved target

At the pinned commit, `--force` executes the equivalent of:

```bash
rm -rf "${TARGET:?}"
mkdir -p "$TARGET"
```

The `${TARGET:?}` guard catches an empty shell variable, but it does not prove the target
is disposable. Resolve the intended path, display it, and get explicit approval before a
forced publish. Prefer a new target path.

### A normal publish can remove unrelated skills

Publication stages only `asset-gen` and then synchronizes it with:

```bash
rsync -a --delete "$TMP/skills/" "$TARGET/$SKILLS_DIR_REL/"
```

Because `--delete` applies to the entire destination skills directory, existing sibling
skills under `.claude/skills/` or `.agents/skills/` can be removed even without
`--force`. This is why the supported default is a fresh game repository.

Run the bundled read-only gate before publication:

```bash
bash .agent-skills/godogen/scripts/godogen.sh plan \
  --engine godot --agent claude --out /path/to/new-game
```

A blocked result means choose another directory. Do not bypass the check by deleting
unknown files.

### Narrow safe refresh

A normal re-publish can refresh a prior Godogen runtime without deleting the game when all
of these are true for the selected lane:

- the selected `CLAUDE.md` or `AGENTS.md` is a rendered Godogen manifest;
- the selected `godot.md`, `bevy.md`, or `babylon.md` exists;
- the selected `.claude/skills/` or `.agents/skills/` contains only `asset-gen`;
- the game repository is committed or backed up before the refresh.

The bundled `plan` helper recognizes this exact shape and returns success with a refresh
warning. Run normal `publish.sh` without `--force`, then review the Git diff. The manifest,
selected engine guide, and `asset-gen` are regenerated; root gameplay files are preserved and
an existing `.gitignore` is left untouched. If the markers do not match or a sibling skill is
present, the helper blocks the target and the safe path is a new directory.

Never use `--force` as an update shortcut. It removes the game before republishing the runtime.

## `.gitignore` behavior

Godogen writes `.gitignore` only when one does not exist. The generated file ignores the
published instruction surfaces plus lane-specific generated content:

- Claude: `.claude`, `CLAUDE.md`
- Codex: `.agents`, `AGENTS.md`, `.codex`
- every lane: its engine guide filename
- Godot: `assets`, `screenshots`, `.godot`, `*.import`, `bin/`, `obj/`
- Bevy: `/target`, `/screenshots`
- Babylon: `/node_modules`, `/dist`, `/screenshots`

If a target already has `.gitignore`, Godogen preserves it and does not merge these rules.
Inspect the result instead of assuming the generated files are ignored.

## Post-publish inspection

After a user-approved publish:

```bash
find <target> -maxdepth 4 -type f | sort
git -C <target> status --short --branch
```

Verify:

- the correct manifest exists for the selected agent;
- exactly one selected engine guide exists;
- `asset-gen` rendered the correct skill command and runtime asset directory;
- Codex metadata exists for a Codex publication;
- no pre-existing target file or sibling skill disappeared unexpectedly;
- `.gitignore` matches the target's policy;
- a refresh diff contains only the intended regenerated runtime files.

Do not call a successful `publish.sh` run a successful game build. Publication only creates
the runtime instructions.

## Contribution contract

Upstream requires an approved issue before a pull request. A useful issue states:

- what should change;
- why it measurably improves autonomous game output;
- evidence such as failed runs, logs, or before/after media;
- why a simpler change is insufficient.

Keep changes narrow. If a skill changes, upstream asks for an end-to-end pipeline test and
its output or summary.
