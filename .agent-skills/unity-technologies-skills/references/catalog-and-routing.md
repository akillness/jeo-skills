# Catalog and routing

## Snapshot authority

This map was audited at upstream commit
`87fac23d66a1f44f5e06c2935eccce0b40b9715a` on 2026-08-27 KST.
The top-level README lists 13 names, while the actual `skills/` tree has 22
folders with `SKILL.md`. Use the tree and the read-only audit helper as the
inventory source of truth.

## Full 22-skill map

### Project and core tooling

| Skill | Route here for | Important boundary |
|---|---|---|
| `new-unity-project` | guided greenfield idea, platform, monetization, Editor and project flow | does not scaffold gameplay code |
| `unity-cli` | Editors, modules, projects, auth, license, builds, tests, MCP, live Editor commands | collides with the existing jeo-skills `unity-cli`; beta CLI and powerful mutation surface |
| `unity-package-management` | UPM discovery, add/remove/upgrade, headless package changes | uses Editor PackageManager APIs; Unity CLI does not own UPM |

### Services, monetization, and multiplayer

| Skill | Route here for | Important boundary |
|---|---|---|
| `build-live-game` | UGS auth, Cloud Save, Cloud Code, Economy, Remote Config, leaderboards, deployments | cloud environment, account, quota, and overwrite review required |
| `implement-in-app-purchases` | Unity IAP, store products, entitlements, receipts, migration from native or third-party billing | real-money and store-console state; ask platform versus D2C first |
| `levelplay-unity-integration` | rewarded, interstitial, banner, mediation, ILRD, privacy settings | ad accounts, app/ad-unit IDs, dependency changes, privacy/legal review |
| `setup-multiplayer-services` | topology, sessions, lobbies, matchmaking, hosting, discovery | package and service prerequisites vary by topology |
| `setup-vivox-voice-chat` | voice, text, positional channels, microphone permissions, migration | Unity Authentication and communication/privacy requirements |

### UI and content authoring

| Skill | Route here for | Important boundary |
|---|---|---|
| `ui` | detect the UI system and choose a specialist | router only |
| `ui-uitk` | Unity 6 UI Toolkit, UXML, USS, custom elements, runtime binding | verify Unity version and PanelSettings |
| `ui-ugui` | Canvas, RectTransform, layout groups, prefab UI | avoid blind prefab YAML edits while Editor state is live |
| `ui-imgui` | EditorWindow, custom Inspector, PropertyDrawer, legacy OnGUI | editor tooling, not ordinary runtime UI |
| `localization` | locales, string/asset tables, CJK TMP fonts, Addressables | package and font licensing/assets must be verified |
| `sprite-editor` | sprite rects, borders, pivots, outlines, slicing | ships C# Editor-script templates that mutate imported sprite data |

### Rendering and performance

| Skill | Route here for | Important boundary |
|---|---|---|
| `urp-postprocessing` | Volume effects such as bloom, tonemapping, DOF, vignette | URP and Editor execution prerequisites |
| `validate-urp-render-graph-renderer-feature` | Unity 6+ Render Graph renderer-feature review | validation, not a general renderer generator |
| `shader-graph-create-custom-node` | reflected Shader Graph custom nodes from HLSL | writes HLSL assets; validate include paths and function signatures |
| `optimize-audio` | import settings, codecs, load types, mixers, memory and CPU | measure before applying bulk import changes |
| `optimize-text-mesh-pro` | TMP font stacks, atlases, SDF, memory and CJK fallback | text/TMP only, not UI Toolkit layout |
| `optimize-web` | Unity WebGL/WebGPU size, load, browser performance, server compression | includes C# and shell resources; audit server/CDN requirements |

### Gameplay systems

| Skill | Route here for | Important boundary |
|---|---|---|
| `initialize-ai-navigation` | NavMesh surfaces, agents, obstacles, links, areas | package check and existing navigation audit first |
| `physics-3d-collision` | 3D PhysX callbacks, triggers, raycasts, tunneling, ragdolls | invalid YAML frontmatter at the audited commit, so Agent Skills CLI 1.5.23 skips it |

## Routing rules

1. If the request is about installing or inspecting this pack, stay in
   `unity-technologies-skills`.
2. If the pack is already installed and one specialist clearly owns the task,
   route to that specialist and load only its references.
3. If the user asks about the local jeo-skills Unity CLI workflow without
   naming the official pack, route to `unity-cli`.
4. Generic third-party Unity skill curation belongs to
   `unity-gamedev-skill-pack`.
5. Build-log diagnosis, game pipeline design, and profiler interpretation belong
   to `game-build-log-triage`, `game-ci-cd-pipeline`, and
   `game-performance-profiler` respectively.
6. Never route to `physics-3d-collision` as installed until its upstream
   frontmatter validates or a reviewed local patch is explicitly approved.

## Upstream links

- [Actual skills tree at the audited commit](https://github.com/Unity-Technologies/skills/tree/87fac23d66a1f44f5e06c2935eccce0b40b9715a/skills)
- [Top-level README at the audited commit](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/README.md)
- [Contribution and structure contract](https://github.com/Unity-Technologies/skills/blob/87fac23d66a1f44f5e06c2935eccce0b40b9715a/CONTRIBUTING.md)
