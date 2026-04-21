# Firebase AI Logic feature packets

Use these packet shapes to keep answers concrete without turning the skill into an SDK dump.

## Packet: chat / assistant UI
- app surface
- session/state model in the UI
- streaming or non-streaming
- moderation / error fallback
- boundary check: any tool use or retrieval?

## Packet: summary / rewrite
- source text origin
- length/latency expectation
- output format requirements
- retry and cache behavior
- boundary check: is this reusable backend logic across clients?

## Packet: multimodal feature
- input media type
- upload/storage path
- synchronous vs async UX
- privacy implications of uploaded content
- boundary check: does media processing need server-side handling?

## Packet: structured output feature
- schema shape needed by the app
- validation and fallback path if output is malformed
- UI consequences of partial failure
- boundary check: does the schema feed downstream services better owned by a backend flow?

## Packet: launch hardening
- user cohort / rollout plan
- App Check / abuse posture
- quota/cost visibility
- monitoring owner
- escalation criteria for moving to `genkit`
