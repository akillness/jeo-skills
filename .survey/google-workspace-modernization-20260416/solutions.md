# Solution Landscape: google-workspace modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Google Workspace REST APIs | Official per-product APIs + client libraries | Full control, broad product coverage, backend-friendly, admin-compatible | Auth/scopes are heavier; product-specific complexity | Primary official layer |
| Apps Script + Workspace services / advanced services | Script inside Workspace runtime | Fast setup, UI-bound automations, triggers, close to Sheets/Docs/Forms users | Runtime quotas, execution limits, not ideal for every backend/integration case | Strong for lightweight ops workflows |
| Admin SDK | Official admin/domain management APIs | Correct surface for users/groups/domain operations | Higher permission/security burden | Should not be blurred into ordinary Docs/Sheets work |
| Zapier | SaaS workflow automation | Easy cross-app automation and non-dev adoption | Paid, less code control, another abstraction layer | Common substitute for ops teams |
| n8n | Source-available workflow automation | Self-hostable, broad integrations, agent-friendly workflows | More infra/ops overhead | Good cross-app alternative |
| Make | SaaS visual automation | Broad connectors and visual orchestration | Less repo-local / code-centric reuse | Useful no-code alternative but not a repo skill replacement |

## Categories
- Official programmable surfaces: Workspace REST APIs, Admin SDK, Apps Script services/advanced services
- Low-code/no-code substitutes: Zapier, Make, n8n
- Manual fallback: Sheets + Forms + Gmail/Calendar routines with lightweight scripts or human upkeep

## What People Actually Use
In practice, teams do not pick a single universal surface. They start with whichever layer matches the operator and workflow:
- bound Apps Script for Sheets/Docs/Forms automation,
- direct REST API for backend/system integrations,
- Admin SDK for domain/user operations,
- Zapier/Make/n8n when the real need is cross-app orchestration rather than deep Workspace control.

## Frequency Ranking
1. Apps Script / Workspace-native automation
2. Official REST APIs
3. Zapier / similar automation SaaS
4. n8n / self-hostable orchestration
5. Make / visual automation

Evidence sources:
- Google Apps Script samples page
- Google Workspace developer docs
- Zapier Google Workspace automation page
- n8n Google Workspace Admin integration page
- Yahoo indexed snippets around Apps Script vs REST and quota pain

## Key Gaps
- Existing repo skill is too encyclopedic and does not help users choose the right execution surface first.
- The skill lacks durable support docs for auth, service routing, and quota-aware workflow patterns.
- Discovery copy underplays the decision between Apps Script, direct REST APIs, and admin-only flows.

## Contradictions
- Marketed promise: “automate all Google Workspace services.”
- User reality: surface choice, auth model, and quotas determine whether a workflow should live in Apps Script, REST API code, Admin SDK, or an external automation layer.

## Key Insight
The best bounded improvement is not adding another Google productivity wrapper or no-code integration skill. It is upgrading `google-workspace` into a decision-first router that helps agents choose the right Workspace surface, auth mode, and cross-service workflow shape before they start coding against a single API.