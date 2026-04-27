# Triage
- Problem: Hourly candidate sweeps currently treat any explicit license as acceptable; repositories with ambiguous SPDX (e.g., `NOASSERTION`/`Other`) can still be promoted as recommendation-grade keeps.
- Audience: oh-my-skills maintainers operating unattended survey→PR→merge loops.
- Why now: This run found multiple kept candidates with non-allowlist license identifiers, which weakens recommendation trust and downstream reuse safety.
