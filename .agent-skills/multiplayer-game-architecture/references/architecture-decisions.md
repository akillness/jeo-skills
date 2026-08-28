# Multiplayer architecture decisions

Use these tables to decide one layer at a time. Do not select a transport first and infer
an authority model from it later.

## 1. Session envelope

Record the product facts that constrain every later choice:

| Decision | Questions |
|---|---|
| Pace | Continuous real-time, turn-based, asynchronous, or mixed? |
| Population | Minimum and maximum players per match? Spectators? Parties? |
| Fairness | Trusted co-op, casual public, ranked, tournament, or persistent economy? |
| Continuity | May a match end with the host, or must it survive any client leaving? |
| State | What is transient, persistent, private, replayable, or externally auditable? |
| Platforms | Browser, mobile, desktop, console, cross-play, and supported version window? |
| Geography | Regions, relay requirements, residency limits, and expected route variability? |
| Recovery | Late join, reconnect, resume, host migration, rollback, and protocol mismatch policy? |

If a product fact is unknown, preserve it as an explicit assumption with an owner and a
decision deadline.

## 2. Topology

| Model | Fits when | Primary liabilities | Required proof |
|---|---|---|---|
| Dedicated authoritative | Fairness, hidden information, persistence, or match continuity needs an independent authority | Hosting, allocation, operations, regional capacity | Authority matrix, allocation lifecycle, capacity model, failure and drain behavior |
| Listen server | Small trusted sessions can accept host advantage and host loss | Host cheating, asymmetric latency, NAT reachability, migration complexity | Explicit risk acceptance, host-loss behavior, relay plan, migration test if promised |
| Relay-assisted peer | Peers need reachability or IP shielding but game trust may remain peer-owned | Relay cost does not remove peer cheating or consensus problems | Signaling, relay fallback, identity binding, peer authority decision |
| Deterministic lockstep | Inputs are compact, simulation is deterministic, and waiting for the slowest required input is acceptable | Cross-platform determinism, stalls, late join and replay complexity | Determinism tests on every target, input ordering, checksum and resync policy |
| Asynchronous service | Commands or turns can resolve without a continuous simulation | Conflict, idempotency, stale views, notification and resume behavior | Command legality, versioned state transitions, duplicate handling, snapshot recovery |

A product may compose models, but one owner must remain authoritative for each state domain.

## 3. Authority matrix

Use one row per state domain:

| Domain | Authority | Client may send | Authority validates | Client receives |
|---|---|---|---|---|
| Movement | Product decision | Input intent or target request | Speed, timing, collision, state legality | Owned correction plus relevant remote state |
| Combat or actions | Product decision | Fire, cast, interact, or target intent | Cooldown, resources, visibility, hit or rule legality | Confirmed result and permitted effects |
| Inventory and economy | Usually trusted service or server | Purchase, equip, craft, or consume request | Ownership, price, balance, idempotency, transaction state | Authorized inventory result |
| Match state | Match authority | Ready, vote, surrender, or rematch request | Membership, phase, quorum, sequence | Canonical phase and outcome |
| Hidden information | Match authority | Legal reveal or use request | Entitlement and timing | Only information this client may know |
| Presentation | Local client | Local settings | Local constraints only | Local state |

"Server authoritative" is incomplete until every gameplay-critical row names an allowed
client request and concrete validation.

## 4. Replication model

| Mechanism | Use for | Do not use as |
|---|---|---|
| Command or turn replication | Discrete legal transitions where ordering and idempotency matter | A substitute for a canonical snapshot after reconnect |
| State snapshots or deltas | Non-deterministic real-time worlds and late-join state | Permission to send every entity to every client |
| Input lockstep | Deterministic simulations with bounded participants and stable input cadence | A default for cross-platform floating-point simulations |
| Prediction and reconciliation | Latency-sensitive state owned locally for presentation but confirmed by authority | Authority for inventory, economy, match result, or hidden data |
| Interpolation | Smooth remote presentation from delayed samples | Truth for collision, damage, or authoritative logic |
| Lag compensation | A bounded fairness policy for selected historical interactions | Universal rewind or a reason to trust timestamps supplied by clients |
| Relevance and priority | Limit state by client interest and urgency | A security boundary by itself; unauthorized hidden data must not be sent |

For each message class record: producer, consumer, reliability, ordering, freshness,
maximum accepted size, overflow behavior, resync trigger, and observability fields.

## 5. Browser transport

| Transport | Useful properties | Decision risks |
|---|---|---|
| WebSocket | Stable browser support, bidirectional client-server session, simple infrastructure | Classic browser API has no backpressure; reliable ordered delivery can queue stale traffic; security is application-owned |
| RTCDataChannel | Encrypted peer channel, SCTP delivery controls, buffered amount visibility | Requires signaling and NAT traversal; peer encryption does not create a trusted gameplay authority |
| WebTransport | HTTP/3 streams and datagrams, reliable and unreliable delivery in one API | Secure context and HTTP/3 server required; support on older target browsers must be measured; operational stack is more complex |
| Engine transport | Integrated replication, channels, and tooling | Version and platform support vary; defaults are not product budgets; engine APIs still need an authority contract |

Transport selection must include a tested compatibility matrix and fallback. Do not claim
one option is universally fastest.

## 6. Session lifecycle

Model the states and transitions explicitly. A useful starting vocabulary is:

`queued -> matched -> allocated -> connecting -> authenticating -> joining -> ready -> playing -> reconnecting -> finished -> persisted -> closed`

Products may rename or omit states, but must define:

- who owns each transition and its timeout;
- idempotency key or sequence behavior on retries;
- client and server behavior for duplicate, late, or stale messages;
- version negotiation before state mutation;
- reconnect token, canonical resnapshot, and duplicate-reward prevention;
- drain, crash, and shutdown behavior for the match authority;
- whether matchmaking retries, server allocation retries, or the match itself resumes.

Matchmaking chooses a candidate group. Allocation provides a reachable game authority.
Simulation enforces game rules. Keep their data models and failure handling separate.

## 7. Numeric budgets

Do not import tick rate, snapshot rate, interpolation delay, lag window, player count,
bandwidth, queue size, timeout, or rate limit from a different engine or game.

For every proposed number record:

1. mechanic or threat it protects;
2. target device and network population;
3. CPU, memory, bandwidth, and latency cost;
4. measurement method and sample states;
5. acceptance threshold owner;
6. rollback or degradation behavior if the budget is missed.
