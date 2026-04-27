# Triage
- Problem: Hourly survey runs for skill maintenance suffer from noisy keyword hits and metadata sparsity, causing weak recommendation quality if relevance rescue and metadata gates are not consistently applied.
- Audience: Maintainers of akillness/oh-my-skills running unattended survey→PR loops.
- Why now: Current hourly run shows mixed lane health (passes and degraded lanes), so codifying deterministic recovery/gating is needed to reduce false-positive promotions and improve repeatability. Provenance: indexed snippet.
