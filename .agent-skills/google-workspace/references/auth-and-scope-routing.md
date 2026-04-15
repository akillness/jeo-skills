# Auth and scope routing

## Choose the actor first
Before implementation, decide **who** is acting:
- a real end user
- a backend/service identity
- a delegated domain admin
- an Apps Script owner / installer

## Routing table
| Model | Best for | Common products | Main caveat |
|---|---|---|---|
| OAuth user flow | user-owned mailbox, calendar, Drive, docs, sheets | Gmail, Calendar, Drive, Docs, Sheets, Slides, Forms, Chat | consent + token storage must be handled cleanly |
| Service account | backend-owned or shared-resource workflows | Drive, generated docs/sheets, integrations | direct access to user-owned data may not work without sharing/delegation |
| Service account + domain-wide delegation | org-wide impersonation or admin tasks | Admin SDK, org-wide mail/calendar/drive ops | high-privilege path; narrow scopes and document who is impersonated |
| Apps Script auth | scripts intentionally living inside Workspace | Sheets, Docs, Forms, Gmail, Calendar, Drive | easy startup, but runtime and quota constraints still apply |

## Scope rules
- Use the narrowest scopes that still satisfy the task.
- Separate admin scopes from ordinary content scopes.
- If the task touches someone’s mailbox or calendar, state whose identity is performing the action.
- If the user only says “send email” or “schedule meeting,” do not assume a service account can safely act as them.

## Source-backed notes
- Google Workspace auth overview explicitly calls out OAuth client IDs, service accounts, scopes, and domain-wide delegation as the core decision points.
- The “Develop on Google Workspace” getting-started docs point to creating access credentials after API enablement rather than treating auth as a postscript.

## Quick checks
1. Which Google account or admin identity is acting?
2. Is this user-owned content or org-admin work?
3. Does the workflow need consent, impersonation, or only shared-resource access?
4. Are the requested scopes broader than the task actually needs?
