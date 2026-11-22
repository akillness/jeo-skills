# Installation

The canonical skill is the complete [`skills/3dviz-pro-max/`](../skills/3dviz-pro-max/) directory. Folder copying is the initial installation path. A packaged archive or plugin is not host-tested merely because it can be built or extracted.

## Portable folder installation

1. Obtain a local checkout of this repository at the revision you want to try:
   `git clone https://github.com/viettranx/3dviz-pro-max.git`.
2. Locate your agent's documented skill directory. Use a project-local directory when you want the skill available only in that project.
3. Copy the whole `3dviz-pro-max` folder into that directory. Do not copy only `SKILL.md`.
4. Refresh skill discovery or start a new session, as required by your host.
5. Ask the agent to identify the skill and read its local entrypoint. Then try the recognition prompt below.

Expected layout:

```text
<your-agent-skill-directory>/
└── 3dviz-pro-max/
    ├── SKILL.md
    └── ... accompanying data and references
```

> Find the installed 3dviz-pro-max skill. Tell me which local entrypoint you loaded and which pilot recipe fits a fantasy village. Do not generate the scene yet.

This checks discovery and file access. It does not prove that the agent can render or inspect 3D content. Next, try a [scene prompt](prompt-gallery.md) and verify the output in your runtime.

### Templates are copied, not installed

The skill's `templates/` directory ships plain text: `.md` documents and `.js`, `.html` and `.css` starting files. It contains no dependency folder and no build output, so nothing in it can be installed or built where it sits. Copy the scaffold or the rigs you want into your own project directory first, then run `pnpm install` there:

```sh
cp -r <skill>/templates/scaffold-vite-threejs my-scene
cp -r <skill>/templates/rigs my-scene/rigs
cd my-scene && pnpm install && pnpm dev
```

Installing inside the skill folder would leave a dependency directory in a location the packaging step rejects.

## Codex

Codex is the first evaluation target. Install the folder in a skill location recognized by your installed Codex version. Check that the skill appears in the app/session's available skills, and use its name explicitly in your first prompt.

The intended plugin route still needs an actual install, invocation, update, and removal test. There is no verified public marketplace listing to paste into an installer. Do not treat a local package build as an app compatibility result.

## Claude Code

Claude Code reads the same `skills/3dviz-pro-max/` folder two ways. Pick one; do not install both, or the agent may load the older copy.

**Skill folder (personal or project).** Copy the folder to `~/.claude/skills/3dviz-pro-max/` for every project on the machine, or to `<project>/.claude/skills/3dviz-pro-max/` for one repository. Claude Code follows a symlink here, so a checkout you are editing can be linked instead of copied:

```sh
ln -s "$(pwd)/skills/3dviz-pro-max" ~/.claude/skills/3dviz-pro-max
```

Start a new session and run the recognition prompt above; the skill is invoked as `/3dviz-pro-max` and Claude also loads it on its own when a prompt matches the description in `SKILL.md`.

**Plugin.** The repository root is also a Claude Code plugin: `.claude-plugin/plugin.json` beside `.codex-plugin/plugin.json`, both pointing at the one `skills/` tree. Load it from a checkout or from the packaged ZIP without installing anything:

```sh
claude --plugin-dir /path/to/3dviz-pro-max
claude --plugin-dir 3dviz-pro-max-0.1.0-plugin.zip
```

Plugin skills are namespaced by the plugin name, so the menu entry reads `/3dviz-pro-max:3dviz-pro-max`. From a checkout, `claude plugin validate --strict .` checks the marketplace manifest and `claude plugin validate --strict .claude-plugin/plugin.json` the plugin manifest together with the skill tree; the validator reads directories, not ZIPs, and does not follow a symlinked `skills/`.

