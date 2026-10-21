# MemMachine: pinned upstream evidence

Observed 2026-10-15. Repository: [MemMachine/MemMachine](https://github.com/MemMachine/MemMachine/tree/d5a39a8e774e977fb1e6c22efb03555c4e51e05e), commit `d5a39a8e774e977fb1e6c22efb03555c4e51e05e`. Root `LICENSE` is Apache License 2.0. The operator guidance is original and does not copy source implementation.

## Architecture and actual boundaries

README presents MemMachine as an agent long-term memory layer, with episodic, profile, working and persistent memory; the quick-start prerequisite explicitly says a MemMachine server must already be running or the user can choose its hosted platform. Python client, REST, TypeScript and MCP interfaces are separate access surfaces. The server package metadata requires Python >=3.12 and includes dependencies for SQL, graph/vector backends and FastMCP; do not assume a lightweight local library install is equivalent to a server deployment. The pinned `docker-compose.yml` is a multi-service deployment definition, not a read-only client example.

The pinned MCP implementation is actual server code (not only docs). It includes add/search/delete memory operations and organization/project context. Deletion is a data mutation. The stdio server entrypoint is a separate local process interface; HTTP/MCP service behavior is also present. Treat endpoint exposure, auth, organization/project scope and server config as deployment-sensitive; inspect current config before connecting a client. Never send user memories or identifiers to a hosted endpoint without approval.

## Operations and safety

Use this skill when operating the named repo, its server/client/MCP APIs or integrations. Route a general decision among memory architectures to `agent-memory-architecture`; route general MCP server design to `mcp-builder`. First inspect `docker-compose.yml`, server config and the exact endpoint/transport; documentation pages in this pin may be thin redirects, so rely on actual server code for tool behavior.

Require explicit approval before package installation/download, starting the multi-service stack, exposing/registering an MCP server, connecting a hosted service/provider, creating/writing memories, deleting memories, migrating storage, or modifying persistent configuration. For destructive operations, resolve organization/project/session selector and target before proceeding. Check whether remote services, LLM/embedding providers, and database writes are involved.

The source manifest captures the full license, root README, Compose and package metadata, plus the live MCP HTTP and stdio implementation at the pin. See [`source.json`](source.json) for commit blob URLs and exact raw-byte SHA-256 values.
