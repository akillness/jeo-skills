# Source notes and claim ledger

Retrieval date: 2026-08-28

This skill is a synthesis. It does not copy one marketplace skill or one engine's defaults.
Each operational claim below is tied to a current first-party standard, engine document, or
primary technical source. Numeric examples from other games are never treated as universal
budgets.

## Claim ledger

| Skill claim | Source evidence | How it is used |
|---|---|---|
| Plan the game and test loop before implementation | [OpenAI Codex: Create browser-based games](https://developers.openai.com/codex/use-cases/browser-games) says to define goal, main loop, controls, win/fail states, progression, visual direction, stack, and milestone order, then test in a live browser. [OpenAI game-studio](https://github.com/openai/plugins/blob/main/plugins/game-studio/skills/game-studio/SKILL.md) routes design, implementation, UI, assets, and playtest after classifying the runtime. | The multiplayer contract is frozen before engine or backend code and ends with an evidence loop. |
| Multiplayer must be planned early and the server may own canonical state | [Epic Unreal Networking Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/networking-overview-for-unreal-engine) warns that late multiplayer retrofits require broad gameplay rewrites and describes the server as the authoritative game state that replicates to clients. | The skill starts with a session envelope and an authority matrix rather than a transport choice. |
| Authority is explicit and client input is untrusted for critical state | [Godot High-level multiplayer](https://docs.godotengine.org/en/stable/tutorials/networking/high_level_multiplayer.html) documents server-default RPC authority, reliable and unreliable transfer modes, channels, authentication, and secure design: validate RPC arguments and do not trust client positions, timers, cooldowns, resources, or outcomes. | Clients send intent for critical state; authority validates per domain. Presentation and speculative visuals may remain local. |
| Engine tooling must be measured, not assumed | [Unity Networking tools and utilities](https://docs.unity.com/en-us/multiplayer/netcode/networking-utilities) points to a network profiler, network simulator, multiplayer play mode, transport, and dedicated-server tooling. | The skill routes Unity APIs outward and requires impairment and process-separated tests instead of copied targets. |
| Classic WebSocket is stable but lacks backpressure | [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) describes broad support and explicitly states that the classic `WebSocket` interface has no backpressure. It contrasts WebTransport streams and datagrams with the simpler WebSocket API. | Every WebSocket contract must define bounded queues, overflow, slow-reader, close, and resync behavior. |
| RTCDataChannel encryption does not provide gameplay authority | [MDN Using WebRTC data channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels) documents automatic DTLS encryption, buffering, message-size negotiation, and automatic or out-of-band channel negotiation. | Peer messages remain untrusted game input. Signaling, identity, buffering, delivery policy, NAT traversal, and authority are separate decisions. |
| WebTransport combines streams and datagrams but needs compatibility evidence | [MDN WebTransport](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport) documents HTTPS/HTTP/3, bidirectional and unidirectional streams, datagrams, reliability information, and varying support on older devices and browsers. | The contract records server requirements, target-browser proof, message classes, fallback, and feature detection. |
| Browser WebSocket security is application-owned | [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) covers WSS, explicit Origin allowlists, session expiry, per-message authorization, input validation, replay defense, size and rate limits, backpressure, logging, and security tests. | Security and lifecycle are designed together. The skill does not copy OWASP's illustrative size or timing values as product defaults. |
| Matchmaking is not the match simulation | [Open Match Overview](https://open-match.dev/site/docs/overview/) defines Open Match as a framework for scalable, extensible matchmaking while developers retain control over match logic. | Matchmaking, game-server allocation, and authoritative match simulation are separate components and failure domains. |
| Prediction, interpolation, reconciliation, and lag compensation solve different problems | [Valve Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) separately explains ticks, snapshots, interpolation, input prediction, correction, and lag compensation. [Gaffer on Games: Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/) explains delayed snapshot buffering under jitter and loss. | The skill selects techniques per data class. Source-specific rates and delays are examples, not defaults for another game. |

## Source hierarchy

1. Standards and security guidance for protocol behavior.
2. Current first-party engine documentation for engine semantics and tools.
3. Current official product documentation for workflow and service boundaries.
4. Primary technical articles for transferable concepts, with publication age noted.
5. Marketplace and community skill files only as discovery leads, never as sole proof.

## Explicit non-claims

- No tick, snapshot, interpolation, lag, timeout, queue, bandwidth, or player-count value is
  universally correct.
- Encryption does not make a peer authoritative or a command legal.
- A relay does not remove host advantage or peer cheating.
- Reliable ordered delivery is not automatically suitable for every time-sensitive update.
- One localhost process does not prove multiplayer correctness.
- Matchmaking software does not allocate servers or enforce gameplay rules unless the chosen
  system explicitly implements those responsibilities.
