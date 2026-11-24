# Opt-in SOCKS5 UDP ASSOCIATE & Raw UDP Recording (P4.1c)

ARTEX extends the opt-in SOCKS5 inbound listener with **RFC 1928 `UDP ASSOCIATE` (`0x03`)**, **IPv4 first**, enforcing per-datagram destination policy and recording forwarded datagrams separately from HTTP traffic in SQLite. Transparent UDP (`IP_RECVORIGDSTADDR`) is out of scope here and planned separately (C2).

## Opt-in Configuration (Off by Default)

| Environment Variable | Default | Behavior |
|---|---|---|
| `ARTEX_SOCKS5_UDP_ENABLED` | unset (off) | Set to `1` / `true` / `on` / `yes` to enable RFC 1928 `UDP ASSOCIATE` on the SOCKS5 listener (starting the SOCKS5 listener on `ARTEX_SOCKS5_ADDR` or `127.0.0.1:1080` unless `ARTEX_SOCKS5_ENABLED` is explicitly `0`/`false`/`off`/`no`). |
| `ARTEX_SOCKS5_ENABLED` | unset (off) | Explicit `0` / `false` / `off` / `no` disables the entire SOCKS5 listener (TCP and UDP) even if `ARTEX_SOCKS5_UDP_ENABLED` is set. |
| `ARTEX_SOCKS5_ADDR` | `127.0.0.1:1080` | Bind address for the SOCKS5 TCP control listener; per-association IPv4 UDP relay sockets bind on the same local IPv4 interface on an ephemeral port (`:0`). |

- **Flag off means no listener**:
  - With all SOCKS5 flags unset/off, no SOCKS5 listener and no UDP relay socket are started.
  - With SOCKS5 TCP enabled and `ARTEX_SOCKS5_UDP_ENABLED` off, `UDP ASSOCIATE` (`0x03`) is refused with RFC 1928 reply `0x07` (*Command not supported*) and no UDP socket is opened.
- **Requires traffic recorder**: like P4.1a and P4.1b, the server only starts the SOCKS5 listener when the traffic recorder is enabled (inside the traffic proxy block in `server/manager.go`).
- **Non-loopback warning**: the same authentication caveat from [docs/traffic-socks5.md](traffic-socks5.md) applies—RFC 1929 username/password accepts any credentials, so keep the listener bound to loopback (`127.0.0.1`) or restrict access at the host firewall.

## Protocol Scope & Lifetime

- **IPv4 first**:
  - `UDP ASSOCIATE` accepts IPv4 (`0x01`) and domain (`0x03`) requests (including `0.0.0.0:0` per RFC 1928 §4). IPv6 (`0x04`) `UDP ASSOCIATE` requests return `0x08` (*Address type not supported*); IPv6 UDP datagram destinations are dropped.
  - Each client UDP datagram header (`RSV=0x0000`, `FRAG=0x00`, `ATYP=0x01` IPv4 or `ATYP=0x03` domain resolved to IPv4) is parsed individually.
- **No fragmentation reassembly**:
  - Per RFC 1928 §7, datagrams with `FRAG != 0` are dropped without reassembly.
  - Each forwarded `FRAG == 0` datagram (and each upstream reply datagram) is recorded as it arrives without cross-datagram reassembly.
- **Client source pinning**:
  - Incoming client UDP datagrams on the ephemeral relay port are accepted only from the expected IPv4 client address (the `DST.ADDR`/`DST.PORT` given in `UDP ASSOCIATE`, or the TCP control connection's peer IP pinned on the first valid datagram).
  - Upstream reply datagrams are accepted only from destinations (`ip:port`) to which the association previously forwarded an allowed datagram.
- **Tied to the TCP control connection**:
  - Closing the SOCKS5 TCP control connection immediately closes both UDP sockets and terminates the association.
  - Exceeding `UDPIdleTimeout`, `UDPMaxDatagrams`, or `UDPMaxBytes`, or calling `Traffic.Close()`, also closes the association and its TCP control connection cleanly.

## Policy Enforcement Per Datagram Destination

Before forwarding **every** client-to-server UDP datagram to `(host, port)`:

1. **Target gate (`intercept.Interceptor.ResolveUDP4` / `intercept.PinnedUDP4Resolver`)**: enforces global asset block rules (domain, IP, and CIDR, before and after fresh IPv4 DNS resolution) and any enabled `intercept.TargetScope` pins/exemptions, returning the verified IPv4 `*net.UDPAddr`.
2. **Egress governor (`egress.Do(egress.Current(), ...)`)**: enforces the active noise profile (`PaceTimeout`, default `30s`) before sending.
3. **Fail-closed drop (no silent passthrough)**: any datagram whose destination is denied by the target gate, fails DNS/IPv4 resolution, or is refused by the egress governor is **dropped** without sending bytes upstream and without recording a forwarded datagram. Subsequent allowed datagrams on the same association continue normally.

## Raw UDP Storage (SQLite)

Each forwarded datagram writes one row to the `raw_udp_datagrams` table in the SQLite traffic index (`traffic/traffic.go`, `indexSchema` — no PostgreSQL migration):

- Columns: `id` (`udp-<ms>-<seq>`), `association_id` (`udpa-<ms>-<seq>`), `protocol` (`'udp'`), `host`, `port`, `direction` (`'c2s'` | `'s2c'`), `ts` (unix milliseconds), `size`, `preview`, `blob`.
- **No HTTP exchange row**: raw UDP datagrams never insert into `exchanges`.
- **Preview & atomic blob spilling**:
  - Payloads up to `UDPPreviewBytes` (default `8 KiB`) stay inline in `preview`.
  - Payloads above `UDPPreviewBytes` keep the leading `UDPPreviewBytes` inline and spill the full datagram payload atomically (temp file + rename) into `_blobs/sha256/` with a reference registered in `blob_refs` under the datagram's `udp-*` ID.

## Operational Bounds

| Parameter | Default |
|---|---|
| `MaxConcurrent` | `64` active TCP streams + UDP associations combined |
| `UDPMaxDatagrams` | `1000` forwarded datagrams (`c2s` + `s2c`) per association |
| `UDPMaxBytes` | `4 MiB` forwarded payload bytes (`c2s` + `s2c`) per association |
| `UDPPreviewBytes` | `8 KiB` inline preview per datagram before blob spill |
| `UDPIdleTimeout` | `2m` inactivity timeout per association |
| `HandshakeTimeout` | `10s` for greeting, auth, and `UDP ASSOCIATE` request |
| `DialTimeout` | `30s` per-datagram target gate / DNS lookup bound |
| `PaceTimeout` | `30s` per-datagram egress governor wait bound |
