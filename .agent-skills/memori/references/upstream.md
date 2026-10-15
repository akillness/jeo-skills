# Memori: pinned upstream evidence

Observed 2026-10-15. Repository: [MemoriLabs/Memori](https://github.com/MemoriLabs/Memori/tree/574b1ea3e876f100ef82c37817d603eb7e258e59), commit `574b1ea3e876f100ef82c37817d603eb7e258e59`. GitHub's repository API returned `NOASSERTION`; the complete root `LICENSE` file at this pin contains Apache License 2.0 terms. Describe this as file-level license evidence and do not replace it with the API label. This skill is original operator guidance, not copied code.

## Product/runtime distinction

README describes Memori as agent-native, LLM/framework/datastore-agnostic memory infrastructure, with separate cloud, BYODB and SDK routes. The `memori.memory.Manager.execute` implementation branches on `config.cloud`: cloud mode calls its API handler, while non-cloud mode invokes a local `Writer`; the storage builder source has SQLite, PostgreSQL and MySQL dialect handling. These are implementation options, not a claim that a database is already provisioned or that every adapter is available in every distribution. Config initializes `cloud` as `None`; do not infer the selected mode from product marketing or package install alone.

The README advertises Python and TypeScript SDKs and Memori Cloud. Configuration/source logic also carries cloud endpoint, embedding, LLM and Rust-core settings. Check the exact language package and selected mode before advising setup. Cloud mode may transmit conversation-derived data to the service; local/BYODB paths can write persistent application database state and may need migrations.

## Safe operation

Use for the exact Memori project/SDK, runtime memory behavior, configuration or storage backend. Route product-neutral storage architecture decisions to `agent-memory-architecture`; route general model orchestration/agent code to its framework owner. Start with source/config inspection, don't activate a cloud account, provision databases, execute migrations, or run conversation traffic by default. Require explicit approval before installing packages, registering provider/client integrations, sending user content, spending provider credits, writing or deleting memories, initializing storage, or applying migrations. Verify the selected `cloud`/BYODB/storage mode and exact destination first.

The GitHub metadata license discrepancy, inspected license, package manifest, CLI/config/manager implementation and storage builder are covered by [`source.json`](source.json), including pinned URLs and raw-byte hashes.
