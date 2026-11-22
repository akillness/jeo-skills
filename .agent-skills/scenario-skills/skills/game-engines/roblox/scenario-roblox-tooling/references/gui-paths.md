# GUI paths for the same procedures

For a human or a computer-use agent. Labels are from the current Roblox docs; Studio's menus moved
with the Next Gen UI in 2026, so search the label if a menu differs. The agent itself never clicks
these: it asks the user, then verifies from code.

## Studio MCP server (needed before any live step)

The toggle and its check live in the lead skill:
[scenario-roblox-expert gui-paths](../../scenario-roblox-expert/references/gui-paths.md). Verify
from code: `rbx_env.doctor()["studios"]` lists the open places, and `rbx_tooling.check_target`
confirms the bound one (P18).

Permission prompts in Claude Code: at the first call of each Studio tool, choose **Yes, allow
mcp__Roblox_Studio__<tool> for this project** (Roblox Learn, v8r1d80DxOY, 00:02:37), or commit the
allowlist of P18 before an unattended run.

## Team Create and the base place (P15, P16)

| Task                                     | Path                                                                                                                                                              | Source                  |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Mark the release base in the build place | **File** > **Save to Roblox with Notes** (Windows Ctrl+Alt+S, macOS Cmd+Option+S), name the version                                                               | Version History docs    |
| Read the version number of that save     | **Window** > **Version History**, newest row; or Creator Dashboard > **Creations** > the game > **Configurations** > **Places** > the place > **Version History** | Version History docs    |
| Save the build place for the release     | **File** > **Save to File**, into the repository as `assets/<place>.rbxl`; then set `"baseVersion"` in `places.json` (P15)                                        | coding harness tutorial |
| Save the map as a model file (option A)  | Explorer: right-click the model > **Save to File**, type `.rbxmx`                                                                                                 | MonzterDEV, 18-cGOjfrKw |
| Give a builder Edit on one experience    | **Collaborate** button, search the user, set **Edit**, **Save**; group games: Creator Dashboard Roles or per-game **Manage Collaborators**                        | collaboration docs      |
| Turn on Drafts mode                      | **File** > **Experience Settings** > **Enable Drafts Mode** (takes effect once every collaborator has left the session)                                           | collaboration docs      |
| Stop Team Create before a revert         | Live Collaborators window > **...** > **Disable Team Create**                                                                                                     | collaboration docs      |
| See who syncs a script                   | an icon on the instance in the Explorer                                                                                                                           | Script Sync docs        |

## Script Sync

| Task                        | Path                                                                                                                             | Verify from code                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Link a folder               | Explorer: select a folder, right-click > **Sync to...**, choose a directory, **Save**                                            | `InstanceFileSyncService:GetStatus(folder)` is SyncedAsRoot |
| Open the folder on disk     | right-click > **Script Sync** > **Reveal in Finder**                                                                             | none needed                                                 |
| Resume after a silent stop  | right-click the root > **Script Sync** > **Resume sync**                                                                         | status no longer Errored                                    |
| Stop before deleting a root | right-click > **Script Sync** > **Stop Sync**, then **Delete folder(s)**                                                         | root absent from `GetAllInstances()`                        |
| Conflict on open            | dialog: **Keep Studio** or **Keep Disk** (lists adds, changes and deletes)                                                       | SyncCheck ok                                                |
| Settings                    | Studio Settings (Option+S): "Auto resume sync on place open", "Resume conflicted sync on place open" (default **Do not resume**) | none                                                        |

Videos from early 2026 show Script Sync behind File > Beta Features; the current docs page has no
toggle.

## Rojo

| Task                      | Path                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Install the Studio plugin | `rojo plugin install` from the terminal (preferred over the Creator Store copy)        |
| Connect live sync         | `rojo serve`, then in Studio: **Plugins** > **Rojo** > **Connect** and accept the diff |
| Edit the project file     | disconnect in the plugin and stop `rojo serve` first, then restart both (P17)          |

An agent prefers `rojo build` and `rbx_env.open_place` over live sync: no plugin click is needed.

## Open Cloud API keys (the user does this; agents never create keys)

1. Group-owned experience: log in as a dedicated automation account first. Create it, invite it to
   the group and give it a role with only the permissions its task needs (API keys guide, "Create
   API keys for managing group-owned resources").
2. Creator Dashboard > **API Keys** (create.roblox.com/dashboard/credentials).
3. **Create API Key**, one per job, named after it (for example "ci-test-universe").
4. **Access Permissions** > **Select API System**, then the experience, then **Select Operations**.
   Add only what the job needs; scope strings are from the Open Cloud reference, full table in P13:
   - Test key (`ROBLOX_TEST_API_KEY`, test experience only): `universe-places:write` for the Saved
     upload of the dev build, and `universe.place.luau-execution-session:write` for Luau Execution.
     The first shows as **universe-places** with the **Write** operation (place publishing guide).
     The label of the second is not in the docs: pick the entry that grants it, then confirm with
     `tools/check_key`.
   - Publish key (`ROBLOX_PUBLISH_API_KEY`, production experience): `universe-places:write`; add
     `universe:write` when the release restarts servers, and `universe.place:read` on the builders'
     experience for the stale base check (P15).
5. **Security**: leave **Restrict IP addresses** unchecked for GitHub-hosted runners, which have no
   fixed IP (API keys guide; CJ_Oyer, gapG2tH-etI, 00:38:26). Set an expiry for short jobs; keys
   unused for 60 days expire anyway.
6. Store the secret in GitHub: repository **Settings** > **Secrets and variables** > **Actions**.
   Put the publish key in a protected **production** environment with required reviewers.

Health check from code: `POST https://apis.roblox.com/api-keys/v1/introspect` with the JSON body
`{"apiKey": "<key>"}` returns the key's scopes and its enabled and expired flags. It needs no scope.
A group key turns **Revoked** when its account loses permission to manage the group's keys:
**Regenerate Key** (API keys guide).

## Plugins

| Task                            | Path                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Save a script as a local plugin | select the script in the Explorer > **Plugins** menu > **Save as Local Plugin**; then delete the source script |
| Publish a plugin                | **Plugins** menu > **Publish as Plugin** (agents do not publish)                                               |
| Build without clicks            | name the file `Name.plugin.luau` and build it with Rojo into a model file (not yet run here)                   |

## Publishing and versions (human only)

- Restart servers: Creator Dashboard > **Creations** > the game > **Configurations** > **Server
  management** > select places > **Restart Servers**; in the dialog, **Restart only servers with
  outdated versions** (recommended) and **Delay server restart** (1 to 60 minutes). Same action from
  code: P14.
- Re-activate an auto-expired key (60 days unused): turn **Enable Key** off and on, or edit its
  name, description or expiry.

- Publish: **File** > **Publish to Roblox**. In this skill only the release workflow publishes.
- Roll back: Creator Dashboard > **Creations** > the game > **Configurations** > **Places** > the
  place > **Version History** > **Restore**. In Studio: **Window** > **Version History** > the
  version's menu > **Open Local Copy**, then **File** > **Save to Roblox As**. A restore creates a
  new version and does not publish it. No Open Cloud call for this was found in the sources.
- Ids: on **Creations**, the game's menu > **Copy Universe ID**; the place id is in the place's
  configure URL. In Luau, `game.GameId` is the universe id and `game.PlaceId` the place id.
