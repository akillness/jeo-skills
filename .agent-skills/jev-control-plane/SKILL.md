---
name: jev-control-plane
description: >
  Configure and operate Jev independently for each coding-agent environment,
  including enable/disable, status checks, and API or local backend selection.
  Use when installing the Jev Agent Skill plugin, changing a Jev profile, or
  routing, pruning, or reviewing work with Jev. Jev remains prompt-driven; this
  skill does not install a native hook or guarantee automatic enforcement.
---

# Jev Control Plane

Use this skill to operate Jev for the coding-agent environment that loaded it. The Jev harness is a callable decision service, not an automatic interception hook. A host must follow these instructions and its Jev rule; do not claim that an action was automatically blocked or approved.

## When to use this skill

Use it when installing or configuring Jev for a specific coding-agent runtime, checking or toggling that runtime's profile, switching its backend, or invoking an approved Jev routing/pruning/review command. Do not use it to promise native hooks, automatic enforcement, or unapproved hosted/local execution.

## Instructions

### Select the current agent profile

Use a unique lower-kebab-case profile ID for each independent agent environment, such as `jeopi`, `gjc`, or `aside-u0`. Keep profiles separate even when the skill itself is installed in a shared `universal` root. The profile ID can differ from the runtime install target: `--profile` selects state, while `--agent` selects the Jev skill destination. If the correct profile is unclear, ask rather than using another profile or falling back to the legacy shared config.

Check the profile before using any live Jev operation:

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi status
```

The command returns exit 2 when that profile is disabled or unconfigured. Skip Jev gates in that case and follow the host's normal permission policies. Exit 3 means enabled but unavailable or invalid; fail closed and do not treat an outage as permission to proceed. Exit 0 means configured and not known unavailable, not that host enforcement or model quality has been proven. API status is unverified (`ready: null`) and does not test authentication or make an inference request.

### Install and configure one environment

For a root checkout install, select the agent target explicitly:

```sh
JEO_SKILLS_AGENT=jeopi JEO_SKILLS_JEV=api bash install.sh
```

The optional Jev setup installs this skill for that target and writes that target's profile. Or install only the skill with the router, then configure Jev separately:

```sh
jeo-skill install jev-control-plane --agent jeopi --global --yes
bash ~/.agents/jev/jev-setup.sh --profile jeopi --agent jeopi --mode api
JEO_SKILLS_ASIDE_ACCOUNT=u/0 bash ~/.agents/jev/jev-setup.sh --profile aside-u0 --agent aside --mode api
```

Choose a backend only after the user approves its setup effects:

- `api`: stores a TypeSafe API key in a mode-600 file. Live inference may transmit task/context data and incur charges; obtain separate approval for hosted calls.
- `local`: may install Python dependencies and download the full-precision third-party `autotrust/JEV-9B` model (about 18 GB). Do not start this download or inference without explicit approval.
- `ollama`: may start Ollama and download a quantized third-party model (about 5.6 GB).
- `lmstudio`: may download/load a model and start the local server.

Noninteractive API setup requires `JEV_API_KEY` in the environment. Do not place credentials in prompts, source control, or command history. Setup/status are not inference tests.

### Switch or toggle a profile

```sh
bash ~/.agents/jev/jev-setup.sh --profile jeopi --agent jeopi --mode local
bash ~/.agents/jev/jev-setup.sh --profile jeopi --agent jeopi --mode api
bash ~/.agents/jev/jev-setup.sh --profile jeopi --disable
bash ~/.agents/jev/jev-setup.sh --profile jeopi --enable
```

Each profile has a base file and a mode-specific file under `~/.agents/jev/profiles/`. Switching modes preserves the other mode's settings, including an API key; profile files are private. `--disable` turns off only that profile and retains its settings and credentials for later use. It does not revoke a hosted key or stop a separately running local backend. Use status after a change. Start a full-precision local server with the same profile ID:

```sh
JEV_PROFILE=jeopi ~/.agents/jev/venv/bin/python ~/.agents/jev/jev_local_server.py --profile jeopi
```

A backend can be configured but unavailable. Local/generative status probes only local health/model-list endpoints; they do not prove inference quality. Do not run model downloads, hosted calls, or live tasks just to check the configuration.

### Run an approved Jev operation

After status and any required per-operation approval, pass the same profile to every harness command:

```sh
node ~/.agents/jev/jev-harness.mjs --profile jeopi route-skills "<task>"
node ~/.agents/jev/jev-harness.mjs --profile jeopi prune-context < blocks.jsonl
node ~/.agents/jev/jev-harness.mjs --profile jeopi review "<task>" '<proposal-json>'
```

These commands may send task, context, or proposal data to the configured API and may incur charges. Do not substitute `--mock` results for live authorization. Treat Jev's output as a proposal; preserve uncertainty and apply the host's own permissions and confirmation rules. A `permit` is not proof that code is safe or that a hook enforced the result.

### Keep the legacy boundary

An install without `--profile` continues to use `~/.agents/jev/.env` for backward compatibility. Never use that shared legacy profile as an implicit fallback when a selected agent profile is missing or disabled. This Agent Skill provides instructions only; it does not install native hooks or guarantee that a host runtime loads or obeys the skill.

## Examples

Keep separate state for two runtimes, even if they share a skill root:

```sh
bash ~/.agents/jev/jev-setup.sh --profile jeopi --agent jeopi --mode api
bash ~/.agents/jev/jev-setup.sh --profile gjc --agent gjc --mode local
node ~/.agents/jev/jev-harness.mjs --profile jeopi status
node ~/.agents/jev/jev-harness.mjs --profile gjc status
```

## Best practices

- Check the exact profile before any live operation; never silently switch profiles. Its `JEV_ENABLED` state is stored in the base file, and ambient environment values cannot enable it.
- Request approval before hosted calls that may transmit context or incur cost, and before model downloads or local execution.
- Keep `~/.agents/jev/.env` only for intentional legacy use; profile files must stay private and out of source control.
- Treat status and model-list health as configuration evidence, not proof of inference quality or host enforcement.

## References

- Jev setup and backend limits: `jev/README.md` in the `jeo-skills` checkout.
- Host rule contract: `jev/jev-control-plane.rule.md` in the `jeo-skills` checkout.