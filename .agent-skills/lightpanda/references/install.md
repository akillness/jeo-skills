# Installation and offline inspection

## Evidence and selection

- The official stable release [1.0.2](https://github.com/lightpanda-io/browser/releases/tag/1.0.2) resolves to source commit `c5f7bb29b127040c899d4e181b5709f76fc71a6f`. The separately reviewed [main README](https://github.com/lightpanda-io/browser/blob/8f2c8185c97e3cc98de07f164e7eb3d9e2dd9020/README.md) is newer. Stable already documents fetch, CDP, MCP and agent mode; check the selected artifact's help rather than assuming every feature matches either source snapshot.
- The [release API metadata](https://api.github.com/repos/lightpanda-io/browser/releases/tags/1.0.2) lists assets and SHA-256 digests. Match the exact OS and CPU and compare the downloaded file's SHA-256 to that release metadata before execution. A checksum from the same source is an integrity check, not independent proof of authenticity. Check current release provenance and trust policy. Nightly, Homebrew and AUR are mutable; record the actual artifact and digest if using them.
- Official builds: macOS and Linux x86_64/aarch64; Linux binaries require glibc, not Alpine musl or Android Bionic. Native Windows is not supported; use Linux inside WSL2. No runtime was tested by this skill's offline inspection.

## Doctor contract

Set `SKILL_DIR` to the absolute directory containing the loaded Lightpanda SKILL.md. `python3 "$SKILL_DIR/scripts/doctor.py" [--binary PATH]` reads host/platform metadata, checks an explicit candidate or searches `PATH` for `lightpanda`, and prints one JSON object. It makes no network requests, does not run the candidate, and writes no files. It does not establish executable authenticity, version, architecture of the binary, libc compatibility, or successful operation.

- `platform`, `architecture`, `platform_supported`: coarse host fit only. Linux is true only when libc detection identifies glibc; musl, Android Bionic and unknown libc are false. Supported OS/CPU and detected libc still do not prove binary compatibility or runtime readiness.
- `libc.name`, `libc.version`: Python's host detection, with names `glibc`, `musl`, `bionic`, `unknown`, or `not_applicable`. Detection can be inconclusive, especially for musl; unknown is not evidence of support. Android is reported as Bionic and unsupported.
- `stable_release.version` is `1.0.2`; `stable_release.asset` suggests the official asset name from detected OS, CPU and, for Linux, glibc. Unsupported or unknown combinations return `null`. This is a host-based suggestion only: it does not download anything, inspect the candidate binary's version or architecture, or verify compatibility, digest, provenance or successful execution.
- `binary.path`, `found`, `regular_file`, `executable`, `error`: candidate path and local file metadata; `path` is null if PATH search finds no executable candidate. PATH lookup uses `shutil.which` and excludes non-executable files; a null result does not prove no file exists or distinguish inaccessible search locations. Pass an explicit path for its stat error. Symlinks are followed; permission information does not prove execution will succeed. An explicit or resolved candidate that fails stat with an error other than ENOENT/ENOTDIR returns null status fields and an error object with `errno` and `message`.
- `telemetry_env`: `set` only for the exact value `true`, `unset` if missing, otherwise `other`. This describes the doctor process environment, not a future process.
- `network_accessed` and `binary_executed` are false. Exit 0 means inspection completed, including when the binary is absent; inspection errors exit 1 and argparse errors exit 2.

## Approved installation and execution

Do not install, download, change permissions, configure the user environment, or execute anything without the corresponding explicit approval. After download approval choose the matching named release asset from the official release, verify the SHA-256, and only then seek approval to install or run it. Do not silently overwrite an existing file. Package-manager, Docker, source builds and WSL setup each make separate changes and may require additional downloads; seek explicit approval for that exact route.

The upstream stable README's Homebrew and AUR examples install **nightly**, not pinned 1.0.2. Docker pulls an image and its documented example starts a container and opens a port; source builds, package managers and WSL modify their own environment. Decide which effects and rollback are acceptable before approval. Record the destination, prior file or package version, and configuration changes; do not replace an existing artifact without a recoverable backup and specific approval.

If a downloaded digest differs, stop and do not execute the artifact. If Linux says `cannot execute: required file not found`, the upstream README identifies a missing glibc loader as one possible cause on musl or Android, not a universal diagnosis. Check architecture, interpreter and filesystem permissions before changing the host; doctor alone cannot distinguish those failures. If a port is in use, identify its owner rather than killing an unrelated process.

To roll back, stop only the server or container created for this operation, remove only the newly installed artifact or integration after explicit approval, and restore a recorded prior version/configuration if one was replaced. Use the relevant package manager's removal procedure only for packages installed by that route; do not remove shared dependencies or user data. Report what was actually restored and what remains.

Once execution is approved, the local version probe is:

```bash
LIGHTPANDA_DISABLE_TELEMETRY=true /path/to/lightpanda version
LIGHTPANDA_DISABLE_TELEMETRY=true /path/to/lightpanda --help
```

Never substitute `version --check`: its separate update request contacts `telemetry.lightpanda.io`, even when telemetry is disabled. Inspect the installed version's help after permission rather than assuming the pinned main command surface.

Source: [main CLI](https://github.com/lightpanda-io/browser/blob/8f2c8185c97e3cc98de07f164e7eb3d9e2dd9020/src/main.zig), [updater](https://github.com/lightpanda-io/browser/blob/8f2c8185c97e3cc98de07f164e7eb3d9e2dd9020/src/Updater.zig).
