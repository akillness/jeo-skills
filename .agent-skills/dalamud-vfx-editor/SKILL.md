---
name: dalamud-vfx-editor
description: >
  Install, operate, and troubleshoot 0ceal0t/Dalamud-VFXEditor for user-owned
  Final Fantasy XIV visual-effect, animation, sound, physics, UI, texture,
  material, model, and shader files. Use when a user asks about `/vfxedit`, AVFX,
  PAP, TMB, SCD, Dalamud plugin setup, effect replacement, export handoff, beta
  repositories, or VFXEditor source builds. Triggers on: Dalamud VFXEditor,
  /vfxedit, .avfx, .pap, .tmb, .scd, FFXIV VFX mod, or VFXEditor beta.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: FFXIV with XIVLauncher/Dalamud for plugin use; .NET and Dalamud development environment for source builds
metadata:
  tags: game-development, ffxiv, dalamud, vfx, modding, asset-editor
  version: "1.0.0"
  source: https://github.com/0ceal0t/Dalamud-VFXEditor
---

# Dalamud VFXEditor

## When to use this skill

- Install the main plugin from `/xlplugins` or configure the beta repository.
- Identify which FFXIV file type owns an effect, animation, timeline, sound, or material change.
- Replace and edit an effect while preserving a rollback copy.
- Inspect plugin release metadata or contribute to the C# source.

Use only on user-owned local files and authorized modding workflows. Do not use this skill to bypass service controls, distribute copyrighted game assets, or interfere with other players.

## Instructions

### Step 1: Pick the operating lane

1. **Main plugin install** — XIVLauncher → `/xlplugins` → VFXEditor → `/vfxedit`.
2. **Beta plugin** — add the upstream `repo.json` URL in `/xlsettings > Experimental`, enable only one of main/beta, then use `/vfxbeta`.
3. **Asset edit** — identify the owning file type, snapshot the source, edit a loaded replacement, update, test, and retain rollback evidence.
4. **Source contribution** — clone a pinned commit, restore/build the `VFXEditor.csproj`, and follow current Dalamud SDK requirements.

### Step 2: Identify the owning file type

Use `references/file-types-and-workflow.md`. Common choices:

- `.avfx` — particles and glow without character motion;
- `.pap` — character animation;
- `.tmb` — timeline triggers for effects, animation, and sound;
- `.scd` — music and sound effects;
- `.atex` / `.tex` — effect/UI/model textures;
- `.shpk` / `.shcd` — shader packages and individual shaders;
- `.mtrl` / `.mdl` — materials and meshes.

If the user only wants to hide selected effects, route to the upstream author's EasyEyes recommendation rather than constructing a replacement.

### Step 3: Snapshot before editing

```bash
python3 .agent-skills/dalamud-vfx-editor/scripts/snapshot_asset.py \
  /path/to/effect.avfx --output-dir ./vfx-backups
```

The script copies bytes unchanged and writes a SHA-256 manifest. Keep the original, working copy, exported replacement, and test result separate.

### Step 4: Perform the smallest edit

In VFXEditor:

1. select **Loaded Vfx** as the new source;
2. select **Vfx Being Replaced** as the target;
3. change only the intended parameters;
4. press **UPDATE**;
5. test in a controlled local scenario;
6. revert immediately if timing, attachment, visibility, sound, or performance is wrong.

For complete skill replacement, inspect the `.tmb` timeline rather than forcing every change into `.avfx`.

### Step 5: Inspect release metadata when using beta builds

```bash
python3 .agent-skills/dalamud-vfx-editor/scripts/inspect_repo_manifest.py repo.json --json
```

Confirm internal name, assembly version, Dalamud API level, repository URL, and download links. Main and beta builds cannot be enabled together.

### Step 6: Build source only in a compatible environment

The inspected project uses `Dalamud.NET.Sdk/15.0.0`, locked NuGet packages, and `Debug`, `Release`, and `Beta` configurations. Do not promise a successful build without a compatible Dalamud development installation. Prefer:

```bash
dotnet restore VFXEditor/VFXEditor.csproj --locked-mode
dotnet build VFXEditor/VFXEditor.csproj -c Debug --no-restore
```

Use the current upstream files as authority because Dalamud APIs and package versions change.

### Step 7: Verify and hand off

Report source hash, edited file type, target path, change summary, plugin channel, game/Dalamud versions, test scenario, observed result, and rollback path. Never package unmodified game assets into the skill or repository.

## Examples

### Inspect the official beta manifest

```bash
curl -fsSLO https://raw.githubusercontent.com/0ceal0t/Dalamud-VFXEditor/main/repo.json
python3 .agent-skills/dalamud-vfx-editor/scripts/inspect_repo_manifest.py repo.json
```

### Back up a timeline before replacement

```bash
python3 .agent-skills/dalamud-vfx-editor/scripts/snapshot_asset.py action.tmb
```

## Best practices

1. Snapshot every source asset and record hashes.
2. Change one layer or parameter group at a time.
3. Keep main and beta plugin channels mutually exclusive.
4. Test attachment, timing, visibility, sound, and frame-time impact.
5. Share patches or authored assets, not copyrighted game data.

## References

- `references/file-types-and-workflow.md` — file ownership and edit checklist.
- `references/upstream.md` — installation, build metadata, revision, and license.
- [Dalamud VFXEditor](https://github.com/0ceal0t/Dalamud-VFXEditor)
- [Upstream guides](https://github.com/0ceal0t/Dalamud-VFXEditor/wiki)
