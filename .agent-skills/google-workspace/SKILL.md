---
name: google-workspace
description: >
  Plan and execute Google Workspace operations across Docs, Sheets, Slides, Drive,
  Gmail, Calendar, Forms, Chat, and Admin SDK by choosing the right surface first:
  Apps Script, direct REST API, or admin-only APIs. Use when the user needs to
  automate a Workspace workflow, edit or create Workspace files, send Gmail,
  schedule calendar events, process Forms/Sheets pipelines, manage Drive sharing,
  or handle Workspace admin tasks; even if they only mention a spreadsheet,
  document, shared drive, inbox workflow, approval flow, or domain user change.
  Triggers on: Google Doc, Google Sheet, spreadsheet, Slides, Drive folder, Gmail,
  calendar event, Forms, Apps Script, Admin SDK, shared drive, Google Chat,
  workspace automation, domain user, send email, approval flow.
allowed-tools: Bash Read Write Edit Glob Grep
license: Apache-2.0
compatibility: Requires Python 3.8+ plus google-api-python-client / google-auth libraries for direct API use. Apps Script routes are valid when the workflow should live inside Workspace.
metadata:
  tags: google-workspace, google-docs, google-sheets, google-slides, google-drive, gmail, google-calendar, google-chat, google-forms, admin-sdk, apps-script, automation
  version: "1.1.0"
  author: Agent Skills Team
  platforms: Claude, Gemini, Codex, OpenCode
---

# Google Workspace

Use this skill to route Google Workspace work before writing code or pasting API snippets. The key decision is usually **which Workspace surface should own the job**:

- **Apps Script** for Workspace-native automation close to Sheets / Docs / Forms / triggers / menus
- **Direct REST API + client libraries** for backend services, multi-system integrations, stronger deployment control, or language flexibility
- **Admin SDK / admin-only APIs** for users, groups, org units, directory data, or domain-wide governance tasks

## When to use this skill

- Create or update Docs, Sheets, Slides, Drive files/folders, Gmail messages, Calendar events, Forms, or Chat messages
- Design a Workspace automation flow such as Form → Sheet → Gmail / Calendar / Drive
- Decide between Apps Script and direct REST APIs
- Choose the right auth model: OAuth user flow, service account, or domain-wide delegation
- Review scopes, sharing model, quota/execution risk, or safety boundaries before implementation
- Handle Workspace admin tasks that ordinary Docs/Sheets/Gmail code should not absorb

## Instructions

### Step 1: Classify the request

Capture five things before touching any API:

1. **Primary product surface** — Docs, Sheets, Slides, Drive, Gmail, Calendar, Forms, Chat, or Admin SDK
2. **Operation** — create, read, update, search, share, send, schedule, export, batch update, administer
3. **Actor / identity** — end user, service account, delegated admin, or Apps Script owner
4. **Execution home** — inside Workspace UI/runtime, backend service, cron/batch worker, or mixed workflow
5. **Trigger / cadence** — manual, form submit, scheduled, web request, bulk migration, admin event

If the user describes multiple Workspace apps, treat it as a **workflow** problem first, not a single-API problem.

### Step 2: Choose the execution surface

#### Use Apps Script when
- the workflow is centered around Sheets / Docs / Forms / Gmail and should live inside Workspace
- you need triggers, custom menus, sidebars, or other Workspace-native scripting behavior
- a bound script is simpler than provisioning a separate backend
- JavaScript-in-Workspace ergonomics matter more than backend deployment control

#### Use direct REST APIs when
- the workflow lives in a backend, integration service, CLI, or batch job
- you need stronger control over deployment, testing, retries, or non-JS stacks
- the task spans Workspace plus external systems and should not depend on a bound script runtime
- Apps Script quotas or runtime limits are likely to be the bottleneck

#### Use Admin SDK / admin APIs when
- the job is about users, groups, org units, roles, or domain administration
- domain-wide delegated access is part of the task
- the request is clearly beyond ordinary content operations like Docs/Sheets editing

#### Use an external automation layer only as a route-out
- If the user really needs a no-code / cross-app orchestrator, mention tools like Zapier / Make / n8n as substitutes.
- Do **not** turn this skill into a generic no-code platform tutorial.

### Step 3: Pick the auth model

| Auth model | Use when | Typical surfaces | Notes |
|---|---|---|---|
| OAuth user flow | Acting on a real user’s mailbox, calendar, Drive, docs, or personal content | Gmail, Calendar, Drive, Docs, Sheets, Slides, Forms, Chat | Best default for user-owned data |
| Service account | Backend automation owns the data or operates on shared resources | Drive, backend-generated docs/sheets, service workflows | May need shared-drive/file access design |
| Service account + domain-wide delegation | Admin or org-wide actions must impersonate users safely | Admin SDK, org-wide Gmail/Calendar/Drive workflows | Higher security burden; keep scope narrow |
| Apps Script-bound auth | The workflow is intentionally inside Workspace and tied to the script owner / install model | Sheets, Docs, Forms, Gmail, Calendar, Drive | Fast to start, but runtime/quotas still matter |

Rules:
- Choose the **narrowest scopes** that satisfy the task.
- Keep credentials and tokens out of the repo.
- If the task touches a user’s mailbox/calendar/files, say whose identity is acting.
- If admin powers are required, separate that packet from ordinary content-editing logic.

### Step 4: Route to the right Workspace product

