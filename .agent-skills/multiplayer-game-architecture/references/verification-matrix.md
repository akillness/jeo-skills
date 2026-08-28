# Multiplayer verification matrix

A localhost demo proves only that two endpoints can exchange messages. It does not prove
authority, recovery, fairness, security, capacity, or playability on real networks.

## Evidence rules

- Run clients as separate processes or browsers with no shared in-memory game state.
- Capture the server's canonical state, each client's rendered state, input or command
  sequence, protocol version, and correlation identifiers.
- Keep network condition, build SHA, server version, test seed, and scenario name with every
  result.
- Report observed distributions and failures. Do not replace evidence with a single average.
- Derive pass thresholds from the game's mechanic and target population.
- Test both success and rejection paths. A server that accepts legal commands but also accepts
  an impossible action is not authoritative.

## Minimum matrix

| Surface | Clean-path proof | Adverse-path proof |
|---|---|---|
| Connect and join | Two independent clients authenticate and reach one canonical match | Bad token, wrong origin, incompatible protocol, full match, and allocation failure are rejected cleanly |
| Authority | Legal input changes canonical state once | Impossible movement, stale cooldown, forged inventory, hidden-state request, and duplicate command leave state unchanged |
| Ordering and idempotency | Commands apply in one documented order | Duplicate, delayed, reordered, and replayed commands do not duplicate rewards or corrupt state |
| Replication | Relevant clients converge on canonical state | Dropped or stale updates trigger interpolation, replacement, correction, or resync as designed |
| Prediction | Owned actions feel responsive and reconcile by sequence | Misprediction is corrected without permanent divergence or applying an input twice |
| Reconnect | A client resumes from a canonical snapshot | Disconnect during mutation, expired token, replaced session, and repeated reconnect stay safe |
| Late join or spectator | New client receives only permitted current state | Hidden history and unauthorized private state are absent |
| Match finish | One result persists and clients close cleanly | Repeated finish, server crash near finish, and retry do not grant duplicate outcomes |
| Backpressure | Queues remain bounded under expected traffic | Slow reader, oversized message, burst, and downstream pause trigger defined shedding or disconnect behavior |
| Observability | Match, connection, sequence, and rejection reason correlate across logs | Tokens, private chat, hidden state, and credentials are absent from logs |

## Network impairment dimensions

Create at least one clean and one impaired condition in `multiplayer-contract.json`.
Vary dimensions independently first, then combine realistic cases:

- one-way and round-trip latency;
- jitter and bursty delivery;
- packet or message loss where the transport can expose it;
- reordering and duplication where the protocol or test harness permits it;
- bandwidth cap, queue growth, and slow consumers;
- brief disconnect, long disconnect, and reconnect while a state mutation is pending;
- server pause, overload, process restart, drain, and allocation failure;
- client backgrounding, mobile network change, browser refresh, and version mismatch.

Do not claim that a transport can exhibit an impairment the selected API hides. For example,
classic WebSocket presents reliable ordered messages to the browser, so exercise stalled
queues, disconnects, and application-level duplication rather than pretending JavaScript can
observe raw UDP packet order.

## Transport-specific security checks

### WebSocket

- production uses `wss://`;
- handshake origin is checked against an explicit allowlist;
- authentication is bound to the connection and expires or revokes correctly;
- each message is schema-validated and separately authorized;
- message size, per-user rate, total connection, idle, and queue limits exist;
- logout and session expiry close active connections;
- logs capture event type and rejection reason without message bodies or tokens.

### RTCDataChannel

- signaling identity is authenticated and binds the intended peers;
- ICE and relay behavior is tested on target networks;
- delivery mode and channel buffering are explicit per message class;
- peer data is treated as untrusted gameplay input despite DTLS encryption;
- host loss, peer departure, and relay fallback match the topology contract.

### WebTransport

- target browsers and older supported versions are verified directly;
- HTTPS, HTTP/3, certificate, proxy, and server support are proven in the deploy environment;
- stream and datagram message classes have separate ordering and loss policies;
- fallback and feature detection are tested, not only documented;
- datagram loss never corrupts authoritative state.

## Release evidence packet

Before calling the multiplayer slice ready, return:

```markdown
## Multiplayer verification
- Build and protocol: <SHA and version>
- Topology and authority: <model and highest-risk domain>
- Client separation: <process/browser evidence>
- Network conditions: <clean and impaired cases>
- Authority rejections: <cases and canonical-state result>
- Recovery: <disconnect/reconnect/late-join result>
- Security: <origin/authz/schema/rate/size/session checks>
- Observability: <metrics and correlation IDs observed>
- Remaining risk: <unproven platform, region, load, or failure mode>
```
