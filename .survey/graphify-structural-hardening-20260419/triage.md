# Triage
- Problem: tighten the existing `graphify` skill into the repo’s current routing-first shape, validate its upstream instructions against real Graphify surfaces, and close support/discovery gaps without creating another graph or GraphRAG wrapper
- Audience: agents and maintainers who need fast, reusable repo/corpus graphing workflows across Claude, Codex, Gemini, and Hermes-style local automation
- Why now: `graphify` is the only live skill without a structural-hardening pass, it is missing a compact discovery variant, and this repo now depends on graph + wiki memory loops for hourly maintenance work
