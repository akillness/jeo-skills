# Hyper-Extract pinned source notes

Observed 2026-10-16 (Asia/Seoul). Upstream: [yifanfeng97/Hyper-Extract](https://github.com/yifanfeng97/Hyper-Extract), full commit `190dbf561df2c6e72af3f05b59b6abaf54b8a130` (commit time 2026-10-15T15:05:01Z). Selected raw-file hashes are in [`source.json`](source.json); they are not a full-revision or runtime attestation.

## Setup and CLI

Pinned README documents Python 3.11+ and installation with `uv tool install hyperextract` (or pipx). The CLI executable is `he`; `he --help`, `he list template`, and `he config --help` are documented. Example: `he parse examples/en/tesla.md -t general/biography_graph -o ./output/`, followed by `he search ./output/ "What are Tesla's major achievements?"`. Templates, methods, parsing/export, search and MCP are distinct surfaces; consult installed help and pinned docs for supported input types and current flags.

The provider setup examples in README write API keys through CLI options such as `he config init -p openai -k ...`; never put literal credentials into chat, shell history, examples, or reports. The pinned config implementation uses `~/.he/config.toml` and attempts owner-only permissions (0600 on POSIX, ACL hardening on Windows). Check existing config before replacing it. Provider configuration may route private documents to a third party and incur charges. Local vLLM examples still require a separately running compatible service and do not imply it is ready.

## MCP, data and limits

The project exposes an MCP server module, but an available entrypoint is not evidence of client setup, transport security or tool authorization. Inspect pinned docs/source for the exact MCP launch and tool surface before registration. Hyper-Extract is a document-to-knowledge extraction CLI, not a general RDF graph database, ontology editor, or certified semantic reasoner. Inspect template-specific output schema and validation before treating extracted facts as ground truth. Preserve source documents, extracted output and indexes separately; never overwrite originals without approval.

## License and approvals

The full pinned root `LICENSE` is Apache 2.0. This authoring is original operator prose and does not vendor code. Before installing packages, downloading models, parsing/uploading sensitive docs, using a provider, incurring costs, changing config, writing outputs/indexes, starting/registering MCP, mutating a database, or public deployment, obtain explicit approval for the specific action and destination. Do not request or reveal API key values.

## Preflight helper contract

Expected helper: `python3 .agent-skills/hyper-extract/scripts/preflight.py --repo /absolute/upstream --json`; from installed skill root: `python3 scripts/preflight.py --repo /absolute/upstream --json`. Intended helper is stdlib/read-only, with no subprocess/network/secret-file reads; secure traversal requires Python 3.10+ on POSIX (Linux/macOS), and Windows should use WSL2. Native Windows returns an error rather than weakening symlink protection. PATH checks are discovery only, no version test. Hashes cover selected pinned public files only, not Git HEAD/full revision, package installation, provider credentials, service or runtime. `runtime_verified` is always false. Exit 0=offline checks passed, 1=missing/mismatched source, 2=invalid input. Do not use `--expect-commit` or advertise runtime readiness.
