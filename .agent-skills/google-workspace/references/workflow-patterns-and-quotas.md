# Workflow patterns and quotas

## Common workflow packets

### Form intake packet
- Forms collects responses
- Sheets stores and reviews responses
- Gmail or Chat sends confirmation / review notifications
- Calendar optionally books follow-up meetings

### Approval queue packet
- Sheets acts as queue/status board
- Apps Script or backend worker processes transitions
- Gmail / Chat sends reminder and approval messages
- Drive stores generated attachments or exported artifacts

### Reporting packet
- Sheets aggregates metrics or imports exports
- Docs or Slides publishes the narrative output
- Drive manages shared access and exports
- Calendar / Gmail handles scheduled distribution

## Quota / runtime routing
Use Apps Script carefully when the workflow is:
- high-volume
- bulk-update heavy
- schedule-driven at short intervals
- dependent on large Drive traversals or many Gmail sends

Google’s Apps Script quota documentation explicitly warns that daily quotas and limitations can interrupt scripts. That makes quota review part of the plan, not a postmortem step.

## Practical rules
1. Prefer batch operations where the API supports them.
2. Avoid row-by-row or cell-by-cell loops when one batch update can do the job.
3. If execution ceilings become the real bottleneck, move the workflow to a backend worker and keep Apps Script as the trigger/UI layer only if needed.
4. Treat quota-sensitive jobs as operational workflows with retries, notifications, and idempotency rules.

## Indexed-snippet evidence worth remembering
- Yahoo Japan indexed snippet on Reddit quota discussion: “Apps Script quotas can not be raised.”
- Yahoo Japan indexed snippet on Stack Overflow / official comparison results: users repeatedly distinguish Apps Script convenience from direct REST API control.

Those snippets are not direct primary-source verification, but they are useful signals for real operator pain: convenience pushes teams toward Apps Script, while quotas and control push them back toward direct APIs or backend workers.
