# Firebase AI Logic production controls

## What makes this lane production-specific
Firebase AI Logic is not just a raw model-call wrapper. In production-facing app work, the recurring concerns are:
- abuse prevention from real clients
- quota and cost exposure
- rollout/change management for user-visible AI behavior
- privacy boundaries for prompts and generated output

## Checklist

### App Check / abuse prevention
- Check whether the app is public-facing or susceptible to unauthorized client use.
- If yes, include App Check or an equivalent Firebase abuse-prevention story in the recommendation.
- Do not present client-side model calls as "just ship it" work without this guardrail.

### Cost and quota
- Call out whether the feature could produce bursty usage, long streams, or repeated regeneration.
- Recommend basic safeguards such as request throttling, retries with limits, and UI patterns that do not encourage accidental spam.

### Monitoring / visibility
- For production or beta launches, mention how the team will watch failures, latency, and cost/usage changes.
- If the user asks for systematic traces, evaluators, or reusable backend observability, route that part to `genkit`.

### Rollout / model changes
- If launch risk matters, recommend remote configuration, staged rollout, or a feature flag rather than hard-coding one permanent exposure plan.

### Privacy boundary
- Highlight whether user-generated or sensitive content is involved.
- If the app needs privileged joins, server secrets, or protected systems, move that work out of the client lane.

## Common recommendation pattern
1. Keep the user-facing feature in Firebase AI Logic.
2. Add app-level controls for abuse, quota, and fallback behavior.
3. Escalate backend-only concerns to `genkit`.
4. Escalate deploy/config mechanics to `firebase-cli`.
