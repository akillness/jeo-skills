# scenario-godot-multiplayer sources

Notes for each source: `notes/multiplayer-networking/`. Credentials as stated in the videos
(unverified unless the channel is official). Retrieved 2026-10-02.

## Videos

| Id          | Expert, credential                                                             | URL                                         | Best for                                                                             | Best timestamps                                                      |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| iP_xdJ0peFo | Tamas Galffy, netfox author (GodotCon 2026, Godot Engine channel)              | https://www.youtube.com/watch?v=iP_xdJ0peFo | authority models shown live, test with latency and 3 players, netfox recipe, NAT     | 00:03:46, 00:06:47, 00:09:58, 00:11:32, 00:28:00, 00:42:31, 00:45:25 |
| jff9oxO8v1s | AndrooDev (Jon Andrew Davis), indie dev                                        | https://www.youtube.com/watch?v=jff9oxO8v1s | compact authority model, client vs server authority choice                           | 00:04:01, 00:05:23, 00:07:04                                         |
| GqHTNmRspjU | BatteryAcidDev, with netfox maintainer ElementBound                            | https://www.youtube.com/watch?v=GqHTNmRspjU | input-only authority, netfox rollback wiring                                         | 00:00:33, 00:06:58, 00:18:55, 00:21:24, 00:34:53                     |
| jgJuX04cq7k | BatteryAcidDev                                                                 | https://www.youtube.com/watch?v=jgJuX04cq7k | dedicated server export, Strip Visuals, Linux deploy                                 | 00:04:47, 00:06:30, 00:16:15, 00:18:34                               |
| nyKBuM9Y_-Q | Davide Di Staso, Hathora addon author, shipped "In Good Faith" (GodotCon 2024) | https://www.youtube.com/watch?v=nyKBuM9Y_-Q | one codebase, run instances with feature tags, spawner-driven levels, visibility     | 00:06:55, 00:08:33, 00:11:31, 00:14:29                               |
| tK2ACXUGcrY | Travis Hunter (GodotCon 2025 workshop)                                         | https://www.youtube.com/watch?v=tK2ACXUGcrY | live bugs: host peer_connected, authority wrapper, auto names, intent over animation | 00:46:16, 00:52:03, 01:17:02, 01:25:43                               |
| wgIqB6JNcro | AndrooDev                                                                      | https://www.youtube.com/watch?v=wgIqB6JNcro | WebRTC P2P with Tube, server-side hits with an RPC to the shooter                    | 00:04:32, 00:07:18, 00:19:35, 00:39:08                               |
| MfjEB1cowsE | Luke Stampfli, Photon engineer (vendor)                                        | https://www.youtube.com/watch?v=MfjEB1cowsE | topologies, NAT failures, time sync, what servers do not stop                        | 00:07:20, 00:12:42, 00:18:55                                         |
| zvqQPbT8rAE | David Snopek, Godot Rollback Netcode author                                    | https://www.youtube.com/watch?v=zvqQPbT8rAE | deterministic rollback concepts (Godot 3 demos)                                      | 00:01:14, 00:10:40                                                   |
| e0JLO_5UgQo | FinePointCGI (Mitch)                                                           | https://www.youtube.com/watch?v=e0JLO_5UgQo | basics, connected_to_server vs peer_connected, host recursion bug (4.1 era code)     | 00:22:50, 00:42:32, 00:57:04                                         |
| pA9RGn87Uag | FinePointCGI (Mitch)                                                           | https://www.youtube.com/watch?v=pA9RGn87Uag | Nakama drop-in drop-out, phantom peer 0, idle sync                                   | 00:25:43, 00:42:16, 00:47:31                                         |
| sT0UPlJ2cpc | BatteryAcidDev                                                                 | https://www.youtube.com/watch?v=sT0UPlJ2cpc | choosing a backend, server size                                                      | 00:26:17                                                             |
| fUBdnocrc3Y | Gwizz                                                                          | https://www.youtube.com/watch?v=fUBdnocrc3Y | Steam lobby flow (custom build era)                                                  | whole video                                                          |
| YnfsyZJRsL8 | IcyEngine                                                                      | https://www.youtube.com/watch?v=YnfsyZJRsL8 | short high-level API tour                                                            | whole video                                                          |
| KBBJqPL5-eU | Nick Maltbie (Unity)                                                           | https://www.youtube.com/watch?v=KBBJqPL5-eU | engine-neutral vocabulary                                                            | 00:11:45                                                             |
| 9QtQ5iXj2U0 | Nightpath Studios (Godot 3.5, Colyseus)                                        | https://www.youtube.com/watch?v=9QtQ5iXj2U0 | external room server architecture only                                               | 00:04:13                                                             |

## Official docs (docs.godotengine.org, stable, 2026-10-02)

| Note                                     | Best for                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| doc-high-level-multiplayer               | RPC rules, checksum text, auth API, `add_child(node, true)`, channels, lobby pattern |
| doc-exporting-dedicated-server           | export mode, Strip Visuals, detection trio, `flush_stdout_on_print`                  |
| doc-multiplayer-spawner                  | spawn path, spawn function, `spawn_limit`, signals on remote peers only              |
| doc-multiplayer-synchronizer             | intervals per mode, visibility API, unsupported property types                       |
| doc-scripting-rpc-class (MultiplayerAPI) | `get_remote_sender_id`, `peer_connected` semantics, `poll`                           |
| doc-webrtc                               | WebRTC classes, native extension (page marked "not updated for 4.7")                 |

## Other

- `sources/godot-version-deltas.md` section 13 (networking): 4.3 protocol change, 4.5
  `get_node_rpc_config`, 4.6 `StreamPeerSocket`, 4.7.2 spawner fix.
- Godot 4.7.2 source, `main/main.cpp`: the `dedicated_server` feature forces the headless display
  and dummy audio drivers.
- ENet: `ENetPacketPeer.throttle_configure` and `PEER_PACKET_THROTTLE` (Godot class reference) for
  the throttle observation in procedures P8.
