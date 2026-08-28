---
name: higgsfield-game-generation
description: >
  Audit and operate Higgsfield's current browser-game workflow without trusting
  stale skill names or retired CLI commands. Use when the user names Higgsfield
  Games, higgsfield-game-generation, Higgsfield MCP game generation, the
  `higgsfield website create --type game` flow, Higgsfield game assets, realtime
  rooms, game deploy, or marketplace publication. Verify the live upstream owner,
  CLI, auth, category, subdomain, local scaffold contract, tests, credit boundary,
  and deploy/publish state before acting. Treat CLI installation, authentication,
  paid generation, project creation, secret changes, public deploy, and marketplace
  publish as separate approvals. Route provider-neutral browser games to
  `web-game-development` and multiplayer authority design to
  `multiplayer-game-architecture`.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Requires the user-owned Higgsfield CLI and account only for live operations. The
  bundled audit helper is read-only, Python 3.9-compatible, and uses the standard
  library plus optional read-only Git commands.
metadata:
  version: "1.0"
  source: https://github.com/higgsfield-ai/skills
---

# Higgsfield Game Generation

Use this as a drift-aware compatibility front door. At the audited upstream commit,
`INSTALL.md` advertises a separate `higgsfield-game-generation` skill, but that folder is
absent from the tree and the live game contract is owned by `higgsfield-websites` with
`--type game`. Re-audit before every install or operation instead of assuming either shape.

## When to use this skill

Use it to:

- verify which upstream Higgsfield skill currently owns game creation;
- plan or create a Higgsfield-hosted browser game;
- inspect or edit a generated game scaffold;
- route game-specific 2D, 3D, texture, animation, music, or SFX assets;
- test local game logic and room behavior;
- prepare a public deploy or optional marketplace publication;
- diagnose stale `higgsfield game` examples, missing skill folders, or CLI drift.

Do not use it for a provider-neutral browser game, a local Unity or Unreal project, generic
media generation, or multiplayer architecture alone. Route those to
`web-game-development`, `unity-technologies-skills`, `higgsfield-generate`, or
`multiplayer-game-architecture` respectively.

## Instructions

### 1. Choose one mode

Pick exactly one primary mode:

1. `audit-owner`: inspect the current upstream tree and local installation;
2. `plan-game`: freeze the game and side-effect contract without creating anything;
3. `create-edit`: create or edit one game after approval;
4. `test`: run local logic/build/room checks without deploying;
5. `deploy`: ship the current build to its public Higgsfield URL;
6. `publish`: list an already deployed game in the community marketplace;
7. `troubleshoot`: resolve CLI, auth, scaffold, build, room, or drift failures.

Never combine installation, authentication, paid generation, creation, deploy, and publish
into one implicit approval.

### 2. Audit the current owner

From the `jeo-skills` repository root, run:

```bash
python3 .agent-skills/higgsfield-game-generation/scripts/audit-higgsfield-game.py \
  --repo /path/to/higgsfield-ai-skills --format json
python3 .agent-skills/higgsfield-game-generation/scripts/audit-higgsfield-game.py --self-test
```

The helper checks the exact game skill folder, the current `higgsfield-websites` owner,
`references/game-flow.md`, installation-document claims, and the checked-out commit. It
never installs, logs in, creates, generates, deploys, or publishes.

If the exact folder appears in a newer upstream tree, read its `SKILL.md` and references
before choosing it. If it remains absent while `higgsfield-websites` owns `--type game`, use
the current owner. Never reconstruct a missing upstream skill from search snippets.

### 3. Freeze the proposal

Record:

- game concept, genre category, player range, input methods, and target devices;
- chosen memorable DNS-safe subdomain and conflict fallback;
- single-player or multiplayer, hidden information, and authority assumptions;
- rules, win/finish condition, view per player, and reconnect expectations;
- required visual/audio assets, user-owned references, and rights/provenance;
- local repository path, runtime prerequisites, and current CLI/account status;
- generation jobs and credit ceiling;
- whether a public deploy is approved;
- whether marketplace publication is separately approved.

A Higgsfield deploy is a live public side effect, not a preview. Marketplace publication is
a second side effect and must never be inferred from deploy approval.

### 4. Preflight without mutation

