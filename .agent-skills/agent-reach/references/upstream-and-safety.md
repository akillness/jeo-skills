# Upstream audit and safety boundaries

## Provenance

- Repository: <https://github.com/Panniantong/Agent-Reach>
- Audited commit: `da5044d26fc6adddb6554d5679c94ac22e76e428`
- Audit date: 2026-09-10
- Package metadata: **1.5.0**, Python **>=3.10**; not a claim about the latest published PyPI release.
- [LICENSE](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/LICENSE) is MIT, copyright 2025 Agent Eyes, including the full permission grant, notice-preservation condition, and warranty disclaimer. A copy is retained in [upstream-LICENSE.txt](upstream-LICENSE.txt).
- This is an independently authored operating wrapper and offline checker. It does not vendor or execute the upstream application. Dependencies, external services, and platform content have their own terms.

## Findings that change the workflow

| Finding | Required wrapper behavior | Source |
| --- | --- | --- |
| Setup/doctor/router, not a universal reader | Do not invent `agent-reach read/search/fetch`; call the selected backend directly | [core.py](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/core.py#L1-L28) and [CLI parser](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cli.py#L59-L248) |
| Package requires Python 3.10+ | Separate helper runtime from upstream runtime; pin the source and resolve dependencies explicitly | [pyproject.toml](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/pyproject.toml#L1-L53) |
| Default install is safe mode; system mode mutates | Review `--system --dry-run` before separately approved system changes | [install](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cli.py#L254-L467) |
| Skill installation force-replaces same-name directories | Protect the catalog's own agent-reach wrapper, user edits, and every target path | [skill installer](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cli.py#L469-L631) |
| Doctor is read-only by intent but probes tools/local state | Use the no-execution offline helper before trusting an installation | [doctor](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cli.py#L1972-L1988) and [probe](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/probe.py#L47-L120) |
| Automatic browser import is platform-scoped | Bilibili/Xueqiu only after consent; no all-browser dump or automatic Twitter/XHS export | [cookie extraction](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cookie_extract.py#L198-L331) |
| XHS import may Docker-copy credentials and restart a container | Verify container image, owner, mounts, and destination; matching name is insufficient | [cookie import](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cli.py#L1588-L1823) |
| Audio can go to Groq or OpenAI | Approve input rights, upload destination, charges, and any fallback separately | [providers](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/transcribe.py#L46-L57) and [upload/fallback](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/transcribe.py#L361-L442) |
| Configuration is YAML and may have legacy credential copies | Do not quote config contents; inspect only necessary metadata after authorization | [config.py](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/config.py#L99-L157) and [legacy copies](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cookie_extract.py#L352-L407) |
| Uninstall is not a full cleanup/revocation | Preview deletion; package, tools, MCP entries, and legacy copies can remain | [uninstall](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/cli.py#L1826-L1969) |
| Bundled MCP is status-only | Do not promise search/read tools or recommend nonexistent `[mcp]` extra | [MCP](https://github.com/Panniantong/Agent-Reach/blob/da5044d26fc6adddb6554d5679c94ac22e76e428/agent_reach/integrations/mcp_server.py#L29-L69) |

## Documentation drift, not permission to guess

- Install/update docs recommend moving `main.zip`; this wrapper uses a fixed source revision.
- The install guide's `config.json` example is not the implemented `config.yaml` location.
- Update guidance that doctor refreshes skills does not match the pinned doctor's implementation.
- A bundled MCP hint names `agent-reach[mcp]`, but pyproject defines no such extra. The `all` extra includes MCP plus unrelated browser/cookie dependencies, so do not install it by default.
- README wording about removing mcporter configuration is broader than the implemented uninstall, which preserves existing entries.
- “Zero configuration” and “all free” are not readiness, privacy, or cost guarantees. Many routes require tools, sessions, provider setup, or paid access.

Review the source behavior at the chosen version rather than weakening the wrapper to match an optimistic sentence.

## Data and trust boundaries

The offline helper does not read user configuration, environment secret values, browser stores, or upstream code as Python. It only detects command presence and optionally hashes listed source files. It rejects symlink paths and files over 4 MiB; malformed or missing evidence fails rather than declaring success. Its fingerprint coverage is not a sandbox or comprehensive security audit, and it assumes a quiescent checkout rather than defending against a hostile process racing filesystem reads.

Upstream doctor/safe-mode and backend commands are a different trust layer: they can execute local binaries, read configuration, contact loopback services, or send queries to remote providers. Jina and Exa see the supplied URLs/queries; transcription providers receive audio. Browser integration can access session-visible content. Authorize each boundary separately.

The source has URL filtering, but it does not fully resolve DNS and control every downstream redirect. Do not promise complete SSRF isolation, feed internal/private URLs to a public reader, or operate on confidential media without authorization.

## Upgrade and regression policy

A new version requires a new scoped source review, then a deliberate update to the evidence manifest, references, examples, and tests. Never treat a hash mismatch as an instruction to auto-accept the new bytes. No upstream installer, cookie command, Docker action, paid API, or integration setup belongs in catalog CI.
