# Utopia pinned source notes

Observed 2026-10-16 (Asia/Seoul). Upstream: [deeplethe/utopia](https://github.com/deeplethe/utopia), full commit `cda374771577b2d42ed257312864ecf8e067bfbd` (commit time 2026-10-11T03:52:36Z). Selected public file hashes are in [`source.json`](source.json); they are not proof of a full checkout or running service.

## Setup, runtime, and scope

The pinned README describes Utopia as a Rust application with PostgreSQL and pgvector. Documented Docker deployment: `docker compose --profile app up -d`, then open `http://localhost:1516`. Source-build app command: `docker compose -f docker-compose.yml -f docker-compose.build.yml --profile app up -d --build`. Local-development guide starts DB with `docker compose up -d db`, then backend with `cargo run -p utopia-server`. These commands are examples only and have not been executed here. Docker, Rust/build dependencies, DB initialization, application startup and account registration are side effects; require explicit approval first.

The first registered account becomes administrator, and quick start creates a public base readable by everyone. Before using business documents, README says configure chat and embedding model endpoints. The product is a knowledge application with document ingest, graph, search/chat, ontology workbench, review, audit ledger and per-base MCP; it is not merely an ontology library. Facts are bitemporal and corrections link to prior versions rather than overwrite. Model-assisted uncertain decisions flow to review; agent write operations are proposals/human-gated per docs.

Pinned config source says `UTOPIA_` environment prefix and `.env` preload; configuration includes database URL, migration URL, JWT secret, credential sealing key, data directory, cookie settings and registration policy. Never copy default credentials into reports or treat defaults as production-safe. `secret.key` is separate from the DB; data backups without it may not recover sealed credentials. Conversely, including that key alongside DB dumps weakens separation.

Pinned CLI source implements `utopia backup` and `utopia restore`, and marks restore as stubbed in source comments. Backup optionally includes data directory and `secret.key`; default does not include key. CLI commands can invoke `pg_dump`, `pg_restore`, tar and migrations. Read exact `utopia <subcommand> --help` and inspect version before any backup/restore. README documents `docker compose --profile app down -v` as a data-deleting reset; do not run absent explicit, informed approval.

## License and approvals

The full pinned root `LICENSE` is Apache License 2.0. No upstream code is copied into this original operator guidance. Before Docker/build downloads, starting services, registration, importing/uploading documents, provider calls/costs, DB/schema mutation, backup/restore, MCP config, or public deployment, obtain explicit approval for exact operation, data, scope and destination. Ensure customer data transfer is authorized and secrets remain private.

## Preflight helper contract

Expected helper: `python3 .agent-skills/utopia/scripts/preflight.py --repo /absolute/upstream --json`; from installed skill root: `python3 scripts/preflight.py --repo /absolute/upstream --json`. Intended stdlib/read-only, no subprocess/network/secret-file reads. Secure traversal requires Python 3.10+ on POSIX (Linux/macOS); use WSL2 on Windows. Native Windows returns an error rather than weakening symlink protection. PATH checks are discovery only, not version tests. Selected hashes do not attest Git HEAD, full revision, Docker/service or runtime. `runtime_verified` stays false. Exit 0=offline checks passed, 1=missing/mismatched source, 2=invalid input. Do not use `--expect-commit` or claim runtime readiness.
