# Expert notes: tooling, tests and CI

Principles and judgment by source, with timestamps. Tool names from 2022 to 2024 talks are mapped to
their current replacements. Items marked [added] are this skill's own conclusions, each backed by a
test in [procedures.md](procedures.md).

## CJ_Oyer: CI gate and multi-place publishing

Connect 2023 workshop on Open Cloud automation (Roblox Learn). Independent developer, about 15 years
making games, three Roblox Accelerator internships (self-described).

- Build the place from the repository, from empty. Never publish a dev place edited by hand: a
  deleted object would ship silently [00:42:51].
- The CI run exists to fail. "When your code is bad you want the GitHub action to fail because that
  means it didn't just publish a bad update" [00:12:50].
- Type errors and lint errors block the publish. That catches roughly "90 percent of what breaks a
  game" in his words: typos and renamed functions, not design bugs [00:13:22 to 00:13:55].
- Keep a manual playtest before a big release; CI does not replace it [00:13:22].
- Type safety is the highest-value habit. In a fully typed project he codes for an hour or two and
  it runs the first time; the migration takes weeks [00:10:01, 00:40:04].
- Selene is overzealous on some rules (assert messages): relax the rule in `selene.toml`, never drop
  the linter [00:16:48].
- Rerun a failed check locally instead of debugging inside the Actions console [00:17:22].
- Only the pipeline publishes. Developers get repository access, and nobody publishes by accident
  [00:22:44]. Skip this only when alone [00:46:42].
- Packages through a manager make edits to a copied package impossible [00:24:57].
- Pre-bake maps per place outside the server runtime: generating at server start made players wait
  about two minutes in his earlier project [00:33:38; maps 00:30:19 to 00:35:18]. [added] This is
  why the release merges a saved map (P15) instead of building it at runtime.
- Publish every place of a multi-place game in one run. An old place that reads a newer DataStore
  shape errors, so forward compatibility is not free [00:26:27 to 00:27:33].
- Start CI with one trivial Action; type checking is easier to wire than publishing and comes first
  [00:37:38, 00:41:43].
- Write the first unit test for a function used often with simple inputs and outputs. The best
  moment for tests is a trusted system you are about to optimize [00:19:38, 00:43:55].
- His 2023 workaround for engine tests (a local run stamped with a hash of the files, checked by CI)
  predates Open Cloud Luau Execution [00:19:38 to 00:21:51]. Today: P5, P9 and P12.
- His CI publish failed on an IP-restricted key because GitHub runner IPs change [00:38:26 to
  00:38:58]. Outdated in the talk: Foreman and Aftman (now Rokit), TestEZ and run-in-roblox, and his
  fix of adding each runner IP to the key by PATCH (current docs: IP restriction is optional; leave
  it off without a fixed IP).

## Distracted Games: Wally, Script Sync, Rojo

"How to Use Wally with Roblox Script Sync" (2026-09-26) and "Rojo Actually Explained" (2025-01-23).
Roblox developer, credential unverified; strong personal preferences.

- Wally packages can arrive mis-packaged: `require` hits a folder with no init module, and you index
  into `lib` by hand. Copying the module from GitHub avoids it [xlxnmAFmu6c 00:01:44, 00:04:34].
  [added] ShipCheck `package-entry` now catches it before release (P4, O23).
- Rokit replaces Aftman, which he calls no longer supported [xlxnmAFmu6c 00:04:34].
- Point Script Sync "Sync to" at the parent service folder, not at Packages, and keep the disk
  version at the conflict prompt [xlxnmAFmu6c 00:09:25].
- Script Sync touches only scripts, so `wally.toml` and `wally.lock` in the folder never reach
  Studio [xlxnmAFmu6c 00:11:02].
- luau-lsp needs a sourcemap to know the data model; Rojo can run only as a sourcemap generator
  beside Script Sync [xlxnmAFmu6c 00:11:51, 00:12:57].
- Main benefit of Rojo is version control; editor comfort comes second [Zhl_NAPMztY 00:00:33].
- Keep scripts in files and non-script instances (parts, models, RemoteEvents) in Studio
  [Zhl_NAPMztY 00:26:43].
