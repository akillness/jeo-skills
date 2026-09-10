# Command and verification packets

Command truth: `agent_reach/cli.py` at
[`da5044d`](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cli.py#L59-L248).
Installed versions may differ. Check trusted installed help before operational use.
Examples below are procedures, not authorization to execute them during skill setup.

## Offline wrapper checks

From the installed `agent-reach` skill directory:

```bash
python3 scripts/agent-reach-check.py
python3 scripts/agent-reach-check.py --source /absolute/path/to/Agent-Reach
python3 -m unittest discover -s scripts -p 'test_*.py'
```

Normal reports are JSON. `--help` and argument errors use argparse's ordinary text.
Exit codes: **0** means a report was generated with no source mismatch; **1** means
listed file bytes differ; **2** means invalid arguments, unsafe paths, malformed
manifest, or unreadable/missing/oversize files. Exit 0 does **not** mean runtime
readiness. Inspect `python_meets_upstream_minimum`, `command_presence`, and
`live_channels_tested` separately. The helper itself needs only Python 3.9+ and
makes no service calls. Use a real checkout path without symlink components or
`..`. The evidence manifest path must also be physical. If an agent exposes its
skill through a symlink, verify that target and invoke the checker from the
physical skill copy rather than weakening its path guard.

Fingerprint matching is intentionally bounded to the manifest-listed files. It
neither verifies Git HEAD nor hashes unlisted source, dependencies, or runtime state.
Re-audit a changed checkout instead of merely replacing expected hashes.

## Pinned package-only installation

Only after the user approves package installation, resolve an existing Python
3.10+ interpreter and a dedicated tool environment. For example, with trusted `uv`
already installed and a verified interpreter path:

```bash
uv tool install --python /absolute/path/to/python3.12 \
  'git+https://github.com/Panniantong/Agent-Reach.git@da5044d26fc6adddb6554d5679c94ac22e76e428'
agent-reach --version
agent-reach --help
```

The interpreter path is a placeholder to replace, not a command to paste blindly.
The package build resolves and installs dependencies, including `yt-dlp[default]`.
The source pin does not lock those dependencies. Do not add browser/cookies/all
extras unless that capability was requested. The source defines `browser`,
`cookies`, `all`, and `dev`, **not an `mcp` extra**. Package installation alone does
not establish a working platform backend or authorize upstream skill replacement.

## Installation preview versus mutation

```bash
# Trusted installed runtime only; explicit preview, no installers invoked.
agent-reach install --env=auto --safe --dry-run
# Preview what system mode would do for one optional backend.
agent-reach install --env=local --system --channels=reddit --dry-run
# Read-only in intended behavior, but executes probes and inspects local state.
agent-reach doctor --json
```

At this revision `--safe` is the default unless `--system` is selected. Safe mode
does not install tools or skills, but performs health checks. Dry-run skips those
channel checks and installation steps. Both still import the installed application
and inspect configuration/environment, so use the wrapper for a truly offline,
no-upstream-execution inventory.

Supported `--channels` selectors: `twitter`, `xiaoyuzhou`, `xiaohongshu`, `reddit`,
`facebook`, `instagram`, `bilibili`, `opencli`, `xueqiu`, `linkedin`, or `all`.
`linkedin` is manual setup and `xueqiu` has no installer step. The 15 doctor channel
names are not interchangeable with these installer selectors. Core setup can run
in system mode even when only one optional channel is selected.

A real `install --system` may use package managers, global npm, tools directories,
yt-dlp configuration, MCP registration, and forceful same-name skill replacement.
Before removing `--dry-run`, disclose the exact plan and check destination backups.
Never use `--channels=all` as a default.

## Credentials and browser-session integration

Prefer hidden input in a trusted interactive terminal after platform/account
consent. Never insert values into these examples, a transcript, or a command log:

```bash
agent-reach configure proxy
agent-reach configure github-token
agent-reach configure groq-key
agent-reach configure openai-key
agent-reach configure twitter-cookies
agent-reach configure youtube-cookies
agent-reach configure xhs-cookies
```

`--from-browser` requires a browser plus a selected platform, but authorization to
install Agent Reach does not authorize cookie-store access. At this revision only
Bilibili/Xueqiu automatic import is supported. For Twitter/XiaoHongShu, use the
user's explicit platform-scoped handoff or an existing browser session instead.
Do not propose automatic export as a workaround.

A stored proxy is not automatically propagated into every external tool. Configure
only the approved child's environment using a secret-aware channel; do not print
proxy credentials or export them globally. `twitter-cli` similarly does not consume
Agent Reach's YAML itself. Credential storage and credential injection are separate.

## Retrieval and transcription

Use the commands in [channels.md](channels.md), not invented `agent-reach read` or
`agent-reach search` wrappers. Upstream `format xhs` is a JSON-from-stdin formatter:

```bash
agent-reach format xhs < /path/to/already-approved-feed-response.json
```

Transcription requires approved media rights, upload, and provider/cost:

```bash
agent-reach transcribe /path/to/approved-audio.mp3 \
  --provider groq -o /path/to/transcript.txt
```

`auto` can select a configured provider. `--allow-provider-fallback` is accepted
only with `--provider auto`; it permits a second provider and must never be added
merely to make a failing task finish.
Do not advertise all transcription as free. Avoid uploading private recordings
when existing subtitles or local tools meet the need.

## Maintenance and removal

| Command | What it actually does | Gate |
| --- | --- | --- |
| `agent-reach check-update` | Contacts GitHub and reports versions | Network check, not an upgrade |
| `agent-reach watch` | One health/update check suitable for an external schedule | Scheduling needs a separate request |
| `agent-reach setup` | Interactive credential/MCP configuration, no dry-run | Explicit changes approved |
| `agent-reach skill --install` | Can replace existing `agent-reach` skill folders | Same-name collision review and backup |
| `agent-reach skill --uninstall` | Removes skill registrations/directories | Deletion approval |
| `agent-reach uninstall --dry-run` | Lists intended removal | Preview only |
| `agent-reach uninstall --keep-config` | Removes skills but retains configuration/secrets | Not credential cleanup |
| `agent-reach uninstall` | Removes its config tree and known skills | Explicit deletion scope |

Uninstall deliberately leaves external tools, the Python package, legacy Twitter
credential copies, and existing mcporter entries. Inspect and separately authorize
any remaining cleanup. Do not run printed uninstall or update suggestions blindly.
After any maintenance, verify the exact changed surface and one approved backend;
do not mistake an installation message for a working integration.
