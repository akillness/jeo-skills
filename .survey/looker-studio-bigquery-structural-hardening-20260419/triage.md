# Triage
- Problem: `looker-studio-bigquery` is still an oversized front door after its modernization pass; the next bounded question is whether to tighten it into a packet-first reporting router instead of leaving a long mode catalog.
- Audience: Maintainers of `oh-my-skills/.agent-skills`, plus agents and operators doing PM/ops reporting, marketing/GTM dashboards, and game/business telemetry handoffs on top of BigQuery.
- Why now: Graphify still flags `looker-studio-bigquery` on the oversized watchlist, while neighboring skills have already adopted the smaller routing-first pattern and clearer route-outs.
