# Knowledge Catalog repository operator notes

**Repository:** `GoogleCloudPlatform/knowledge-catalog` at `6888b305651f366d878b084f68f86ff2c3effe2e` (observed 2026-10-16). The pinned README calls the repository tools, agents, and samples for Knowledge Catalog features and explicitly says its contents are not an official Google product. Do not infer a separate database service from this repository.

## Choose the implementation lane

- **OKF reference agent:** `okf/pyproject.toml` defines a Python `reference-agent` console entry point. Its CLI implements `enrich`, accepts BigQuery (`bq`) as the source, requires a dataset, accepts an output bundle path/concept selection and optional web seeds, and can disable web collection. This is a reference bundle-producing agent, not the catalog service itself.
- **`mdcode` / `kcmd`:** the `toolbox/mdcode` package contains the semantic model parser/emitter and deployment flow. Follow current `kcmd --help` and the matching pinned command source before using flags; do not invent commands from README prose.
- **Samples:** the repository also contains enrichment and governance/policy-agent examples. Treat each sample's setup, cloud permissions, and required data separately; do not assume one sample's prerequisites apply to another.

## Semantic-model catalog flow

1. Build/validate the semantic model and resolve its IR. The Knowledge Catalog emitter maps model entities/metrics/actions/constraints into entries/aspects and relationship links.
2. The emitter is a pure mapping layer; it performs no GCP calls or I/O. Built-in `semantic-*`, schema, and guidelines types are referenced, not provisioned there. Custom action/constraint types are created by the `init` setup path.
3. Deployment preflight verifies model/entry-group assumptions, snapshots destination entries to protect foreign models unless a force option changes that behavior, and checks required custom types.
4. Apply creates/updates owned entries in dependency order and writes links. Reconciliation can delete stale owned child entries and obsolete links. This is a mutating cloud operation, not merely a generated file.
5. The source states `push` does not provision entry groups or types; those belong to `init`. The caller needs the documented entry-group permissions. Preserve any warning that many-to-many junction relationships are not emitted as `schema-join` links, and SQL expression fields are off unless explicitly enabled because the published system templates may not include them.

## Safe operating sequence

- Before local setup, inspect the selected subproject manifest and current checkout. Dependency installation/source download requires approval.
- Before cloud work, verify project, location, entry group, required built-in/custom types, and exact ownership/deletion scope. Login and Google Cloud authorization require approval; do not handle secret values in chat.
- Run only a read-only validation/preflight or documented dry-run when requested. A dry-run is not cloud-state proof or authorization to apply.
- Before `init`, resource creation, `push`, link/entry reconciliation, or cleanup, obtain separate explicit approval for the target project and operation. After an uncertain write, inspect destination state before retrying.
- Web seeds in the OKF reference agent invoke external collection; private sources, cloud queries, billing, and any upload have separate data/cost gates. Do not run those commands in this documentation task.

## Common failure distinctions

- **Unknown CLI flag/command:** confirm which subproject's CLI is installed and inspect its pinned/current help; repository contains multiple tool/sample entry points.
- **Model parses but catalog apply fails:** check destination types, entry-group permissions and preflight state; local pure emitter success does not prove cloud acceptance.
- **Missing custom types/entry group:** those are `init` responsibilities, not `push` side effects. Do not silently create them.
- **Missing relationship or expression:** check the pinned emitter's supported link shape and feature flag before treating it as data loss. Junction-table many-to-many edges are documented as skipped in this catalog leg; expression output is gated.
- **Stale owned entry after push:** use ownership/reconciliation evidence and inspect destination before re-running; apply may delete entries owned by the push that are no longer emitted.

## Offline source preflight

The parent-provided helper is documented as:

```bash
python3 .agent-skills/knowledge-catalog/scripts/preflight.py --repo /absolute/upstream --json
```

Installed-root form: `python3 /absolute/installed/knowledge-catalog/scripts/preflight.py --json`. Without `--repo`, the helper performs inventory-only checks. The source path must be explicit, absolute, and nonsymlink. Secure traversal requires Python 3.10+ on POSIX Linux/macOS or WSL2 on Windows; unsupported native platforms fail closed. This describes helper support only, not an upstream repository/tool platform guarantee. The helper is read-only stdlib code, uses no network/subprocess/credential file/writes, and checks command presence only when specified; it compares the selected listed public-file hashes, not Git HEAD, the full revision, dependencies, or remote catalog/runtime. Exit 0 = offline checks passed, 1 = missing/mismatched source, 2 = invalid input; `runtime_verified` remains false. Commands are documentation only.

## Pinned source links

- [Repository overview and disclaimer](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/6888b305651f366d878b084f68f86ff2c3effe2e/README.md)
- [OKF reference-agent manifest](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/6888b305651f366d878b084f68f86ff2c3effe2e/okf/pyproject.toml)
- [OKF CLI implementation](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/6888b305651f366d878b084f68f86ff2c3effe2e/okf/src/reference_agent/cli.py)
- [Semantic catalog emitter](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/6888b305651f366d878b084f68f86ff2c3effe2e/toolbox/mdcode/src/libts/semantic/knowledge_catalog.ts)
- [Deployment/preflight/apply implementation](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/6888b305651f366d878b084f68f86ff2c3effe2e/toolbox/mdcode/src/libts/semantic/deploy_knowledge_catalog.ts)
- [Apache License 2.0](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/6888b305651f366d878b084f68f86ff2c3effe2e/LICENSE.md): full pinned text inspected; repository states all solutions are Apache 2.0. No upstream code is copied here.
