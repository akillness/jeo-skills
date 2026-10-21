# ArtCraft pinned operator reference

This reference covers `storytold/artcraft` at commit `40e04793b504147de97ba1f0659d3975167524e5`. The repository is dual-licensed under MIT or Apache-2.0, while `NOTICE` excludes the ArtCraft marks and several bundled third-party assets from those grants. The local preflight is offline-only and never invokes these commands.

## Command and feature matrix

| Surface | Use | Side-effect boundary | Evidence |
| --- | --- | --- | --- |
| `python3 .agent-skills/artcraft/scripts/preflight.py --json` | inspect host tools and an optional pinned checkout | read-only; no network, secrets, upstream executable, build, server, or provider call | local helper contract |
| Stable download from `getartcraft.com` | obtain the desktop release advertised by the README | downloads and runs an installer; explicit approval required | README download links |
| GitHub Releases | inspect latest ArtCraft release artifacts | network/download/install; explicit approval required | README and release workflows |
| `npm ci` in `frontend` | install the checked-in frontend workspace dependencies | package downloads and writes `node_modules`; explicit approval required | `_docs/dev_setup.md`, `frontend/package.json` |
| `npx nx run artcraft:build` | build the frontend before Tauri packaging | local build output and dependency execution; explicit approval required | Windows/macOS publish workflows |
| `./script/artcraft/unix_dev.sh` | run Vite plus Rust/Tauri on macOS/Linux | starts local listeners and a desktop process; explicit approval required | `_docs/dev_setup.md` |
| `windows_frontend_dev.ps1` plus `windows_rust_dev.ps1` | run the two Windows development halves | starts local dev processes; explicit approval required | `_docs/dev_setup.md` |
| `SQLX_OFFLINE=true cargo check -p artcraft` | compile-check the desktop Rust crate using checked-in SQLx metadata | local compilation and `target` writes; explicit approval required | `_docs/dev_setup.md` |
| 2D canvas and compositing | layer images, remove backgrounds, draw, mask, and inpaint | local scene editing; saving/exporting writes user data | README feature table |
| 3D stage and kitbashing | place meshes, image layers, worlds, props, mannequins, and cameras | local scene editing; asset imports and saves write user data | README feature table |
| Image/video/audio/mesh/world generation | enqueue a selected provider/model job | remote request, uploads, account use, and credit charge; explicit approval required | README catalog, credit and cost API types |
| ArtCraft download/export controls | save generated media into configured downloads or a user-selected directory | writes local media; publishing/sharing remains separate approval | `AppDownloadsDir`, download commands |
| `POST`/provider API calls | authenticate and submit generation or media operations | network and credentials; never run during fit-check or preflight | API host and client crates |

## Setup prerequisites and build shape

- The README identifies ArtCraft as an interactive AI image/video IDE with 2D composition and 3D scene staging, and links stable Windows/macOS downloads, GitHub releases, and a source-build guide. Linux is documented in the source-development path, not as a stable download target.
- `_docs/dev_setup.md` calls the app Rust/Tauri, requires Rust, npm or nvm, and Tauri CLI `2.10.0` as a version that worked at the pinned documentation snapshot. It says Node.js `20+` is required for the Unix launcher and that Node `24.13.0` worked at the time of writing.
- The root workspace is Rust with a Tauri desktop crate at `crates/desktop/artcraft`; the frontend workspace is private npm/Nx/Vite code under `frontend`. The Tauri config uses `frontend/apps/artcraft/dist`, `nx run artcraft:dev`, and `npx nx run artcraft:build`.
- The normal source path uses the user's ArtCraft app-data directory and Cargo target directory. The launcher chooses a free loopback port beginning at `5193`; it does not create an isolated account/data profile.

## Release and platform limits

- Stable release links in the README are Windows and macOS. The macOS publish workflow builds a universal Apple target (`aarch64-apple-darwin` and `x86_64-apple-darwin`) and uploads a draft GitHub release. The Windows workflow builds on `windows-latest` and uploads a draft GitHub release.
- Source development instructions cover macOS/Linux through `unix_dev.sh` and Windows through two PowerShell scripts. The checked-in Tauri config enables all bundle targets, but that setting alone is not evidence of a published Linux installer.
- The macOS workflow imports a Developer ID certificate and configures signing credentials in CI. The checked-in workflows do not publish a checksum manifest or describe a user-facing signature-verification command. Treat artifact authenticity as unresolved until a release page supplies verifiable checksums/signatures.
- `tauri.conf.json` permits connections to `*.storyteller.ai`, `*.fakeyou.com`, Google Analytics/Tag Manager, and loopback Tauri origins. The frontend separately initializes PostHog. This is a capability declaration, not proof that every provider is active in a given release.

## Providers, hosted services, and credits

