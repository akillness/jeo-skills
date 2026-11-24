---
name: rea
description: "Reverse-engineer binaries and application packages (ELF, PE, Mach-O, APK, IPA, HAP, WASM, ZIP/JAR containers, JavaScript bundles) through the rea MCP server running on the host. Invoke when a task needs static analysis of a compiled or packaged target: embedded secrets, hardcoded endpoints, native library review, string and constant extraction, managed code structure, or deobfuscation."
mcps: rea
---

# rea: binary and application reverse engineering

The rea MCP server runs on the host machine, not inside this container. Its tools are named `mcp__rea__<tool>`. After this skill loads, their names appear as deferred tools: fetch each tool's schema with SearchExtraTools (for example `select:mcp__rea__open_binary`, or keywords like `rea strings`), then invoke it with ExecuteExtraTool. Use the tool that directly answers the question; do not enumerate the whole catalog.

## 1. File paths: container view vs host view

rea opens files on the HOST filesystem, not inside the container. Only files under the bind-mounted data directory are visible to both sides; the exact host prefix is deployment-specific (check the compose file, or ask the operator via task chat when unknown).

Rules:
- Save or download every target file inside your run directory, with a relative path such as `rea/` (your working directory is the run directory, and it sits under the bind-mounted data directory, so both sides can see it). Do not save to an absolute path outside the run directory: the Write tool refuses it. Files elsewhere in the container are invisible to rea.
- Always pass the host-side path in rea tool parameters: take the absolute container path of that directory (`pwd` in the run directory, plus `rea/`) and replace the container data directory prefix with the host prefix of the same mount. If open_binary reports the path as missing, you passed a container path: retry with the host-side equivalent of the same mount.
- Verify the file exists on your side (ls) before opening it with rea.

## 2. Session lifecycle

1. `open_binary` with `path` (host path). For native binaries (ELF, PE, Mach-O) set `provider_id: "ghidra"`; if the error lists candidate provider ids, retry with one of them. Packages and bundles (APK, IPA, HAP, zip, JAR, wasm, JavaScript) need no provider.
2. Run analysis tools (`search_strings`, `list_strings`, `search_procedures`, `inspect_native_*`, `project_managed_application_graph`, family-specific graph tools, ...). Results are Evidence objects: they carry an evidence id, a normalized result, and a limitations section. Record anything task-relevant as facts in the knowledge graph and cite the evidence id in findings.
3. `close_binary` when done. One open target per session; close before opening another. Never leave a binary open at the end of a run.

## 3. What to use it for (authorized targets only)

- Client-side artifacts fetched from an in-scope target: mobile apps (APK, IPA, HAP), desktop binaries, Electron app archives, obfuscated JavaScript bundles, wasm modules.
- Embedded secrets and configuration: API keys, tokens, endpoints, debug flags, test accounts (`search_strings` with patterns like `key`, `token`, `secret`, `password`, `http`, base64 blobs).
- Fingerprinting: sha256 and component inventories identify the exact build and its third-party libraries.
- Deep dives: strings and constants, imports and exports, procedures, managed type graphs, native API usage.

## 4. Practical notes

- Prefer scoped queries (one string pattern, one procedure) over whole-binary deep passes; some analyses take minutes. If the server is configured with a short request timeout, budget accordingly.
- Large results are truncated to the session output limit with spill to disk; narrow the query instead of paging through huge output.
- If a call fails with `capability_unavailable`, read the message: it usually lists the exact candidate provider ids or the remediation to apply.
- rea reads files only; it never executes the target.
- rea cannot see container-only paths; do not try to open files outside the shared data mount.
