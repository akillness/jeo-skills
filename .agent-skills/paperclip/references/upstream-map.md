# Paperclip Upstream Source Map

## Reviewed snapshot

- Repository: [paperclipai/paperclip](https://github.com/paperclipai/paperclip)
- Reviewed commit: [`0f14d261233c545aa6a8a38ec253c498a5130fff`](https://github.com/paperclipai/paperclip/tree/0f14d261233c545aa6a8a38ec253c498a5130fff), dated 2026-09-27.
- License at that snapshot: [MIT](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/LICENSE).
- This catalog skill is a locally authored operator/router guide. It does not vendor or execute Paperclip's scripts, API examples, or upstream skill. Links below are reference material, not instructions to run without checking the installed version and user scope.

## Core skill and references

- [Upstream Paperclip skill](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/skills/paperclip/SKILL.md) — heartbeat/task execution contract and routing.
- [API reference](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/skills/paperclip/references/api-reference.md) — endpoints, payloads, authentication, and mutation context.
- [Company skills](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/skills/paperclip/references/company-skills.md) — catalog/company-library install versus agent assignment.
- [Routines](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/skills/paperclip/references/routines.md) — triggers, concurrency, catch-up, activity gates, and lifecycle.
- [Artifacts](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/skills/paperclip/references/artifacts.md) — attachments, artifact work products, and delivery context.
- [Workflow playbooks](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/skills/paperclip/references/workflows.md) — project setup, imports/exports, and app-level validation flows.
- [Repository README](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/README.md) — supported installation, test-drive, CLI, and runtime requirements.

## Upstream helper scripts

Use these only from a checkout whose commit and script content have been inspected. Neither script is copied into this catalog skill.

- [Issue update helper](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/scripts/paperclip-issue-update.sh) — issue status/comment update with `--dry-run`, heartbeat run-ID propagation, response-body validation, and a bounded retry policy.
- [Artifact upload helper](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/skills/paperclip/scripts/paperclip-upload-artifact.sh) — attachment upload plus an artifact work product by default; `--dry-run` previews settings and `--retry-unknown-upload` accepts duplicate risk after an uncertain transport outcome.

## Version-drift rule

The pinned snapshot explains the contracts summarized here; it does not prove that another Paperclip release has the same CLI, endpoints, permissions, defaults, or helper behavior. Before a live operation, inspect the installed CLI help and version-matched docs/API schema. If the installed release conflicts with this summary, follow its current documented contract and report the discrepancy. Do not turn a source link or a successful dry-run into permission to mutate live state.