- The README advertises the ArtCraft hosted catalog for images, video, music/sound, 3D meshes, and worlds, plus Grok, Midjourney, Sora, and World Labs. It marks some catalog models disabled or restricted and says additional provider integrations are planned.
- The Rust API host enum identifies `https://api.storyteller.ai` as the Storyteller host, `https://api.fakeyou.com` as a FakeYou host, and `http://localhost:<port>` as a development host. The source workspace contains clients for ArtCraft, fal, Grok, Midjourney, OpenAI/Sora, and World Labs; availability and authentication are provider/model-specific.
- The pinned desktop source separates frontend and backend services: `_docs/dev_setup.md` says backend services and website builds live in the separate `artcraft-services` repository. Do not describe the desktop source tree as a self-contained local generation backend.
- The ArtCraft session-credit response models free, monthly, and banked credits plus a total. Image, video, and splat cost-estimate responses expose estimated credits and estimated USD cents. Cost estimates are not proof of a final charge; show the app's current estimate before approval.
- Credential storage is explicit in source: Storyteller cookies, Grok state/cookies, Sora cookies/bearer/sentinel stores, fal API key, Midjourney cookies/state, and World Labs state/cookies/bearer/refresh files live under the credentials subdirectory. Never print or copy these files.

## Telemetry and local data

- A desktop activity thread calls the Storyteller `active_user_v2` endpoint after a non-empty Storyteller session is present. Its request includes app name, app version, OS platform/version, session duration, total generation count, per-mode generation counts, and prompt-page counts. The source comments describe this as lightweight analytics telemetry.
- The frontend initializes PostHog with a public key and `https://us.i.posthog.com/`; the desktop source also allows Google Analytics and Google Tag Manager origins. Treat analytics as remote data transmission and disclose it in privacy-sensitive handoffs. The pinned source does not document a user-facing telemetry opt-out.
- The default root is the user's home directory joined with `Artcraft`. Startup creates `assets`, `credentials`, `downloads`, `settings`, `state`, and `temp` subdirectories and an `artcraft_debug` log basename. Tauri appends `.log` to the log filename.
- `settings` currently stores loose JSON such as `app_preferences.json`, `env_configs.json`, and `provider_preferences.json`. `state` stores the versioned task SQLite database and window position/size JSON. `downloads` is the app-managed media destination; `temp` holds temporary files. Source builds use the same normal data root unless the app configuration is changed.

## Scene, generation, and handoff boundaries

- Scene tools are composition controls: the README lists image-to-location, 2D and 3D compositing, image-to-mesh, character posing, kitbashing, identity transfer, background removal, and mixed asset crafting. Capture the scene/blocking state before enqueueing a remote job.
- Generation is hosted or provider-backed in the audited architecture. A local source build does not make ArtCraft's model catalog local. Require approval for sign-in, cookies/API keys, uploads, remote generation, and credits even when a provider has a nominally free tier.
- Downloads may use generated CDN media URLs and the app's configured download directory. Record model/provider, job token or result identifier when available, output type, and destination. Do not publish or upload generated assets as part of an export handoff.

## License and provenance

- `LICENSE-MIT` and `LICENSE-APACHE` grant the dual license. `NOTICE` says the ArtCraft name, wordmark, and logos are trademarks not covered by those licenses.
- `NOTICE` also identifies third-party material not covered by MIT/Apache, including Nintendo-derived sound effects, meme images/likenesses, third-party skybox textures, an MMD motion file, and Mixamo animation renders. Preserve `NOTICE` and do not assume every bundled asset is redistributable.

## Pinned source citations

- [README](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/README.md)
- [Development setup](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/_docs/dev_setup.md)
- [Rust workspace](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/Cargo.toml)
- [Frontend manifest](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/frontend/package.json)
- [Tauri configuration](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/desktop/artcraft/tauri.conf.json)
- [API host enum](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/api_clients/artcraft/artcraft_client/src/utils/api_host.rs)
- [Session credits response](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/api_clients/artcraft/artcraft_api_defs/src/credits/get_session_credits.rs)
- [Video cost estimate response](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/api_clients/artcraft/artcraft_api_defs/src/generate/cost_estimate/estimate_video_cost.rs)
- [App data root](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/desktop/artcraft/src/core/state/data_dir/app_data_root.rs)
- [Credentials paths](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/desktop/artcraft/src/core/state/data_dir/app_credentials_dir.rs)
- [Settings paths](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/desktop/artcraft/src/core/state/data_dir/app_settings_dir.rs)
- [Task state paths](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/desktop/artcraft/src/core/state/data_dir/app_state_dir.rs)
- [Activity telemetry](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/crates/desktop/artcraft/src/services/storyteller/threads/storyteller_activity_thread.rs)
- [macOS publish workflow](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/.github/workflows/artcraft-macos-publish.yml)
- [Windows publish workflow](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/.github/workflows/artcraft-windows-publish.yml)
- [MIT license](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/LICENSE-MIT)
- [Apache license](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/LICENSE-APACHE)
- [NOTICE](https://raw.githubusercontent.com/storytold/artcraft/40e04793b504147de97ba1f0659d3975167524e5/NOTICE)
