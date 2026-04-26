# Triage
- Problem: Hourly five-lane candidate sweep produced zero recommendation-grade keeps because license metadata came back as null for nearly all candidates, causing an over-degraded run.
- Audience: Maintainers of `akillness/oh-my-skills` who operate PR-based hourly skill maintenance.
- Why now: This run shows a deterministic metadata blind spot (GraphQL licenseInfo null) that blocks valid candidates and should be hardened with a low-risk fallback.

Provenance: indexed snippet, direct page retrieval
