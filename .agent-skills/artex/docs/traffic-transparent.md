# Opt-in Linux Transparent TCP Inbound & Raw TCP Recording (P4.1b)

ARTEX ships an opt-in **Linux-only IPv4 transparent TCP inbound listener** in `traffic/` that accepts connections redirected by `iptables` or `nftables` `REDIRECT` rules, recovers each socket's original IPv4 destination via `getsockopt(SOL_IP, SO_ORIGINAL_DST)`, enforces the existing target gate and egress governor before dialing, and records the connection in SQLite `raw_tcp_streams`.

## Opt-in Configuration (Off by Default)

| Environment Variable | Default | Behavior |
|---|---|---|
| `ARTEX_TRANSPARENT_TCP_ENABLED` | unset (off) | Set to `1` / `true` / `on` / `yes` to start the transparent TCP listener on `127.0.0.1:1081` (IPv4 loopback). Explicit `0` / `false` / `off` / `no` forces it off even if `ARTEX_TRANSPARENT_TCP_ADDR` is set. |
| `ARTEX_TRANSPARENT_TCP_ADDR` | `127.0.0.1:1081` | Explicit IPv4 TCP bind address; setting a non-empty value also enables the listener unless `ARTEX_TRANSPARENT_TCP_ENABLED` is explicitly false. Use `0.0.0.0:1081` only when redirecting traffic from other interfaces (`PREROUTING`) and protect the port with a host firewall. |

- **Flag off**: no transparent TCP listener is started, no firewall rules are touched, and the HTTP MITM proxy is unchanged.
- **Requires traffic recorder**: the server only starts the transparent TCP listener when the traffic recorder is enabled (inside the traffic proxy block in `server/manager.go`). If traffic capture is disabled, setting these environment variables does not open a listener.
- **Linux only**: on non-Linux operating systems (`windows`, `darwin`), leaving the flag off is a no-op; explicitly enabling it logs `ErrTransparentTCPNotLinux` and leaves the listener disabled.
- **IPv4 only (IPv6 not covered)**: P4.1b recovers `SO_ORIGINAL_DST` (`SOL_IP`, `AF_INET`) for IPv4 TCP sockets only. IPv6 (`IP6T_SO_ORIGINAL_DST`) is **not covered**; IPv6 bind addresses and IPv6 sockets are refused.
- **Firewall never touched by ARTEX**: ARTEX never installs, modifies, or deletes `iptables`/`nftables` rules. Root or `CAP_NET_ADMIN` is required **only** by the operator when installing and cleaning up the host redirect rules—never to run ARTEX itself.

## Firewall Rules & Cleanup (Operator-Managed)

Choose **either** `iptables` **or** `nftables`. Always exclude the UID running ARTEX (example: `artex`) from local `OUTPUT` redirect rules so ARTEX's own outbound dials do not loop back into the transparent listener.

### Option 1: `iptables` (IPv4 local `OUTPUT` REDIRECT)

Install into a dedicated chain so cleanup is atomic:

```bash
# Requires root or CAP_NET_ADMIN
sudo iptables -t nat -N ARTEX_TRANSPARENT
# Never redirect ARTEX's own outbound dials or loopback traffic
sudo iptables -t nat -A ARTEX_TRANSPARENT -m owner --uid-owner artex -j RETURN
sudo iptables -t nat -A ARTEX_TRANSPARENT -d 127.0.0.0/8 -j RETURN
# Example: redirect outbound TCP to lab target 198.51.100.0/24 into ARTEX on 127.0.0.1:1081
sudo iptables -t nat -A ARTEX_TRANSPARENT -p tcp -d 198.51.100.0/24 -j REDIRECT --to-ports 1081
sudo iptables -t nat -A OUTPUT -p tcp -j ARTEX_TRANSPARENT
```

Cleanup (exact removal):

```bash
sudo iptables -t nat -D OUTPUT -p tcp -j ARTEX_TRANSPARENT
sudo iptables -t nat -F ARTEX_TRANSPARENT
sudo iptables -t nat -X ARTEX_TRANSPARENT
```

*(For traffic arriving on another interface—for example a container or routed VM—bind `ARTEX_TRANSPARENT_TCP_ADDR=0.0.0.0:1081`, attach `ARTEX_TRANSPARENT` to `PREROUTING` instead of `OUTPUT`, and drop direct non-redirected packets to port 1081 at the host firewall.)*

### Option 2: `nftables` (IPv4 local `OUTPUT` REDIRECT)

Install into a dedicated table so cleanup is a single command:

```bash
# Requires root or CAP_NET_ADMIN
sudo nft -f - <<'NFT'
table ip artex_transparent {
  chain output {
    type nat hook output priority -100; policy accept;
    meta skuid "artex" return
    ip daddr 127.0.0.0/8 return
    ip daddr 198.51.100.0/24 tcp redirect to :1081
  }
}
NFT
```

Cleanup (exact removal):

```bash
sudo nft delete table ip artex_transparent
```

## Policy Enforcement, Loop Guard & Storage (Shared with P4.1a)

For every accepted TCP connection:

1. **Original destination recovery**: reads `getsockopt(SOL_IP, SO_ORIGINAL_DST)` under `HandshakeTimeout` (default `10s`), parses `struct sockaddr_in` (rejecting short buffers, non-`AF_INET` families including IPv6, port `0`, and `0.0.0.0`), and rejects **self-redirects** (direct non-redirected connections where `SO_ORIGINAL_DST` equals the listener's own address/port) before dialing.
2. **Egress governor (`egress.Do(egress.Current(), ...)`)**: enforces the active noise profile (`PaceTimeout`, default `30s`) before dialing.
3. **Target gate (`intercept.Interceptor.DialSOCKS5` / `intercept.PinnedDialer`)**: enforces global asset block rules and any enabled `intercept.TargetScope` pins/exemptions before opening any outbound socket. Because the transparent listener only knows the recovered destination IP (never a DNS hostname), hostname-based block or allow rules cannot match—IP and CIDR rules are the ones that apply. Refused connections are closed immediately without dialing and without writing a store row.
4. **Relay & bounds**: reuses the P4.1a full-duplex half-close-aware relay (`CloseWrite`) and defaults (`MaxConcurrent=64`, `MaxBytesPerDir=4 MiB`, `PreviewBytes=8 KiB`, `IdleTimeout=2m`, `HandshakeTimeout=10s`, `DialTimeout=30s`, `PaceTimeout=30s`).
5. **SQLite storage**: records one row per completed connection in `raw_tcp_streams` (`protocol='tcp'`, atomic temp+rename `_blobs/sha256/` spill + `blob_refs`), with **zero HTTP `exchanges` rows** and **no PostgreSQL migration**.

Closing `Traffic` stops accepting new transparent connections, closes active sockets, and waits for all handler goroutines to exit before closing SQLite.
