# OpenCreator pinned upstream reference

This reference records `krillinai/OpenCreator` at commit
`b01a9f71165b9010216e25c462653b0cfa33cbce`, observed on 2026-10-17. The root
`LICENSE` at that revision is Apache-2.0. The GitHub Releases page showed
`v3.2.7` as the latest release, published 2026-10-16. The source commit and a
release tag are different evidence: this skill pins source behavior to the
commit above and checks release assets at task time.

## Product boundary

The pinned README describes OpenCreator as a local AI workspace that uses Codex
CLI as its execution engine, adding a local Runtime, visual workspace, and
Desktop host. It separates two connected surfaces:

- **Content workspace:** video translation/download, image and video
generation, voiceovers, article/social writing, short-video scripts, and
stick-figure animation.
- **Agent conversation:** project-scoped conversations and background Runs,
with approvals, attachments, files, Skills, MCP, schedules, notifications,
memory, and diagnostics.

The Web frontend is shared with Desktop; Desktop adds operating-system
capabilities such as directory selection, window/tray lifecycle, and native
notifications. Do not infer that a CLI or Server asset is a Desktop installer,
or that a Desktop installation by itself proves Codex/provider readiness.

Creator services and billing can change by release. The v3.2.7 release notes
refer to gateway service catalogs, model pricing, balance displays, billing
units, account restoration, and top-up confirmation. Verify the selected
provider/model, current price, and current task state in the live app before
spending credits or retrying a request. Do not assume the full creator service
runs locally merely because the application is installed locally.

## Release and installer evidence

At the 2026-10-17 observation, the official release page listed separate
Desktop, KrillinAI Server, and KrillinAI CLI assets for supported operating
systems. It also listed `SHA256SUMS.txt` and stated that optional Remotion
rendering components are downloaded on demand rather than bundled in the
Desktop installer. Manual installation should use only the release's listed
installer for the selected product and platform; updater ZIP/blockmap/latest
metadata are not manual installer substitutes.

Release-specific signing status can change. At v3.2.7 the release page said
macOS installers are signed and notarized and the Windows installer is not
Authenticode-signed. Verify the checksum against the same release's checksum
file before running any asset. Ask for approval before downloads, installation,
security overrides, optional component/model downloads, or replacing an
existing installation.

## Source development and Skills

At the pinned revision, root `package.json` declares `pnpm@9.15.0` and exposes
separate `web:dev`, `daemon:dev`, `desktop:dev`, `desktop:build`, `test`, and
other scripts. `docs/contributing/skills-contributing.md` gives this source
workflow:

```bash
git clone https://github.com/krillinai/OpenCreator.git
cd OpenCreator
corepack enable && pnpm install
cp -r skills/krillinai-tts skills/<your-skill>
# edit skills/<your-skill>/SKILL.md
pnpm web:dev
```

This is source-development guidance, not a permission to clone, install
packages, start services, or modify a Codex home. Dependency installation and
server startup are separate side effects. Re-read the current manifest and
scripts before following these commands on a newer revision.

The upstream Skills guide says a Skill is a folder under `skills/` with a root
`SKILL.md` and optional `references/`; it is a reusable agent workflow, not a
product feature. It asks contributors to verify the Skill in a real
conversation. The project's `skills/` directory and the user's active Codex
home are distinct discovery surfaces. A file being present in either one does
not prove that the intended OpenCreator run loaded or executed it.

## Offline preflight contract

`scripts/preflight.py` is intentionally smaller than an app doctor. Without
`--repo`, it reports host facts and states that no runtime was verified. With
`--repo`, it checks a bounded set of public source paths, requires the requested
path to be the Git top-level, reports local `HEAD`, and optionally compares
that SHA with `--expect-commit`. It does not inspect or execute OpenCreator,
Codex, provider tools, MCP servers, or skills; it does not contact a network,
read credentials, or write configuration. Exit codes are 0 (offline checks
pass), 1 (missing/mismatched prerequisites), and 2 (invalid arguments).
`runtime_verified` remains `false` for every result.

A matching `HEAD` does not attest uncommitted or untracked working-tree
contents. Inspect those separately before source operations. Tool presence,
source markers, and a passing offline result are not proof of installed
versions, app startup, Codex authentication, provider authorization, a live
creator task, or output quality.

## License and reuse boundary

The pinned root `LICENSE` contains the Apache License 2.0 terms. That grant is
for the licensed project work; do not extend it to provider models, downloaded
rendering components, third-party media, fonts/assets, input material, or
outputs without checking their own licenses and service terms. Keep the
upstream license and notices when redistributing covered source. This skill
contains operating guidance, not bundled OpenCreator code or media.

## Source-pinned files

- [Commit](https://github.com/krillinai/OpenCreator/commit/b01a9f71165b9010216e25c462653b0cfa33cbce)
- [README](https://raw.githubusercontent.com/krillinai/OpenCreator/b01a9f71165b9010216e25c462653b0cfa33cbce/README.md)
- [LICENSE](https://raw.githubusercontent.com/krillinai/OpenCreator/b01a9f71165b9010216e25c462653b0cfa33cbce/LICENSE)
- [Root package manifest](https://raw.githubusercontent.com/krillinai/OpenCreator/b01a9f71165b9010216e25c462653b0cfa33cbce/package.json)
- [Skill contribution guide](https://raw.githubusercontent.com/krillinai/OpenCreator/b01a9f71165b9010216e25c462653b0cfa33cbce/docs/contributing/skills-contributing.md)
- [CLI Skill](https://raw.githubusercontent.com/krillinai/OpenCreator/b01a9f71165b9010216e25c462653b0cfa33cbce/skills/krillinai-cli/SKILL.md)
- [Pipeline Skill](https://raw.githubusercontent.com/krillinai/OpenCreator/b01a9f71165b9010216e25c462653b0cfa33cbce/skills/krillinai-pipeline/SKILL.md)
- [TTS Skill](https://raw.githubusercontent.com/krillinai/OpenCreator/b01a9f71165b9010216e25c462653b0cfa33cbce/skills/krillinai-tts/SKILL.md)
- [Observed v3.2.7 release](https://github.com/krillinai/OpenCreator/releases/tag/v3.2.7)
- [Current release selector](https://github.com/krillinai/OpenCreator/releases/latest)