| Product | Good for | Common operations | Route out when |
|---|---|---|---|
| Docs | formatted text documents | create docs, replace placeholders, insert text/tables/images, export | the deliverable is really a slide deck or spreadsheet |
| Sheets | tabular workflows and lightweight ops databases | append/update rows, formatting, formulas, filters, approvals, dashboards | the user needs durable database design or BI modeling |
| Slides | generated presentations and updateable decks | create slides, replace placeholders, thumbnails, batch updates | the real job is deck strategy/content design rather than API execution |
| Drive | storage, sharing, folder hierarchy, export/import | upload files, create folders, search files, permissions, shared drives | the main problem is information architecture rather than Drive API calls |
| Gmail | mailbox automation and outbound messages | drafts, send, labels, search, thread actions | the main job is email writing strategy rather than mailbox ops |
| Calendar | scheduling and event automation | create events, invite attendees, sync timing, Meet links | the core issue is meeting policy or roadmap planning |
| Forms | intake, surveys, quizzes, response pipelines | create/update forms, response collection, Form → Sheet workflows | the job is survey design methodology rather than implementation |
| Chat | workspace messaging automations | post messages, bot flows, notifications | the user needs broader chatops platform design |
| Admin SDK | directory and domain administration | users, groups, org units, licenses, settings | ordinary content workflows are being over-administered |

### Step 5: Use workflow packets for common cross-service jobs

#### Form intake packet
- Forms captures submissions
- Sheets stores / reviews responses
- Gmail or Chat sends follow-up notifications
- Calendar schedules interviews, meetings, or reminders when needed

#### Approval / operations packet
- Sheet stores queue/state
- Apps Script or backend worker evaluates rows / statuses
- Gmail or Chat sends approval prompts / updates
- Drive stores generated artifacts or attachments

#### Reporting packet
- Sheets holds metrics or extracts
- Docs / Slides publish the narrative output
- Drive manages shared access and exports
- Calendar / Gmail handles scheduled distribution

For multi-step flows, define:
- system of record
- trigger source
- actor identity
- idempotency / duplicate-submission rule
- failure notification path

### Step 6: Check quota and runtime risk

Before finalizing the plan, ask whether the workflow is:
- high-volume or bulk-edit heavy
- schedule-driven with frequent triggers
- likely to hit Apps Script execution/runtime limits
- dependent on large Drive traversals, Gmail sends, or spreadsheet write bursts

If yes:
- prefer batch operations where supported
- avoid row-by-row chatty loops when one batch call exists
- consider moving from Apps Script to a backend worker if runtime ceilings become the real constraint

### Step 7: Produce a concrete execution packet

Return a compact plan with:
- chosen Workspace surface
- chosen auth model
- required scopes / admin boundaries
- primary object identifiers needed (docId, spreadsheetId, folderId, user email, calendarId, formId)
- implementation sequence
- verification step
- route-outs / risks

## Examples

### Example 1: Form → Sheet → email workflow
**Prompt:** “Create an employee feedback form, collect responses in Sheets, and send a confirmation email.”

**Use this skill to:**
- classify it as a multi-service workflow
- choose Apps Script or a lightweight backend depending on where the automation should live
- identify Forms + Sheets + Gmail as the service bundle
- specify auth/scopes and trigger behavior before implementation

### Example 2: Shared Drive onboarding packet
**Prompt:** “Create a shared Drive folder structure for a new client, share it with three users, and generate a kickoff doc.”

**Use this skill to:**
- route Drive as the primary surface and Docs as the secondary artifact layer
- choose OAuth or service-account access based on ownership model
- list folder IDs, user emails, and sharing rules before coding

### Example 3: Workspace admin request
**Prompt:** “Suspend a departing user, move them to a different org unit, and audit their group membership.”

**Use this skill to:**
- route immediately to Admin SDK
- require admin/delegated identity clarification in the execution packet
- keep admin actions separate from ordinary Docs/Drive editing logic

### Example 4: Sheet-heavy approvals automation
**Prompt:** “Turn this spreadsheet into an approvals queue with reminder emails and status updates.”

**Use this skill to:**
- decide whether bound Apps Script is enough
- define status columns, reminder cadence, and Gmail integration
- check quota/runtime risk before promising a trigger-heavy solution

## Best practices

1. Start with **surface choice**, not code snippets.
2. Separate **content operations** from **admin operations**.
3. Use Apps Script for Workspace-native ergonomics; use direct APIs when backend control or scale matters more.
4. Keep scopes narrow and state exactly whose identity is acting.
5. For multi-app workflows, define the source of truth and trigger source first.
6. Prefer batch updates over chatty per-row / per-cell loops when the API supports batching.
7. If the problem is actually writing emails, documents, surveys, dashboards, or presentations, route to the corresponding content skill after the Workspace execution packet is clear.

## References

- `references/auth-and-scope-routing.md` — OAuth vs service account vs domain-wide delegation routing
- `references/service-selection-matrix.md` — product-by-product routing across Docs / Sheets / Drive / Gmail / Calendar / Forms / Admin SDK
- `references/workflow-patterns-and-quotas.md` — common cross-service packets plus quota/runtime cautions
- Google Workspace developer docs: https://developers.google.com/workspace
- Auth overview: https://developers.google.com/workspace/guides/auth-overview
- Apps Script samples: https://developers.google.com/apps-script/samples
- Apps Script quotas: https://developers.google.com/apps-script/guides/services/quotas
- Forms REST vs Apps Script comparison: https://developers.google.com/workspace/forms/api/guides/compare-rest-apps-script
