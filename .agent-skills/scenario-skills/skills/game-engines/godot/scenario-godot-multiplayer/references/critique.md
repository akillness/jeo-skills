# scenario-godot-multiplayer critique rubric

Score each line pass, fail or not applicable, with the evidence (file, test id, number). A networked
feature ships only when every applicable line passes or the brief accepts the gap in writing.

## Design

1. Every networked object has a named owner (server or peer) and the reason; no client-owned health,
   score, inventory or position in a game where cheating matters.
2. Each piece of state is classified: synchronizer property (with mode and interval), RPC event
   (mode, sync, transfer, channel), or local only (animation, effects, seeds).
3. Late join, leave and reconnect are specified: what a late joiner receives, what is freed when a
   peer leaves.
4. The target RTT and player count are written down, and whether prediction is needed at that RTT.
5. Platform transports listed: ENet desktop and mobile, WebSocket or WebRTC for browsers, `wss://`
   under HTTPS.

## Code

6. Player nodes are named by peer id and added with `add_child(node, true)`; authority is set in
   `_enter_tree` from the name.
7. Server-only logic is behind `multiplayer.is_server()`; non-authority copies return early from
   simulation.
8. Every `any_peer` RPC reads `get_remote_sender_id()` before any `await` and validates the sender
   and the values (`gd_net.rpc_audit` clean, or each flag justified).
9. Server and client use the same script per node path; any variant pair passes
   `gd_net.rpc_pair_check`.
10. No Object, Resource, Callable or RID crosses the network (RPC args or synchronizer properties);
    `net_audit` clean.
11. No Godot 3 networking names; nothing assumes a host `peer_connected` for id 1.
12. The server frame rate is capped or intervals are set; ALWAYS only for values that change most
    frames. 12a. Client info is sent from `connected_to_server`, registries skip peer id 0,
    `spawn_limit` is 0 or at least the max player count, and no side effect (server start, connect)
    sits inside `assert()` (stripped in release exports, M15). 12b. The plan says what server
    authority does not stop (wall hacks, aimbots) and what interest management covers; web plans
    state WebSocket head-of-line blocking and a reconnect path for background tabs; service builds
    set `flush_stdout_on_print`.

## Evidence (live)

13. A session with a server and at least 2 clients (3 for anything a bystander sees) passes:
    `players_seen_max` equals the count on every peer; the late joiner sees everyone; the leaver's
    node is gone on every peer.
14. Authority report: expected owner for body and input on every peer.
15. Forged requests (other player's object, impossible values) are rejected and logged; the honest
    request is accepted.
16. The same session at 100 ms and 250 ms RTT (plus jitter and loss for action games): RPC RTT,
    remote view delay and own input to motion recorded and judged against the genre.
17. Bandwidth per client at max players, from counters, per mode and interval; under budget.
18. Logs clean except whitelisted exact texts (disconnect race), with the reason written next to the
    whitelist.
19. For web: the browser build joins the server and sees the other players.
20. For a dedicated server: exported in dedicated mode, the boot dict shows
    `dedicated_server_feature` true and display `headless`, the pack report has no client textures,
    the binary hosts clients and exits 0.

## Visual

21. An observer capture (or a browser screenshot) shows every player where the server trajectory
    says, with no missing or duplicated nodes. Opened and looked at, not only checked by size.
22. Under 250 ms RTT, remote motion is continuous; no streak or slide after a teleport or respawn.

## Report

23. Verified (what ran, ports, numbers, files) separated from Assumed (backends, cloud, devices not
    tested). Third-party addons and services named with the reason they did not run.