- Stop `rojo serve` and disconnect before editing the project file [Zhl_NAPMztY 00:37:52].
- Reconnecting Rojo deletes anything under a mapped node that is not on disk [Zhl_NAPMztY 00:44:28].
  Fix: `$ignoreUnknownInstances` or a child folder (P3).
- Correction from a test: "a `$path` node without `$className` becomes a Folder" holds except in a
  key's home position. In Rojo 7.7.1 a service name directly under DataModel, `StarterPlayerScripts`
  or `StarterCharacterScripts` under StarterPlayer, and `Terrain` under Workspace build as that
  class with only `$path`; the same names elsewhere (under ReplicatedStorage) build as Folders (P17,
  O24).

## MonzterDEV: Rojo project file

"How to use Rojo to easily create Roblox games!" (2024-09-06). Roblox educator, credential
unverified.

- The project `tree` is the Explorer: DataModel at the root, then services, each with `$path` to a
  folder [18-cGOjfrKw 00:07:33 to 00:11:10].
- An `init` file turns its folder into a script with children; rename it `name.server.luau` when
  that is not wanted [00:11:43 to 00:14:22].
- Keep Studio-made instances alive with `init.meta.json` `{"ignoreUnknownInstances": true}` or save
  them as `.rbxmx` (readable XML) in the repository [00:19:52 to 00:23:07].
- A blank `init.meta.json` breaks Rojo [00:20:24]. Tested: `rojo build` exits 1 with "File contains
  no JSON value".
- Verify the extension author before installing tools [00:02:11].

## Roblox Learn: the official MCP setup video

"How to start coding with AI on Roblox (MCP)" (2026-06-11), official Roblox channel.

- File sync and MCP are two separate connections: files give the agent the code; MCP gives it the
  live data model and playtests [02:31].
- Verify by prompt: the agent edits scripts in every synced folder, reads
  `InstanceFileSyncService:GetStatus`, playtests, then removes the probes [02:45 to 03:20, video
  description].
- Commit only after that end-to-end test passes; revert with Git afterwards [03:20 to 03:34].

## SmartyRBX: agent habits with Script Sync

"How to Build Roblox Games With AI in 2026" (2026-03-31). Roblox educator, credential unverified.

- The agent can only read code that exists as files: sync first [0ENeVVC9QT0 00:02:40].
- Open the repository root in the agent, never a service folder; one folder per synced service
  [00:04:16, 00:09:21].
- Script Sync can stop silently, often after reopening a place: a red dot on the service;
  right-click, Script Sync, Resume sync [00:12:19 to 00:13:25]. [added] An agent polls `GetStatus`
  instead (P6).
- Restart the agent client after adding an MCP server [00:16:00].

## Adam (BanTech), Last Level Studios: roblox-ts trade-off

Beyond The Blox podcast (2026-03-18). Director of a studio that shipped a bowling arcade game.

- TypeScript is "a contract": the compiler refuses nil-index mistakes [EaBdlLFNHVU 00:02:38].
- Costs: no Studio editing, Luau line numbers in errors, community typings lag new APIs [00:06:01 to
  00:07:10].
- Deciding condition: a web-background team with heavy UI may take roblox-ts; agents that drive
  Studio through MCP and need the newest APIs stay on typed Luau [added].

## Cheese God: publishing from the command line

"EASILY Publish Your Game From Command Line" (2022-10-14). Roblox developer, credential unverified.
The video is private as of 2026-10-25, so these notes can no longer be rechecked against it.

- Publishing from a CLI replaces Studio's Publish and keeps the key in CI secrets [3wVLa5PiqvQ
  00:00:52, 00:05:36].
- `game.PlaceId` and `game.GameId` give the place and universe ids [00:02:41].
- Outdated: the `0.0.0.0` IP restriction workaround [00:04:35]. Current docs: leave IP restriction
  off for runners and keep the key least-privilege.

## Roblox RDC 2024: external tools roadmap

"Create & Ship Faster with AI and Collaboration". Eric Yip, engineering lead for Creator
collaboration.

- "Anything you can do in Roblox engine should be available to external tools via Open Cloud",
  starting with automated testing [XrxUy51NsvI 00:17:56, 00:18:29]. Shipped since as Luau Execution.