**Marketplace.** `.claude-plugin/marketplace.json` lists the repository itself (`source: "./"`), so the install from [github.com/viettranx/3dviz-pro-max](https://github.com/viettranx/3dviz-pro-max) is:

```text
/plugin marketplace add viettranx/3dviz-pro-max
/plugin install 3dviz-pro-max@3dviz-pro-max
```

A local checkout can be added the same way with its path in place of `viettranx/3dviz-pro-max`. An install from this source clones the whole repository, evidence and showcase media included; a release should switch the marketplace entry to the packaged plugin ZIP (`"source": "archive"`).

Observed on 2026-09-09 with Claude Code 2.1.265 on macOS: `claude plugin validate --strict` passes for both manifests; a headless session started with `--plugin-dir` on the checkout and on the packaged ZIP listed the skill and read `SKILL.md` and a reference file. Marketplace install, update and removal, and the personal-folder route, were not exercised in that run. None of this proves rendering: run a [scene prompt](prompt-gallery.md) and inspect the frames.

## Claude app

The Claude app has its own upload path and runtime with no public specification this repository can cite. The portable skill ZIP built below has `SKILL.md` at the root of the `3dviz-pro-max/` folder, which is the layout a skill upload expects, but size limits and script execution there are unverified. A Claude Code result does not establish Claude app compatibility.

## Build a local archive

From a checkout, run `python3 scripts/package.py`. It validates the catalog and generates a portable skill ZIP, a plugin ZIP carrying both the Codex and Claude Code manifests over one `skills/` tree, a content manifest, and `SHA256SUMS` under `dist/`. The archives share the canonical skill contents; the plugin ZIP loads directly with `claude --plugin-dir`. Local builds and official metadata checks have passed; host discovery, invocation, update and removal still require actual app tests. There is no published download URL yet.

## Update and uninstall

Record the revision you installed. For an update, preserve any local customization outside the installed copy, replace the complete folder from the chosen revision, and refresh discovery. Avoid merging individual old and new data files. Re-run the recognition check.

To uninstall a manual copy, remove only the `3dviz-pro-max` directory you installed and refresh discovery. Keep generated scene projects and their evidence unless you separately choose to remove them. Plugin-managed installs should be updated or removed through their host once that path is verified.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Skill not found | Correct host skill directory; `SKILL.md` directly inside the named folder; discovery refreshed |
| Claude Code plugin not listed | Run `claude plugin validate --strict .claude-plugin/plugin.json` from the checkout; pass the checkout or the plugin ZIP to `--plugin-dir`, not the skill folder |
| Agent loads old instructions | Duplicate copies in user and project locations; identify the actual entrypoint loaded |
| References cannot be read | Entire canonical folder copied with its relative structure intact |
| Python helper unavailable | Python 3 accessible to the agent; consult the helper's requirements rather than assuming an app bundles it |
| Scene cannot open or render | Agent has file/runtime access and a suitable browser; see [compatibility](compatibility.md) |
| `capture.py` exits 3 | Playwright is optional and not bundled; install it as below |
| `capture.py` exits 4 | The scene never set `window.__sceneReady === true`; use `--ready-flag none` for scenes without the viewer contract |

Screen capture is optional. Nothing else in the skill or the repository checks requires it. To enable it:

```sh
pip install playwright
playwright install chromium
```

Both steps are needed: the second downloads the browser the first cannot use without. An existing browser cache from other tooling may not match the version Playwright expects, so run the install rather than assuming a cached build is reused. Without Playwright, `capture.py` exits 3 with this hint and the agent must report that no frame was observed instead of describing one.

Blender is optional in the same way. Blender 4.2 LTS or newer is **recommended, not required**: without it every script still runs and the quality ceiling for a kit is T2, the runtime tier that draws its textures and occlusion in the browser. With it, `skills/3dviz-pro-max/scripts/hero-tier.py` bakes a T3 hero GLB from a kit module's own geometry; a missing Blender is reported as `{"status": "unavailable"}` at exit 0 and nothing is faked. The two heroes that ship (`timber-cottage-t3.glb`, `watermill-t3.glb`) were baked with the version each record states in `tiers.T3.blender`. On macOS the binary is usually off PATH at `/Applications/Blender.app/Contents/MacOS/Blender`; `blender_locate.py` searches the standard install paths per platform, so no PATH edit is needed.

The same instructions appear on the project landing page, which reads this file at build time; see [the landing page notes](site.md) for how that page is built and deployed.

The repository's own code, data and authored media are released under the [MIT license](../LICENSE). Third-party material keeps its own terms: the BodyParts3D anatomy meshes are credited under CC BY-SA 2.1 Japan, the bundled fonts under the SIL Open Font License 1.1, and the author-supplied Harness Village recording carries redistribution rights that are still to be confirmed. Installation instructions do not grant rights over that third-party material.
