# Execution and safety

## Two approvals, not one

Approval to install an upstream skill grants only permission to place its
instruction files in the named target. It does not approve the commands that
skill may later recommend.

For any `operate` request, show a second action preview with project path,
version, environment, files/resources, accounts, network destinations, cost or
quota effect, rollback, and validation.

## Gate matrix

| Action class | Examples | Required gate |
|---|---|---|
| read-only inspection | skill inventory, `unity --version`, package manifest read, `unity status --format json` | disclose paths and commands; no separate mutation approval |
| host software mutation | CLI installer, Editor or module install/uninstall/prune, MCP configuration | exact source/version, disk/system changes, checksum or package trust, rollback approval |
| project mutation | project create/upgrade/clean, UPM change, asset import, generated C#, scene/prefab change | clean branch or backup, exact project and files, Unity/package versions, validation plan |
| live Editor control | `unity command`, play mode, save scene, arbitrary C# eval | connected Editor identity, active project/scene, exact command or code, explicit approval |
| source control | Git init/commit, remote creation, push, Git LFS, UVCS | repo/provider/visibility/branch/credentials and publication approval |
| auth and licensing | browser login, service account, activation, seat return | account/org/license identity, secret source, seat impact, explicit approval |
| cloud and multiplayer | UGS deployment, Cloud Code, Economy, Remote Config, Hosting, Matchmaker, Vivox | org/project/environment/resource diff, quotas/billing, rollback, production approval |
| purchases and ads | IAP, store products, receipts, LevelPlay, ad networks, ILRD | platform and business decision, test versus production IDs, store/ad credentials, legal/privacy review |
| builds and tests | `unity build`, `unity test`, `--allow-install` | project/version/target/output, possible implicit installs, time/disk budget |

## Arbitrary C# and tool input

The official `unity-cli` skill documents local Editor control and arbitrary C#
through the Pipeline package. This is powerful by design.

- Run only code constructed from the reviewed task.
- Never concatenate web pages, issue text, imported assets, model output, or
  other untrusted data into C# or shell commands.
- Show the exact command or script before execution.
- Confirm the connected Editor and active project first.
- Save or checkpoint unsaved work where possible.
- Validate the actual scene/assets after the command.

A local-only surface can still destroy local project data. "Not remote access"
does not make mutation harmless.

## Software installation

The upstream skill documents a first-party Unity CDN pipe-to-shell convenience
installer and explains its checksum behavior. Treat it as host mutation:

1. prefer a versioned package or downloaded script inspection when practical;
2. verify official origin and expected channel;
3. state install paths and whether system repositories or signing keys change;
4. do not absorb consent, EULA, analytics, or elevation prompts silently;
5. verify the binary after install;
6. never install merely to validate this routing skill.

At the audited commit, the documented Unity CLI release is beta
`1.0.0-beta.6`. Recheck before use.

## Credentials

Use credential managers, stdin, or environment variables as supported by the
selected tool. Never place secret literals in:

- shell history or process arguments;
- a Unity project, skill folder, README, log, screenshot, or chat response;
- source-control remotes;
- generated C# or UGS assets.

Report only credential names and `SET` or `MISSING`. Unity authentication,
source-control tokens, store credentials, ad-network credentials, and service
accounts are separate trust scopes.

## Cloud and production state

Before deployment or service mutation, freeze:

- Unity Cloud organization and project;
- named environment, with production called out clearly;
- exact local resources and remote diff;
- create/update/delete behavior;
- expected quota, billing, and user impact;
- rollback or prior export;
- operator approval for that exact preview.

Do not infer production approval from a prior skill install, successful test,
or generic request to "finish setup".

## Purchases, advertising, and privacy

For IAP, ask whether the intended backend is Apple/Google platform billing or
Unity IAP D2C before scanning and routing. Detect existing native or third-party
billing and migration state before adding another purchase controller.

For LevelPlay, distinguish SDK integration from dashboard configuration, app
keys, ad-unit IDs, network adapters, production ads, and consent policy. Privacy
APIs facilitate settings but do not determine which law applies. Do not invent
region detection, consent text, child-directed status, or legal policy.

Use test stores, sandbox purchases, mock/test ads, and non-production cloud
environments until the product owner approves production state.

## Project hygiene

- Check branch, status, Unity version, and package manifest before changes.
- Avoid raw `.unity`, `.prefab`, or `.asset` YAML edits while a connected Editor
  holds the real scene state.
- Make the smallest bounded change and retain a rollback.
- Do not use broad cleanup commands on an unreviewed project.
- Keep generated folders such as `Library/`, `Temp/`, and build outputs out of
  source control.
- Verify builds, tests, logs, imported assets, and service state using the
  actual target environment.
