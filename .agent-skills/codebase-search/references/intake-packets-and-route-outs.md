# Intake packets and route-outs

## Packet chooser
Use one primary packet per run.

| Packet | Use when | Typical request shape | Route-out signal |
|---|---|---|---|
| `exact-text` | User already has a concrete token | env var, route path, error string, import, config key | Once likely files are located and the user wants diagnosis or edits |
| `symbol-indexed` | User needs definitions or references | where defined, who calls this, ownership of interface/class/function | Once must-update vs maybe-affected is clear |
| `structural` | Syntax shape matters more than spelling | missing cleanup, unsafe pattern, codemod prep, repeated API shape | Once findings become migration/remediation planning |
| `config-content` | Repo search spans config, content, templates, or assets | front matter, shortcodes, Terraform/Kubernetes ownership, scene/asset/build-script lookup | Once the owner surface is known and implementation work begins |
| `hosted-search` | Local context is missing or browser flow dominates | PR archaeology, cross-repo lookup, no local checkout | Once the user needs deeper local inspection |
| `graph-path` | The question is about dependency/path tracing across many nodes | call graph, architecture map, graph report, shortest path | Route directly to `graphify` when persistence/graph output is the real ask |

## Repo-shape ladder
- **app repo** → entry point → router/handler → service/module → config/test
- **infra repo** → root/module/overlay → variable/schema → deployment surface → consumer module
- **content repo** → content file/front matter → shortcode/partial/template → build/runtime consumer
- **game repo** → runtime code → engine config → scene/asset/build script → editor/visual graph references

## Quick route-outs
- Search finding turns into hypotheses or reproduction → `debugging`
- Search finding turns into cleanup or staged migration → `code-refactoring`
- Search finding turns into diff judgment → `code-review`
- Search finding turns into persistent architecture mapping → `graphify`
- Search finding turns into log triage → `log-analysis`

## Smell test
If your next paragraph is mostly fixes, redesign ideas, or runtime diagnosis instead of search evidence, `codebase-search` has already done its job.
