# Revfactory Harness: provenance and installation

## Identity and evidence

- Source: [revfactory/harness at 92d9f1b](https://github.com/revfactory/harness/tree/92d9f1b29e7af81acebf51a9fcd1832e739a1414).
- Plugin version: **2.1.0**, from `.claude-plugin/plugin.json` and `marketplace.json`.
- License: [Apache-2.0](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/LICENSE).
- Marketplace: `harness-marketplace`; plugin: `harness`; factory skill: `harness`;
  evolution skill: `evolve`. In plugin mode, evolution is `/harness:evolve`.
- [source.json](source.json) records SHA-256 for 18 public source files. The local
  helper verifies bytes as well as Git HEAD, so local edits cannot pass on HEAD alone.
- This package is independently authored operational guidance, not a vendored plugin.
  No upstream templates or executable runtime are copied into jeo-skills.

The user-supplied [Korean README](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/README_KO.md)
explains the three execution modes, six team patterns, and construction/evolution split.
Read the [quickstart](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/docs/quickstart.md)
for the original installation flow. These documents describe upstream behavior; they
are not evidence that any given Claude build exposes those tools.

## 1. Install this catalog guide only

Use the existing router; do not create another installer:

```bash
jeo-skill install revfactory-harness --global --dry-run
jeo-skill install revfactory-harness --global --yes
python3 "$SKILLS_ROOT/revfactory-harness/scripts/preflight.py" --json
```

On shared-root/symlink installations, refresh the shared root only. Do not invoke
per-host copy installs over symlinked slots. Catalog installation does not add a
Claude marketplace, activate a plugin, or create agents in the user's project.

## 2. Pin a separate source checkout, after approval

Choose a new, user-approved destination; never clone over an existing project:

```bash
git clone https://github.com/revfactory/harness.git /path/to/revfactory-harness-source
git -C /path/to/revfactory-harness-source checkout --detach 92d9f1b29e7af81acebf51a9fcd1832e739a1414
python3 "$SKILLS_ROOT/revfactory-harness/scripts/preflight.py" --json \
  --repo /path/to/revfactory-harness-source \
  --expect-commit 92d9f1b29e7af81acebf51a9fcd1832e739a1414 \
  --project /path/to/target-project
```

Exit codes follow the other operators: **0** offline checks pass (warnings may remain),
**1** blocked prerequisite/source/path, **2** invalid input or source manifest.
`runtime_verified` is always `false`. Presence on PATH does not authenticate Claude,
inspect provider secrets, query model availability, or prove any session tool exists.

## 3. Choose exactly one upstream installation mode

### Claude plugin (preferred)

After approval, run these **inside Claude Code**, not a shell:

```text
/plugin marketplace add /absolute/path/to/revfactory-harness-source
/plugin install harness@harness-marketplace
/plugin list
```

The local path must point to the checkout that passed the source check. Adding a
marketplace and installing its plugin are persistent host changes, separate from
catalog installation. Confirm the displayed plugin identity/version and loading;
if installed but disabled, the upstream quickstart documents:

```text
/plugin enable harness@harness-marketplace
```

The upstream remote shorthand `/plugin marketplace add revfactory/harness` follows
the remote repository rather than guaranteeing this audited commit. Treat an update
as a new source audit. Do not claim a local-path registration is automatically frozen
if someone subsequently edits or updates its checkout.

### Direct skill copy (alternative, not additive)

The upstream README also documents these shell commands from its checkout:

```bash
cp -r skills/harness ~/.claude/skills/harness
cp -r skills/evolve ~/.claude/skills/harness-evolve
```

They are **not collision-safe installers**. Inspect both source and destination,
resolve shared-root ownership, and get explicit approval before using them. Never
merge into an existing directory, follow a destination symlink, restore a retired
catalog copy, or install the same upstream skills via both modes. In direct-copy mode
use `/harness-evolve`; plugin namespace `/harness:evolve` is not created by copying.
The upstream evolve file still names itself `evolve`; verify actual discovery and
invocation rather than assuming folder rename alone proves loading.

## Runtime and cost boundaries

Upstream asks for a current Claude Code but does not specify a minimum version.
It documents `Workflow`, `Agent(name:)`, `SendMessage`, task tools, and model aliases
`fable`, `opus`, `sonnet`. Inspect the actual selected session before using any of
these; aliases and parameters are host/version/provider dependent. Missing native
capabilities are a reported blocker, not a reason to invent an API or silently change
execution modes. Another coding host can read the operator guide without gaining a
Claude-native runtime.

The plugin generates `.claude/agents/`, `.claude/skills/`, and a small `CLAUDE.md`
pointer/history. Executing the generated team can invoke paid models and project
commands. Keep scope, destinations, token budget, retry/concurrency limits, and host
permissions explicit. No experimental-team flag is required by the pinned docs.
Upstream's v1 A/B numbers are author-reported research, not measured v2 performance
or a guarantee for this catalog integration.
