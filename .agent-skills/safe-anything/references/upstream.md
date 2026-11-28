# Upstream Provenance: `erkamyaman/safe-anything`

- **Repository**: <https://github.com/erkamyaman/safe-anything>
- **Pinned Commit**: `a2d74536418b8f14535e044d9fcf76b5eb946b75` (`2026-11-27`)
- **License**: `MIT`
- **Primary Interface**: `cli`

## Installation & Setup Channels

- Cargo install: `cargo install safe-anything`
- Homebrew: `brew install safe-anything`
- Standalone CLI: `safe-anything scan .`

## Key Architecture & Concepts

- **Single-Binary SAST**: Fast 100% Rust static scanner auditing codebases in seconds without heavyweight JVM or Python daemons.
- **Agent Security Auditing**: Specialized rules inspecting agent configurations (`.claude-plugin`, system prompts, MCP configs) for permission escalation and injection flaws.
- **OSV Integration**: Real-time correlation with the Open Source Vulnerability database for transitive dependency CVE tracking.

## Boundaries & Cross-Routing

- Does not perform active network penetration testing or runtime exploit generation.
- Route out: Dynamic application security testing / penetration tools -> `security`.
