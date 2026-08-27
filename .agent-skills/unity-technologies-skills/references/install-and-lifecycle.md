# Installation and lifecycle

## Installation authority

Upstream documents the moving-main shortcut:

```bash
npx skills add Unity-Technologies/skills
```

That is convenient but not reproducible and may prompt for broad installation.
For agent-managed work, inspect and pin first.

At the 2026-08-27 audit, Agent Skills CLI 1.5.23 supported `--list`, repeated
`--skill`, `--copy`, `--full-depth`, global/project scopes, explicit agents,
updates, and removes. Re-read `npx --yes skills@1.5.23 add --help` when changing
the CLI version.

## Pinned checkout

```bash
UPSTREAM="$HOME/.local/share/unity-technologies-skills"
if [ -e "$UPSTREAM" ]; then
  printf 'checkout exists; inspect it, do not overwrite: %s\n' "$UPSTREAM"
else
  git clone --filter=blob:none --no-checkout \
    https://github.com/Unity-Technologies/skills.git "$UPSTREAM"
fi

git -C "$UPSTREAM" fetch --depth 1 origin \
  87fac23d66a1f44f5e06c2935eccce0b40b9715a
git -C "$UPSTREAM" checkout --detach \
  87fac23d66a1f44f5e06c2935eccce0b40b9715a
```

Cloning and checkout write to disk, so run them only after the user selected
this upstream and target location. The bundled audit script does not clone or
fetch.

## Read-only audit and inventory

```bash
python3 <installed-skill>/scripts/audit-pack.py doctor \
  --repo "$UPSTREAM" \
  --expect-commit 87fac23d66a1f44f5e06c2935eccce0b40b9715a \
  --format json

python3 <installed-skill>/scripts/audit-pack.py inventory \
  --repo "$UPSTREAM" --format json

npx --yes skills@1.5.23 add "$UPSTREAM" --list --full-depth
```

At the pin, the first command reports 22 directories, 21 valid frontmatter
documents, one invalid `physics-3d-collision`, and a README inventory of 13.
The Agent Skills CLI independently reports 21 available skills and skips the
same invalid document.

## Destination preview

Use the actual target used by the agent host:

```bash
python3 <installed-skill>/scripts/audit-pack.py plan \
  --repo "$UPSTREAM" \
  --target "$HOME/.agents/skills" \
  --skill ui \
  --skill ui-uitk \
  --format json
```

The helper does not create the target or copy anything. Exit code 0 with
`READY` means every selected directory exists, has safe-enough frontmatter for
the limited parser, and has no same-name destination. Exit code 2 means
`BLOCKED` due to a collision or invalid selected frontmatter.

## Selective install

```bash
npx --yes skills@1.5.23 add "$UPSTREAM" \
  --skill ui ui-uitk \
  --global --agent universal --yes --copy --full-depth
```

Use the agent ID that the real host supports. `universal` is a jeo-skills
shared-root convention, not a universal upstream fact. Omit `--yes` when a
human should review the CLI's own prompt.

Prefer `--copy` when the installed instructions must remain stable even if the
checkout later moves. A symlink to a moving branch changes agent behavior after
`git pull`. If links are used, pin the checkout to a detached commit and record
it next to the installation.

## Known collisions and blockers

| Name | Why it matters | Default response |
|---|---|---|
| `unity-cli` | jeo-skills already has a local skill with this name and a different source contract | do not overwrite; compare and choose isolated target or reviewed replacement |
| `physics-3d-collision` | invalid YAML description at the audited upstream pin | do not claim it installed; wait for upstream fix or make a separately reviewed patch |

A full bundle plan is expected to block in a normal jeo-skills target because
of both conditions.

## Refresh

1. Keep the currently installed commit and file hashes.
2. Fetch a candidate commit without changing the installed target.
3. Run `doctor`, `inventory`, and `plan` against the candidate.
4. Diff only selected skill folders, including support files.
5. Review license, new scripts, new network/service commands, frontmatter, and
   minimum Unity/SDK versions.
6. Obtain approval for replacements.
7. Re-run the selective install and byte verification.

Do not run blanket `skills update` when locally customized or colliding skill
names exist.

## Removal and rollback

Use the Agent Skills CLI's remove command only after listing the exact scope:

```bash
npx --yes skills@1.5.23 list --global --json
npx --yes skills@1.5.23 remove --global --skill ui ui-uitk
```

Before removal, confirm whether the destination is a copy, symlink, shared
root, or project-local install. Removing instructions does not revert Unity
project changes, installed Editors, packages, cloud deployments, billing
configuration, or licenses. Those require separate product-specific rollback.
