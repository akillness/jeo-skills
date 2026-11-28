---
name: safe-anything
description: >
  Run erkamyaman/safe-anything, a high-performance 100% Rust static vulnerability scanner auditing code for XSS, SQL injection, leaked secrets, risky mobile/cloud configurations, dependency CVEs via OSV, and AI agent setup weaknesses. Use when performing pre-commit security audits, scanning agent instructions (.claude-plugin, system prompts) for prompt injection or permission leaks, verifying secrets in git trees, or integrating automated SAST in CI pipelines. Do not use for dynamic penetration testing or network exploit fuzzing (route to security). Triggers on: safe-anything, rust security scanner, agent vuln scan, secret scanning, osv cve check, erkamyaman/safe-anything.
allowed-tools: Read Glob Grep Bash
compatibility: Rust cargo 1.80+, safe-anything CLI binary, git. Preflight runs offline in Python 3.10+.
license: MIT
metadata:
  version: "1.0.0"
  source: https://github.com/erkamyaman/safe-anything
  upstream_commit: a2d74536418b8f14535e044d9fcf76b5eb946b75
  pinned_at: "2026-11-27"
---
# Safe-Anything (`erkamyaman/safe-anything`)

Source-pinned operator guide for `erkamyaman/safe-anything` (MIT), providing verified instructions and offline preflight validation.

## When to use this skill

- Scan code, secrets, mobile/cloud configs, and AI agent setups for vulnerabilities with fast 100% Rust scanner.
- For complete trigger patterns: safe-anything, security, sast, vulnerability-scanner, secret-scanning, rust.
- Cross-routing boundaries: route out to `security`, `infrastructure-core`, `code-quality` where appropriate.

## Instructions

1. **Run offline preflight first** to confirm tool availability and pinned file integrity:
   ```bash
   python3 scripts/preflight.py --json
   ```

2. **Verify installation channels & environment prerequisites**:
   - Cargo install: `cargo install safe-anything`
   - Homebrew: `brew install safe-anything`
   - Standalone CLI: `safe-anything scan .`

3. **Execute verified workflows & operations**:
   - **Single-Binary SAST**: Fast 100% Rust static scanner auditing codebases in seconds without heavyweight JVM or Python daemons.
   - **Agent Security Auditing**: Specialized rules inspecting agent configurations (`.claude-plugin`, system prompts, MCP configs) for permission escalation and injection flaws.
   - **OSV Integration**: Real-time correlation with the Open Source Vulnerability database for transitive dependency CVE tracking.

4. **Gate sensitive mutating operations & respect boundaries**:
   - Does not perform active network penetration testing or runtime exploit generation.
   - Route out: Dynamic application security testing / penetration tools -> `security`.

## References

- Pinned upstream summary and concepts: [references/upstream.md](references/upstream.md)
- Pinned source provenance and file digests: [references/source.json](references/source.json)
- Offline manifest preflight helper: [scripts/preflight.py](scripts/preflight.py)
- Eval suite: [evals/evals.json](evals/evals.json)
