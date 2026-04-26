---
type: "query"
date: "2026-04-26T06:13:24.810378+00:00"
question: "hourly survey run 2026-04-26 15:09:02: what low-risk survey hardening candidate should be merged?"
contributor: "graphify"
source_nodes: ["survey", "metadata", "license", "fallback"]
---

# Q: hourly survey run 2026-04-26 15:09:02: what low-risk survey hardening candidate should be merged?

## Answer

Codify deterministic license metadata fallback: if gh repo view licenseInfo is null, retry gh api repos/<owner>/<repo> for SPDX before labeling license unknown.

## Source Nodes

- survey
- metadata
- license
- fallback