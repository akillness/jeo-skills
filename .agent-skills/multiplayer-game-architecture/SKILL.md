---
name: multiplayer-game-architecture
description: >
  Design and review the networking contract for multiplayer games before engine
  or backend implementation. Use when a team must choose dedicated-authoritative,
  listen-server, relay-assisted peer, lockstep, snapshot, or asynchronous models;
  assign authority for movement, combat, inventory, economy, and match state;
  plan prediction, reconciliation, interpolation, lag handling, matchmaking,
  reconnects, protocol versions, and cheat resistance; select WebSocket, WebRTC
  DataChannel, WebTransport, or an engine transport; or build a measured network
  impairment test matrix. Triggers on: multiplayer game, netcode, authoritative
  server, replication, rollback, host migration, client prediction, snapshot
  interpolation, lag compensation, matchmaking, WebSocket, WebRTC, WebTransport.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Engine-neutral planning and review. The bundled validator uses only Python 3.9+
  standard-library modules and never opens sockets or changes a deployment.
metadata:
  version: "1.0"
  source: akillness/jeo-skills
---

# Multiplayer Game Architecture

Build the multiplayer contract before writing netcode. The output is a reviewable
`multiplayer-contract.json`, not a framework recommendation disguised as architecture.
Topology, authority, replication, transport, session lifecycle, security, and tests
must agree with one another.

## When to use this skill

Use it to:

- design or review a new multiplayer game's networking model;
- retrofit multiplayer into an existing game without mixing client and server truth;
- choose authority and replication per state domain;
- compare browser or engine transports against actual delivery needs;
- define lobby, allocation, join, reconnect, late-join, finish, and shutdown behavior;
- investigate desync, prediction error, cheating, host migration, or network instability;
- turn vague goals such as "make it multiplayer" into an executable contract and test matrix.

Do not use it for local couch multiplayer, generic game mechanics, visual UI, build logs,
frame-time profiling, or cloud deployment by itself. Route concrete Unity APIs to
`unity-technologies-skills`, Three.js/browser gameplay to `web-game-development`, red
builds to `game-build-log-triage`, release automation to `game-ci-cd-pipeline`, service
tests to `backend-testing`, and production telemetry to `monitoring-observability`.

## Instructions

### 1. Freeze the session envelope

Inspect the existing repository and record:

- player count range, pace, session length, and join model;
- casual, cooperative, ranked, or adversarial fairness needs;
- target platforms, regions, and browser or console constraints;
- simulation ownership, persistence, hidden information, and existing backend services;
- late join, reconnect, spectator, host migration, and protocol-version expectations.

Ask only for blockers. If answers are unavailable, state assumptions explicitly instead
of silently choosing a stack.

### 2. Choose topology before transport

Pick one primary model and explain the trust boundary:

- **Dedicated authoritative server:** use when fairness, persistence, hidden state, or
  independent match continuity outweighs hosting cost.
- **Listen server:** use for trusted or low-stakes sessions only after defining host
  advantage, host loss, migration, and cheat risk.
- **Relay-assisted peer:** use when direct reachability or privacy needs a relay, but do
  not confuse encrypted transport with authoritative gameplay.
- **Deterministic lockstep:** use only when the simulation can stay deterministic across
  target platforms and the wait-for-input tradeoff fits the game.
- **Asynchronous service:** use for turn, command, or state-transition games that do not
  need a continuous real-time simulation.

Do not choose WebSocket, WebRTC, WebTransport, UDP, or a vendor SDK until this decision
is stable. Transport is a delivery mechanism, not an authority model.

### 3. Write an authority matrix

For every gameplay-critical domain, name the writer, allowed client intent, and authority
validation. Cover at least movement, combat or actions, inventory, economy, match state,
and hidden information when they exist.

Clients may own presentation, local input collection, and speculative visuals. They must
not author trusted outcomes merely because their connection is encrypted. Avoid sending
hidden state that a client should never know.

### 4. Select the replication model per data class

Choose only the mechanisms the game needs:

- turn or command replication for discrete state transitions;
- authoritative state snapshots or deltas for non-deterministic real-time worlds;
- input lockstep for deterministic simulations;
- local prediction plus server reconciliation for latency-sensitive owned movement;
- interpolation for remote entities and replaceable visual state;
- bounded lag compensation only for mechanics whose fairness policy permits rewind;
- relevance, priority, and interest management when every client does not need every entity.

Never copy an engine's default tick or snapshot rate into the contract. Record a proposed
value only with a mechanics-based budget, profiling evidence, and a measurement plan.

### 5. Choose channels and fallbacks

For browser games, verify the current target-browser matrix before choosing:

