# GUI paths: data and backend

Menus and settings for the same procedures, for a person or a computer-use agent. Paths are from the
Creator Docs retrieved in October 2026; Studio menus move between releases, so search the menu by
name when a path differs.

## Studio

| Task                                    | Path                                                                                    | Note                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Let Studio reach DataStores             | File > Experience Settings > Security > Enable Studio Access to API Services, then Save | Published games only; Studio then writes live keys, so use a test experience     |
| Allow teleports to games you do not own | File > Experience Settings > Security > Allow Third Party Teleports                     | Not needed between your own games                                                |
| Run a playtest                          | Mezzanine **Play**; for several clients, the test mode dropdown > **Server & Clients**  | The multi-client test cannot teleport two accounts (error 773, TextChanged)      |
| Watch ProfileStore and probe output     | **Window** menu or **Script** tab > **Output**                                          | Look for "[ProfileStore]: Roblox API services unavailable" in unpublished places |
| Publish all places                      | File > Publish to Roblox, for each place                                                | Publish every place of a multi-place game together                               |

## Creator Hub (create.roblox.com/dashboard/creations, then select the game)

| Task                                         | Path                                                                   | Note                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Browse keys and storage                      | Configurations > Data stores manager                                   | Shows Total Size against the Storage Limit                                                     |
| Add RTBF deletion templates                  | Configurations > Data stores manager > RTBF Deletion > Create Template | Type, data store, key pattern with `{UserId}` (case-sensitive), scope; check the sample output |
| Restore a deleted data store                 | Configurations > Data stores manager > Action menu > Restore           | Keys restore through `UpdateAsync` or Open Cloud                                               |
| Watch requests, throttles and errors         | Monitoring > Data Stores                                               | Owner or analytics permission                                                                  |
| Create Developer Products                    | Monetization > Developer Products > Create developer product           | Game must be published                                                                         |
| See receipt-handling problems                | Monetization > Shop                                                    | A banner links to a report when `ProcessReceipt` issues are detected                           |
| Restart outdated servers after a data change | Configurations > Server management > Restart Servers                   | Choose "Restart only servers with outdated versions"                                           |
| Control who can join a non-start place       | Audience > Access Settings > Access Control for Places                 | Place > Access > Direct Access Control overrides it per place                                  |

## Open Cloud (no GUI)

- Snapshot all data stores once a day before a data-logic release (`SnapshotDataStores`).
- Read, write and list entries for support work (`DataStoreEntry` methods); these spend the same
  experience budget as game servers.
- Restore a data store (`UndeleteDataStore`).
- Publish RTBF templates: Configs API, repository `DataStoresConfig`, config `user_data_templates`
  (draft, then publish); the key needs `universe:read` and `universe:write`.

## What an agent does instead

- Studio API access: probe with `rbx_data.probe_services` and run the mock. The toggle itself stays
  a human step.
- Developer Products: product ids come from the person or from the monetization skill; the agent
  writes the handler table.
- Teleports and purchases: logic tests against a fake TeleportService and a receipt hook; the real
  calls need a published experience and a real account.
