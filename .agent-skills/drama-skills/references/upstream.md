# Drama Skills upstream map

## Provenance snapshot

Research snapshot date: 2026-08-25.

| Field | Value |
|---|---|
| Repository | `https://github.com/zenstory-ai/drama-skills` |
| Snapshot HEAD | `b7846a01650c6c139e43c3402b6f54b2051ed86a` |
| Latest release at snapshot | `v0.6.0` |
| License | MIT |
| Runtime | Python 3.9+, standard library for normal tools |
| Installable skills | 10 under `skills/` |
| Maintainer-only skill | `maintainers/skills/short-drama-knowhow` |

Current live source always wins over this snapshot. Record the local checkout
commit before operating, then use commit-pinned GitHub links in durable reports.

## Primary sources

- Repository: <https://github.com/zenstory-ai/drama-skills>
- English README: <https://github.com/zenstory-ai/drama-skills/blob/b7846a01650c6c139e43c3402b6f54b2051ed86a/README_EN.md>
- Chinese README: <https://github.com/zenstory-ai/drama-skills/blob/b7846a01650c6c139e43c3402b6f54b2051ed86a/README.md>
- License: <https://github.com/zenstory-ai/drama-skills/blob/b7846a01650c6c139e43c3402b6f54b2051ed86a/LICENSE>
- Creator workflow walkthrough: <https://github.com/zenstory-ai/drama-skills/blob/b7846a01650c6c139e43c3402b6f54b2051ed86a/docs/comic-drama-workflow.md>
- Design: <https://github.com/zenstory-ai/drama-skills/blob/b7846a01650c6c139e43c3402b6f54b2051ed86a/DESIGN.md>
- Changelog: <https://github.com/zenstory-ai/drama-skills/blob/b7846a01650c6c139e43c3402b6f54b2051ed86a/CHANGELOG.md>
- Contributing: <https://github.com/zenstory-ai/drama-skills/blob/b7846a01650c6c139e43c3402b6f54b2051ed86a/CONTRIBUTING.md>
- v0.6.0 release: <https://github.com/zenstory-ai/drama-skills/releases/tag/v0.6.0>

## Stage source map

| Skill | Primary source |
|---|---|
| router/project ops | `skills/short-drama/SKILL.md` |
| novel analysis | `skills/short-drama-novel-analyze/SKILL.md` |
| development | `skills/short-drama-develop/SKILL.md` |
| screenplay | `skills/short-drama-write/SKILL.md` |
| visual assets | `skills/short-drama-assets/SKILL.md` |
| image prompts | `skills/short-drama-image-prompts/SKILL.md` |
| storyboard | `skills/short-drama-storyboard/SKILL.md` |
| video prompts | `skills/short-drama-video-prompts/SKILL.md` |
| paid production | `skills/short-drama-produce/SKILL.md` |
| review | `skills/short-drama-review/SKILL.md` |

For a task, open one stage source and only its needed references. Do not load the
whole repository, evaluation corpus, or novel fixture into the agent context.

## Important version notes

### v0.6.0 creator-first break

v0.6.0 changed the default project workflow to five creator Markdown documents.
The release notes call this a breaking upgrade and recommend that v0.5 projects
stay pinned instead of mixing v0.5 and v0.6 artifacts in one directory.

### Main ahead of release

At the snapshot, `main` was ahead of v0.6.0. Notable unreleased changes included
Windows Dashboard hardening and a clarified storyboard image-reference contract:

- `IMG-*` is a prompt-entry locator;
- `REF-*` is a stable slot for a real input reference image;
- input paths remain project-relative.

Re-read the current changelog and affected stage sources before relying on an
unreleased behavior.

## Trust and safety observations

The snapshot inspection found:

- no package manifest or third-party runtime dependency;
- no `curl | bash`, `sudo`, shell-eval, obfuscated payload, or telemetry path;
- most scripts are stdlib-only offline validators;
- outbound HTTP is isolated to optional provider adapters;
- production adapters use environment credentials;
- adapter configuration must live outside the project;
- subprocess execution uses argument arrays instead of a shell;
- the Dashboard is loopback-only with per-launch tokens and guarded writes;
- media execution is fingerprinted and confirm-gated.

These observations are not a permanent guarantee. Review diffs before updating a
linked checkout, especially changes to:

```text
skills/short-drama-produce/scripts/production_tool.py
skills/short-drama-produce/scripts/provider_adapters.py
skills/short-drama/scripts/dashboard_server.py
skills/*/SKILL.md
```

## What to adapt versus reference

Adapt into local routing docs:

- stage ownership and route-outs;
- the five-document creator contract;
- install and diagnostic commands;
- confirmation and credential safety rules.

Reference upstream rather than copying:

- genre cards and story craft;
- dialogue and screenplay recipes;
- shot grammar and visual lexicons;
- evaluation corpora and golden projects;
- provider-specific details likely to drift.

MIT permits reuse with attribution, but copying large evolving craft references
creates stale parallel documentation. Prefer pinned links and small verified
summaries.
