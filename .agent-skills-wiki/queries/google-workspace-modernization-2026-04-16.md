---
title: Google Workspace modernization
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, skill-quality, trigger-design, docs, survey]
sources: [.survey/google-workspace-modernization-20260416/triage.md, .survey/google-workspace-modernization-20260416/context.md, .survey/google-workspace-modernization-20260416/solutions.md, .agent-skills/google-workspace/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Google Workspace modernization

## Decision
Upgrade `google-workspace` in place instead of adding another productivity / no-code / Workspace wrapper.

## Why this won
- The existing skill was a 745-line legacy encyclopedia with no `references/` bundle and validator warnings for missing standard sections plus excessive length.
- Survey evidence showed the real choice is not “which Google API example do I paste,” but **Apps Script vs direct REST API vs Admin SDK**, plus auth model and cross-service workflow shape.
- Official Google docs and indexed discussion snippets both reinforced the same pattern: Apps Script is convenient close to Workspace, while auth scope and quota/runtime concerns push some workflows toward direct APIs or backend workers.
- Graph refresh showed support-coverage leverage still comes from upgrading indexed legacy anchors rather than creating wrappers for Zapier / Make / n8n style substitutes.

## Accepted changes
- Rewrite `google-workspace` as a decision-first routing skill.
- Add `references/` docs for auth/scopes, service routing, and workflow/quota patterns.
- Refresh evals to test routing behavior, admin boundaries, and Korean prompt handling.
- Refresh compact/discovery surfaces so README / setup / manifest copy matches the new boundary.

## Rejected changes
- Adding a separate generic Google productivity wrapper.
- Turning the skill into a Zapier / Make / n8n tutorial.
- Keeping one giant single-file API encyclopedia as the main maintenance surface.

## Durable takeaway
`google-workspace` should own **Workspace surface choice and execution packets**: choose Apps Script vs REST API vs Admin SDK, choose auth, define the service bundle, then implement. It should not collapse admin ops, content ops, and no-code substitutes into one undifferentiated blob.

## Related pages
- [[skill-support-coverage]]
- [[developer-workflow-cluster]]
