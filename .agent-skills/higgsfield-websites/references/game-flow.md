# Game flow — `--type game`

A game is a website whose template ships **realtime multiplayer rooms**. Same
CLI, same repo layout, same deploy and publish; what differs is what you write
and where the rules live.

Games used to run on a separate engine with its own `higgsfield game` commands.
They don't any more — that engine is being retired, and its commands are gone.
If you find a reference telling you to publish a game any other way than
`higgsfield website deploy`, it is out of date.

## Create

```bash
higgsfield website create --type game --category <genre> --subdomain <name>
```

- **`--category` is REQUIRED and must be a game genre** — `arcade`, `puzzle`,
  `shooter`, `platformer`, `rpg`, `strategy`, `racing`, `simulation`,
  `adventure`, `action`, `fighting`, `survival`, `horror`, `sports`,
  `card-board`, `education`, `endless-runner`, `moba`, `music-rhythm`,
  `sandbox-building`. Fetch the live list with `higgsfield website categories`;
  a site category (`cinematic`, `ads-marketing`, …) is rejected.
- **Do NOT pass `--template`.** A game scaffolds from the one template a game
  can use; naming any other is a 422.
- `--subdomain` as always — it becomes the live URL.

## Read the contract that ships with the repo

The scaffold's **`app/AGENTS.md`** is the authoritative contract, and it travels
with the code so it cannot drift from the template you actually got. Read it
before writing anything. In short:

| File | What it is | Edit? |
| --- | --- | --- |
| `app/src/logic.js` | **The game** — six pure functions | **Yes, this is the game** |
| `app/public/index.html` + `client.js` | The screen and the input | **Yes** |
| `app/src/room.ts` | Sockets, state, fan-out | Rarely |
| `app/src/worker.ts` | Routes `/ws/<room>` | Almost never |

The six exports are `meta`, `setup`, `validateAction`, `applyAction`,
`isGameOver`, `viewFor`. `bun run check:logic` enforces the mechanical rules as
part of the build — no imports, no `Date.now()`/`Math.random()`, JSON-serializable
state.

Two rules the checker cannot enforce and that decide whether the game is any
good:

- **`validateAction` is the only defence.** The client is untrusted and can send
  any action at any time. Whose turn it is, whether the move is in range,
  whether the target is legal — all of it belongs there.
- **`viewFor` is how you hide information.** What it returns is the *only* thing
  that player receives. For a card game return that player's hand and everyone
  else's card *count*, never the full state.

## Build, deploy, publish — identical to the other types

```bash
cd app && bun run build      # runs check:logic + tsc
higgsfield website deploy <website_id>
higgsfield website publish <website_id>
```

Deploy ships the live game at `<subdomain>.higgsfield.app`; publish lists it on
the community feed. As with every type, **fill `app/src/app-meta.json` before
publishing** (`og_title`, `og_description`, `og_image_url`,
`marketplace_cover_url`) — a game with an empty `og_title` is invisible on the
feed. See the cover + metadata section of `SKILL.md`.

## Testing it

The template ships vitest against the real workerd runtime
(`app/tests/room.test.ts`), driving the room through actual WebSockets. Run
`bun run test` in `app/`. A game whose rules you changed should get a test for
the rule — the suite is the safety net for the wire protocol every game shares.

Play-test with two browser tabs on the deployed URL: rooms are per-path
(`/ws/<room>`), so two tabs on the same room join the same game.

## Art and audio

The asset pipeline lives here too, under the `game-` prefix. Read
`references/game-design-system.md` FIRST — it settles the game profile, the core
loop and the asset manifest — then `references/game-stylization.md` to derive the
STYLE FORMULA every visual prompt reuses byte-for-byte. No visual should exist
before that formula does.

Then the reference matching each manifest row:

| Asset | Reference |
| --- | --- |
| Sprites, backgrounds, UI | `references/game-stylization.md` |
| Spritesheets / 2D animation | `references/game-2d-animation.md` |
| Tiles, walls, ground, PBR maps | `references/game-textures.md` |
| Any 3D model or animation | `references/game-3d-animation.md` |
| Non-humanoid procedural rigs | `references/game-procedural-animation.md` |
| Music, SFX, voice | `references/game-audio.md` |
| Raw Meshy fallback | `references/game-meshy-api.md` |
| Before any image-to-3D submit | `references/game-meshy-input-rules.md` |

The GLB, rigging and texture tooling those references drive ships in this
skill's `scripts/` (`pipeline.py`, `glb_patch.py`, `rig_transfer.py`, …). Never
recreate a bundled script from memory — find it on disk.

Assets land in `app/public/`; keep `design/assets.csv` beside them so the
manifest travels with the game.

## Single-player is fine

Nothing here forces multiplayer. `meta: { minPlayers: 1, maxPlayers: 1 }` gives a
single-player game that still gets rooms, persistence and the same deploy — many
of the games on the platform are exactly that.
