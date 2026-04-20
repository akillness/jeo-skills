# Triage
- Problem: `game-ci-cd-pipeline` chooses useful packet types, but it still under-specifies when the team really needs fast branch validation, a slower nightly/package-candidate lane, or a protected release/certification lane before choosing the packet.
- Audience: Unity/Unreal technical leads, release engineers, contractors, and small studios designing or repairing game CI/CD.
- Why now: the repo already hardened this skill into a packet-first router, and the next bounded win is clarifying signal tier / promotion-lane truth so branch-gate, nightly packaging, and release-candidate work stop collapsing into one generic pipeline answer.