## Roblox Learn: version control in Studio

- Three native layers: place versions, Packages, script history [sU9nTX0JFyY 00:00:00].
- Publishing over a place that collaborators still have open fails; everyone closes Studio on it
  first [00:00:48].
- Packages keep one model in sync across places; editing a copy warns until you publish or revert
  [00:01:12 to 00:03:42]. Old script versions open read-only [00:04:15].

## Official docs (no timestamps)

- Collaboration ([projects/collaboration](https://create.roblox.com/docs/projects/collaboration)):
  Edit per experience through Manage Collaborators, or a group role for all group games. Studio
  auto-saves a collaborative session every four minutes. Reverting while someone edits can be
  overwritten by their auto-save: disable collaboration first. Drafts mode is off by default.
- Script Sync and Team Create ([scripting/sync](https://create.roblox.com/docs/scripting/sync)):
  Script Sync works with the built-in collaboration tools, "which third-party tools often do not".
  Avoid several people syncing and editing the same script: "collaborators can overwrite each
  other's changes".
- Type solvers (DevForum [3155804](https://devforum.roblox.com/t/3155804),
  [4084991](https://devforum.roblox.com/t/4084991)): since the general release of 2025-11-20 the new
  solver is the default for nonstrict and nocheck scripts; strict scripts follow
  `Workspace.UseNewLuauTypeSolver`. Tested: `luau-lsp analyze` 1.70.1 runs the old solver unless
  given `--flag:LuauSolverV2=true`.

- Script Sync ([scripting/sync](https://create.roblox.com/docs/scripting/sync)): only Script,
  LocalScript, ModuleScript and Folder sync; attributes and tags on scripts are ignored and can be
  lost; 10,000 scripts per root and 128 roots; default conflict policy "Do not resume";
  collaborators editing one synced script overwrite each other.
- Script locations ([scripting/locations](https://create.roblox.com/docs/scripting/locations)):
  client code as one RunContext Client Script in ReplicatedStorage; Starter containers should hold
  LocalScripts, because the original and the copy both run. Confirmed live: 2 runs and an engine
  warning (P7).
- Rojo ([project format](https://rojo.space/docs/v7/project-format/),
  [sync details](https://rojo.space/docs/v7/sync-details/)): `$ignoreUnknownInstances` defaults to
  false under `$path`; Rojo cannot live-sync Terrain, CSG or `MeshPart.MeshId`.
- Luau Execution (Open Cloud reference): no physics, place scripts do not run, changes never
  persist, DataStore calls hit real data. At most 10 incomplete tasks per place: creating an 11th
  returns HTTP 429. Results over 4 MB fail the task; logs keep the last 450 KB.
- Place publishing
  ([cloud/guides/usage-place-publishing](https://create.roblox.com/docs/cloud/guides/usage-place-publishing)):
  the API does not update EditableImage, EditableMesh, PartOperation, SurfaceAppearance or BaseWrap
  instances; publish from Studio after modifying them.
- Server restarts ([projects/update-games](https://create.roblox.com/docs/projects/update-games),
  Open Cloud `:restartServers`): restart only servers on outdated versions unless your update
  process is independent of place version; bleed-off lets players leave within 1 to 60 minutes;
  restart when the player data format changes.
- API keys ([cloud/auth/api-keys](https://create.roblox.com/docs/cloud/auth/api-keys)): least
  privilege; a key unused or not updated for 60 days auto-expires even without an expiry date;
  `POST api-keys/v1/introspect` returns `enabled`, `expired`, `expirationTimeUtc` and scopes; for
  group resources, a dedicated alternate account invited to the group with a role holding only the
  permissions its task needs, the keys created on that account; a group key turns Revoked when its
  account loses permission to manage the group's keys.
- Plugins ([studio/plugins](https://create.roblox.com/docs/studio/plugins)): one active
  ChangeHistory recording per plugin; the command bar wraps its own commands in recordings; a
  reloaded plugin keeps its open recording, so store the id in an attribute; after Save as Local
  Plugin, delete the source script so edits land in the right copy.
