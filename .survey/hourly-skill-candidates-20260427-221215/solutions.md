# Solutions
## Solution List
1. Add deterministic open-PR backlog gate to hourly survey reference so runs merge carry-forward before creating new PRs (selected).
2. Continue opening a new PR every hour regardless of backlog.
3. Pause all hourly updates until backlog is manually cleared.

## Categories
- selected: low-risk process ratchet in survey reference docs
- fallback: status quo
- high-friction: full pause

## What People Actually Use
- Teams use backlog-aware automation gates to prevent CI and review queue saturation.
- In this repo, open-pr carry-forward behavior already appears in recent wiki notes but is not yet codified in survey reference guardrails.

## Frequency Ranking
1) backlog-aware gating
2) incremental carry-forward merges
3) full freeze-and-drain pauses

## Key Gaps
- Current hourly guidance lacks an explicit threshold/action for open PR backlog before creating a new branch/PR.

## Contradictions
- Aggressive backlog gating can slow discovery throughput; threshold must be narrow and reversible.

## Key Insight
- Current snapshot shows open_pr_count=29; adding a deterministic backlog gate reduces PR spam and increases merge completion probability.

## Curated Sources
- agentic ai skill | speakeasy-api/gram | https://github.com/speakeasy-api/gram | provenance: indexed snippet
- agentic ai skill | magnusfroste/flowwink | https://github.com/magnusfroste/flowwink | provenance: indexed snippet
- web backend skill | Gaku52/software-engineering-universe | https://github.com/Gaku52/software-engineering-universe | provenance: indexed snippet
- cli open source skill | skrun-dev/skrun | https://github.com/skrun-dev/skrun | provenance: indexed snippet
