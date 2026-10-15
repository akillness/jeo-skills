---
name: "knowledge-catalog"
description: "Work with GoogleCloudPlatform/knowledge-catalog, a repository of Google Cloud Knowledge Catalog samples, agents, and tools. Use when inspecting its OKF reference-agent, mdcode/kcmd semantic-model catalog workflows, sample enrichment/governance agents, or their deployment and troubleshooting. This repository is not itself an independent database product or an official Google product."
allowed-tools: Bash Read Grep Glob
metadata:
  version: 1.0.0
  source: https://github.com/GoogleCloudPlatform/knowledge-catalog
  upstream_commit: 6888b305651f366d878b084f68f86ff2c3effe2e
---

# Knowledge Catalog repository

## Instructions

1. **Route by component, not name.** This exact repository contains tools, agent samples, and examples around Google Cloud Knowledge Catalog/Dataplex. It is not a standalone database implementation, and its own README says the repository is not an official Google product.
2. **Identify the path:** OKF `reference-agent` enrichment, mdcode's `kcmd` semantic-model workflow, or a particular sample. Consult `references/upstream.md` and `references/source.json` for the pinned entry points before advising.
3. **Separate local transformation from cloud operations.** The mdcode semantic emitter is a pure IR-to-resource mapping; deployment orchestration reads/writes catalog entries and links. `init` provisions destination scaffolding; `push` is a cloud write/reconcile operation. Do not describe a code-generation dry-run as a deployment or assume `push` provisions entry group/types.
4. **Keep scope and version explicit.** Use pinned source evidence as a snapshot, then inspect the user's checkout and current CLI help for drift. Record destination project, location, entry group, model scope, and feature flags before explaining a push.
5. **Gate external effects individually.** Approval is required before installing packages, downloading/cloning sources, changing credentials/config, logging in or authorizing Google Cloud, reading private documents, accessing cloud projects, creating cloud resources, writing catalog entries/links, destructive reconciliation, public service activation, or paid uploads. A local dry-run is not authorization to apply.
6. **Troubleshoot with evidence.** Compare source/model validation, destination type availability, IAM permission and entry-group scope, preflight snapshot, apply result, and reconciliation separately. Do not retry a possibly completed write without reading destination state first.
7. Link the pinned evidence, source manifest, evals, and parent preflight helper. That helper hashes only listed source files; it cannot prove HEAD, dependency state, cloud configuration, or runtime behavior.

## Examples

- "Explain why `kcmd push` failed for my semantic model." → Inspect model scope, required custom types, destination permissions and preflight result before suggesting an apply.
- "Is knowledge-catalog a Google database product?" → Clarify the repo's sample/tool nature and explicit non-official-product disclaimer.
- "Set up a new independent vector database." → Route to database/platform selection, not this repository-specific skill.

## Best practices

- Keep OKF bundle generation, Knowledge Catalog resource emission, and cloud deployment as distinct layers.
- Treat preflight as a guard, not an authorization token; inspect foreign entries and owned-resource deletion scope.
- Preserve the documented boundaries: `kcmd push` does not provision entry groups/types; unsupported relationship shapes may be skipped; optional expression fields are gated because system templates may not accept them.
- Never claim a project is deployed or operational based solely on repository source or successful local validation.

## References

- [Pinned operator notes](references/upstream.md)
- [Pinned file hashes and license](references/source.json)
- [Evaluation scenarios](evals/evals.json)
- [Offline source preflight](scripts/preflight.py)
