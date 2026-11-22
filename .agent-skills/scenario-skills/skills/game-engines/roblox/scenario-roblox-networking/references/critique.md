# Critique rubric: networking and security

Score your own output before calling it done. Each line is pass or fail; a fail names the fix. The
measurable lines come from `rbx_net.audit_place`, `NetAudit.run`, `ServerStorage.NetLog` counters
and the live tests in [procedures.md](procedures.md).

## Blocking (any fail means not done)

| Check               | Pass when                                                                                                  | How to measure                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Remote inventory    | Every RemoteEvent, UnreliableRemoteEvent and RemoteFunction has a server handler or is a declared honeypot | Audit: no `remote-unreachable`, lead Audit lists no remote without handler                           |
| Validation          | Every handler checks type, `math.isfinite`, range, string bytes and UTF-8, instance ancestry               | Audit: no `handler-unvalidated`, `nan-unsafe`; fuzz: `ok_<Remote>` stays at the count of valid cases |
| Intent only         | No client price, damage, currency amount, victim or authoritative position used as is                      | Audit: no `trusted-value`, `spatial-claim`; fuzz: balances and health unchanged                      |
| Rate                | Every client-to-server remote and prompt has a per-UserId limit, cleared on PlayerRemoving                 | Audit: no `no-rate-limit`; spam: grants equal the cooldown math                                      |
| Idempotence         | Spam of a reward or purchase grants at most what the server clock allows                                   | Spam test: 1,000 fires, one grant                                                                    |
| Interactive surface | Prompt, ClickDetector, DragDetector and Touched handlers re-check distance, state and rate                 | Audit: no `interaction-unchecked`, `touched-trusted`, `unanchored-interactive`                       |
| Ownership           | Parts that decide outcomes are anchored or `SetNetworkOwner(nil)`                                          | Server `GetNetworkOwner()` on each; client write moves nothing on the server                         |
| No InvokeClient     | The server never waits on a client                                                                         | Lead Audit: no `InvokeClient` finding                                                                |
| Purchases           | Grants happen only in `ProcessReceipt`                                                                     | Audit: no `purchase-signal`                                                                          |
| Script health       | No server error from your handlers during the fuzz                                                         | Console slice during the fuzz has no `ServerScriptService.<script>:<line>` lines                     |

## Quality (fix before shipping a live game)

| Check          | Pass when                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movement       | Server Authority for new competitive games, tested with held keys and an honest-walk control; otherwise MoveGuard with grace on every server teleport, honest walk 0 flags             |
| Hit validation | Rewind window or cone check; static-only obstruction; hit rate at 100 ms each way within 0.2 of the no-latency baseline                                                                |
| Consequences   | Ladder log, mitigate, restrict, enforce; enforce needs two distinct reasons; visible action delayed 20 to 90 s                                                                         |
| Honeypots      | At least one decoy remote and every server-to-client remote bound with `Net.serverOnly`                                                                                                |
| Unreliable use | Only cosmetic, frequent data; payloads measured under 1,000 bytes after packing; sequence numbers drop stale packets                                                                   |
| Bandwidth      | Sends on change, not per frame; no per-frame fire in RenderStepped or Heartbeat loops (`per-frame-fire`)                                                                               |
| Ordering       | Values the client needs travel in the remote; no handler connected inside another handler's fire; cleanup state read before `Destroy` ([procedures.md](procedures.md), Ordering traps) |
| Current APIs   | `time()` in gameplay timing, `ExcludeInstances` or `IncludeInstances`, `Async` names (`legacy-clock`, `raycast-filter`)                                                                |

## Judgment questions

- Can an exploiter call this at any distance, any time, any rate, with garbage arguments? Answer for
  each handler.
- Which single server value would an exploiter most like to change, and which handler writes it?
- What does a legitimate player at 200 ms ping see when your check rejects them? A rejection must
  never punish lag.
- Would a record-breaking honest player trip one heuristic? Then that heuristic alone must not
  enforce.
- Does any log, kick message or ban reason tell the exploiter which check fired?