- `WebSocket` is broadly supported and simple for bidirectional client-server traffic,
  but the classic browser API has no backpressure;
- `RTCDataChannel` provides encrypted peer data channels and configurable delivery, but
  still needs signaling and does not solve gameplay authority;
- `WebTransport` provides HTTP/3 streams and datagrams, but requires HTTPS/server support
  and a compatibility decision for older targets.

Map each message class to reliability, ordering, freshness, size, and overflow behavior.
Use separate logical channels where reliable bulk traffic would block time-sensitive
state. Define fallback and resync behavior rather than assuming the network is healthy.

### 6. Define lifecycle and security together

Specify queue or invite, match formation, server allocation, authentication, join, ready,
play, reconnect, finish, persistence, and shutdown as explicit states. Keep matchmaking,
server allocation, and game simulation as separate responsibilities.

For every inbound message, define schema validation, identity, authorization, sequence or
nonce handling, rate and size limits, and state-machine legality. Browser WebSocket work
also needs TLS, origin allowlisting, session expiry, per-message authorization,
backpressure, bounded queues, and content-safe logging.

Never provision servers, enable a paid matchmaking service, deploy, publish, or use live
credentials without separate approval.

### 7. Make failure observable and testable

Define metrics and correlation fields before implementation. Include join success,
round-trip and server-step distributions, queue depth, dropped or rejected messages,
prediction corrections, desyncs, reconnect outcomes, and protocol-version failures as
applicable.

Test at least one clean and one impaired network condition. Add latency, jitter, loss,
reordering, duplication, bandwidth pressure, disconnect, reconnect, server pause, and
version mismatch only where the chosen transport can exhibit them. Test two real clients
or processes, not two local objects sharing state. Derive acceptance thresholds from the
game's mechanics and target population instead of using universal numbers.

Read `references/verification-matrix.md` for the full evidence checklist.

### 8. Write and validate the contract

From this skill directory, start with `references/contract-example.json`, replace every
example value, and run:

```bash
python3 scripts/validate-contract.py multiplayer-contract.json
python3 scripts/validate-contract.py --self-test
```

The validator checks structure, authority coverage, product-specific tick rationale,
competitive peer-risk acceptance, security controls, clean and impaired test cases, and
unresolved placeholders. It is read-only and dependency-free.

Return this routing packet:

```markdown
### Multiplayer architecture packet
- Primary topology: <model and reason>
- Authority risk: <highest-risk state domain>
- Replication: <model per data class>
- Transport: <primary, fallback, and compatibility evidence>
- Lifecycle gap: <largest unresolved transition>
- Verification: <contract path, validator result, and missing evidence>
- Next owner: <implementation or route-out skill>
```

## Examples

### Ranked real-time action game

Choose dedicated authority, send client intent rather than outcomes, predict only owned
latency-sensitive movement, reconcile to server sequence numbers, interpolate remote state,
and test correction behavior under measured impairment. Do not accept peer authority just
because it is cheaper.

### Four-player turn-based co-op

Prefer a command/state-transition model. Reliable ordered delivery may be enough; prediction
and lag compensation add complexity without player value. Make commands idempotent, define
reconnect snapshots, and keep hidden hands on the authority.

### Existing Unity prototype

Write the engine-neutral contract here, then route concrete transport, RPC, NetworkObject,
Multiplayer Services, or Dedicated Server work to `unity-technologies-skills`. Do not let an
SDK selection replace the authority matrix.

## Best practices

1. Plan multiplayer before gameplay ownership hardens into single-process assumptions.
2. Treat authority as a per-domain policy, not a slogan or one global boolean.
3. Keep topology, replication, and transport as separate decisions.
4. Never send hidden information merely to hide it in the client UI.
5. Make commands idempotent and version the wire contract before supporting reconnects.
6. Use project evidence for tick, snapshot, bandwidth, latency, and queue budgets.
7. Test adverse networks and process separation before calling a local demo multiplayer-ready.
8. Log identifiers and outcomes, not credentials, tokens, chat bodies, or hidden game state.
9. Confirm every cloud, paid-service, deployment, and publication side effect separately.

## References

- `references/candidate-audit.md`: exact-name survey of the ten pictured candidates and selection rationale.
- `references/architecture-decisions.md`: topology, replication, transport, lifecycle, and authority decision tables.
- `references/verification-matrix.md`: impairment, security, lifecycle, and evidence checks.
- `references/contract-example.json`: complete contract accepted by the validator.
- `references/source-notes.md`: claim-to-source ledger using current first-party and primary references.
- `scripts/validate-contract.py`: Python 3.9+ contract validator and self-test.