Prefer existing installations. Check versions and status without printing credentials:

```bash
command -v higgsfield && higgsfield --version
higgsfield account status
command -v git && git --version
command -v bun && bun --version
```

If the CLI or authentication is missing, present the current official setup path and wait.
Do not run remote install scripts or interactive login automatically. Never print tokens,
scoped Git credentials, cookies, or full account payloads.

### 5. Follow the checked-out game contract

At the audited pin, the canonical create shape is:

```bash
higgsfield website create --type game --category <genre> --subdomain <name>
```

Before running it, verify the live category list and approval. Do not pass a website template.
After creation, read the generated `app/AGENTS.md`; it travels with the scaffold and overrides
stale examples. The audited scaffold defines game logic through `meta`, `setup`,
`validateAction`, `applyAction`, `isGameOver`, and `viewFor`. Keep hostile input validation
and per-player information filtering inside that contract.

Do not use retired `higgsfield game ...` commands. Do not assume exact file names, room APIs,
or runtime versions across upstream updates without reading the generated scaffold.

### 6. Treat assets and credits as a gated lane

Build an asset manifest before paid generation. Record each asset's role, dimensions or
runtime constraints, source, provenance, and acceptance criteria. Reuse approved assets and
batch independent jobs only after the user approves the generation scope and credit ceiling.

Route generic Higgsfield media jobs to the installed upstream generator. Do not invent model
names or parameters; inspect the current CLI catalog and job schema. Never imply that a
generated asset grants unrestricted IP rights.

### 7. Verify locally before public action

Run the scaffold's documented logic check, type/build check, and tests from the documented
working directory. Add tests for changed rules, invalid actions, hidden information, match
finish, and repeat or reconnect behavior. A two-tab demo is useful evidence, but it does not
replace authority, security, or impairment testing from `multiplayer-game-architecture`.

Inspect the actual build and test output. Do not claim success from file existence alone.

### 8. Deploy and publish separately

Before deploy, re-read the current skill and status, verify metadata/cover requirements, and
show the exact project and public target. Deploy only after explicit approval, then read back
the live URL and current status.

Publish only if the user separately approved community listing. Verify the resulting listing
state rather than treating command exit as proof. Do not expose raw IDs or credentials in the
final report.

Return:

```markdown
### Higgsfield game packet
- Mode: <audit-owner | plan-game | create-edit | test | deploy | publish | troubleshoot>
- Upstream owner: <exact skill and audited commit>
- Game contract: <category, players, rules, hidden state, subdomain>
- Credit boundary: <approved jobs and ceiling, or none>
- Verification: <checks run and observed result>
- Public state: <not created | local only | deployed URL | published listing>
- Remaining gate: <smallest next approval or missing evidence>
```

## Examples

### Search result names a missing skill folder

Run the audit helper against a pinned checkout. If installation docs mention
`higgsfield-game-generation` but the tree does not contain it, report the drift and route to
the checked-in `higgsfield-websites` game flow. Do not fabricate the missing file.

### Build but do not publish

Freeze category, subdomain, game rules, assets, and credit ceiling. Obtain creation and paid
job approval, build and test locally, then stop before deploy unless public hosting was also
approved. Never publish to the marketplace from a request that only approved deploy.

### Provider-neutral game request

Route to `web-game-development`. Higgsfield should win only when the user explicitly selects
its platform, assets, hosting, rooms, or marketplace workflow.

## Best practices

1. Pin the upstream commit and trust the tree over installation prose or search indexes.
2. Let the generated `app/AGENTS.md` override stale platform examples.
3. Separate game design, paid generation, creation, public deploy, and publication approvals.
4. Treat clients as hostile and filter hidden information per player.
5. Keep asset provenance and the generation credit boundary visible.
6. Verify local rules and tests before public deployment.
7. Report the public URL or listing only after post-action read-back.
8. Keep credentials and raw internal IDs out of chat, logs, commits, and artifacts.

## References

- `references/upstream-drift.md`: pinned tree evidence and current owner decision.
- `references/game-flow-and-gates.md`: creation, scaffold, asset, test, deploy, and publish boundaries.
- `references/source-notes.md`: claim-to-source ledger.
- `scripts/audit-higgsfield-game.py`: read-only checkout auditor and self-test.
