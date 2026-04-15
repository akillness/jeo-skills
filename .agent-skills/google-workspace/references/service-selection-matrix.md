# Service selection matrix

## Primary surfaces
| Surface | Use when | Common operations | Avoid when |
|---|---|---|---|
| Docs | narrative or formatted documents | create docs, replace placeholders, insert text/tables/images | the real artifact is a spreadsheet or deck |
| Sheets | rows, tables, lightweight ops queues, dashboards | append rows, formulas, formatting, filters, approvals | the problem is durable database design or BI modeling |
| Slides | generated decks and presentation updates | create slides, replace placeholders, thumbnails | the main need is deck strategy/content authoring |
| Drive | file storage, folder structure, permissions | upload/search/share/export, shared drives | information architecture is the real issue |
| Gmail | mailbox automation and outbound messages | drafts, send, labels, thread actions, search | the task is copy strategy rather than mailbox ops |
| Calendar | event automation and scheduling | create/update events, attendees, Meet links | the issue is scheduling policy or planning, not API execution |
| Forms | intake, surveys, quizzes, response collection | create forms, structure questions, receive responses | the user needs survey methodology rather than implementation |
| Chat | notifications and workspace messaging flows | post messages, notify rooms/spaces, lightweight bot flows | a broader chatops platform decision is needed |
| Admin SDK | users/groups/org units/domain settings | suspend users, group membership, org structure | ordinary content work is being over-administered |

## Surface choice heuristics
- If the workflow is **inside Workspace** and UI-triggered, Apps Script is often the shortest path.
- If the workflow is **backend-owned** or integrates with non-Google systems, direct REST APIs are usually cleaner.
- If the workflow spans multiple Workspace apps, define the **system of record** first.
- If the request includes “shared drive,” “mailbox,” “calendar invite,” or “domain user,” call out the identity and permission model explicitly.

## Source-backed notes
- Google’s Apps Script samples page frames Apps Script around automating tasks, extending Workspace UIs, and integrating Google/external services.
- Google’s Forms comparison guide explicitly says there is overlap between REST and Apps Script service surfaces, which is a useful model for the broader Workspace lane too.
