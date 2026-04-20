---
title: Marketing Automation Operator Packet Ratchet 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, consolidation, trigger-design, skill-quality, survey, docs]
sources:
  - .survey/marketing-automation-next-ratchet-20260420/triage.md
  - .survey/marketing-automation-next-ratchet-20260420/context.md
  - .survey/marketing-automation-next-ratchet-20260420/solutions.md
  - .agent-skills/marketing-automation/SKILL.md
  - .agent-skills/marketing-automation/references/operator-packet-and-proof-stack.md
---

# Marketing Automation Operator Packet Ratchet

## Summary
The best bounded next improvement was not another marketing wrapper or more channel coverage. It was making `marketing-automation` explicitly output one reusable operator packet with owner, dependencies/approvals, and proof, because real teams still coordinate launches and campaigns through briefs, trackers, approvals, and stitched-together readouts.

## Accepted
- Tightened `marketing-automation` around one reusable operator packet instead of a generic handoff packet.
- Added `references/operator-packet-and-proof-stack.md`.
- Expanded eval coverage with a legal/analytics dependency case.
- Synced discovery surfaces (`SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`).
- Synced the lightweight alias support docs so `marketing-skills-collection` still points at the same canonical packet contract.

## Rejected
- Adding another broad marketing or GTM wrapper.
- Re-expanding the skill into more channel tactics.
- Treating all-in-one automation suites as if they remove ownership, approvals, or proof handoff work.

## Durable Notes
- The market is crowded with execution systems and thin on honest front-door routing.
- Real marketing work still depends on human-readable packets, approval paths, and readout checkpoints.
- The canonical marketing skill is strongest when it chooses one mode, one lane, one operator packet, and one proof stack before anything else.

## Related Pages
- [[marketing-cluster]]
- [[marketing-automation-structural-hardening-2026-04-18]]
- [[marketing-skill-canonicalization-2026-04-12]]
- [[marketing-skills-collection-support-hardening-2026-04-16]]
