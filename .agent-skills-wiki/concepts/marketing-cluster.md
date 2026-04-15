---
title: Marketing Cluster
created: 2026-04-12
updated: 2026-04-16
type: concept
tags: [skills, consolidation, trigger-design, marketing, docs]
sources: [graphify-out/GRAPH_REPORT.md, .survey/marketing-skill-canonicalization-20260412/context.md, .survey/marketing-skill-canonicalization-20260412/solutions.md, .survey/marketing-skills-collection-support-hardening-20260416/context.md, .survey/marketing-skills-collection-support-hardening-20260416/solutions.md]
---

# Marketing Cluster

The repository's broad marketing lane now has a clearer shape:
- `marketing-automation` as the canonical general marketing router
- `marketing-skills-collection` as the compatibility alias for legacy prompt packs and catalogs
- `steam-store-launch-ops` as the clear game-specific launch/store exception that should not be swallowed by the general lane

## Durable finding
- The cluster did not need another broad marketing skill in this run.
- The higher-leverage move was to make the general lane explicitly canonical and reduce the old name to a migration-safe alias.
- The main abstraction for this cluster is **broad intake first, specialist lane second**.

## Implications
- `marketing-automation` should own messy general marketing asks and normalize them into one KPI-aware packet.
- `marketing-skills-collection` should remain lightweight so it reduces migration friction without becoming a competing peer skill.
- Alias support hardening belongs in tiny migration-focused packets plus compact-surface sync, not in another broad support encyclopedia.
- Future marketing-cluster work should prefer support upgrades and sharper downstream boundaries over adding another general marketing wrapper.

## Related pages
- [[skill-support-coverage]]
- [[marketing-skill-canonicalization-2026-04-12]]
- [[marketing-skills-collection-support-hardening-2026-04-16]]
