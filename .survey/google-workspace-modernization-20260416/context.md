# Context: google-workspace modernization

## Workflow Context
Google Workspace automation shows up in small-team internal tooling, product/program operations, content/marketing operations, and lightweight backend/admin workflows. The core pattern is not just “call an API” — teams have to choose between Apps Script, direct REST APIs, advanced services, or admin surfaces depending on whether the job runs inside Workspace, needs user-context OAuth, or needs domain-wide delegated admin work.

Primary-source evidence:
- Google Workspace developer landing page positions the platform as a way to “enhance and connect to Google Workspace apps.” Source: https://developers.google.com/workspace
- Google’s authentication overview says Workspace access depends on choosing the right credentials, including OAuth client IDs, service accounts, and domain-wide delegation for user data/admin cases. Source: https://developers.google.com/workspace/guides/auth-overview
- Google Apps Script samples are framed around automating tasks, extending Workspace UIs, and integrating Google/external services. Source: https://developers.google.com/apps-script/samples
- Google’s Forms comparison guide explicitly says there is overlap between a REST API and Apps Script service and that the choice depends on project needs. Source: https://developers.google.com/workspace/forms/api/guides/compare-rest-apps-script

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Ops / PM operators | Forms → Sheets → Gmail / Calendar workflows, approvals, reporting, reminders | low-to-medium |
| Marketing / content ops | campaign trackers, shared Drive assets, scheduled comms, reporting sheets/slides | low-to-medium |
| Internal tool / automation developers | Docs/Sheets/Drive/Gmail integrations, auth/scopes, service selection | medium |
| Workspace admins | directory/user/group/admin actions, domain-wide delegation, audit/ops flows | medium-to-high |

## Current Workarounds
1. Start with Apps Script because it is close to Sheets/Docs/Forms and can automate UI-bound workflows quickly.
2. Drop to REST APIs when Apps Script surface area, auth model, or integration reach becomes limiting.
3. Use no-code/low-code layers like Zapier or n8n for cross-app workflows instead of direct Workspace coding.
4. Keep manual spreadsheet + form + email/calendar glue when the workflow is small and nobody wants to own auth or quota details.

## Adjacent Problems
- Auth/scope sprawl: OAuth vs service account vs domain-wide delegation is easy to blur.
- Quotas and execution limits change the viable surface for bulk jobs and scheduled automation.
- Cross-service workflows often need multiple products at once, not one API at a time.
- Legacy “all APIs in one file” documentation becomes hard to trigger and maintain.

## User Voices
- Yahoo Japan indexed snippet on Google’s Forms comparison page: “Apps Script can save time by automating Google Cloud console project and OAuth consent setup when developing in JavaScript.” Evidence type: Yahoo Japan indexed snippet + official page URL. Source: https://developers.google.com/workspace/forms/api/guides/compare-rest-apps-script?hl=ko
- Yahoo Japan indexed snippet on Stack Overflow: “The key difference here is that the Google REST API has nothing to do with Google Apps Script, while the Execution API is all about letting you call Google …” Evidence type: Yahoo Japan indexed snippet. Source: https://stackoverflow.com/questions/37484471/what-is-the-difference-between-google-rest-api-and-google-apps-script-execution
- Yahoo Japan indexed snippet on Reddit quota discussion: “Apps Script quotas can not be raised.” Evidence type: Yahoo Japan indexed snippet. Source: https://www.reddit.com/r/GoogleAppsScript/comments/lekdh2/how_do_big_corporations_deal_with_the/
- Apps Script quotas page: quotas and limitations must be reviewed to keep scripts from interruption. Source: https://developers.google.com/apps-script/guides/services/quotas