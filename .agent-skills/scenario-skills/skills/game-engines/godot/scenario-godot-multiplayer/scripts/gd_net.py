#!/usr/bin/env python3
"""gd_net: multiplayer test harness for Godot 4.7.2 agents (scenario-godot-multiplayer 0.1).

System python3, standard library only. Builds on the scenario-godot-expert toolkit (gd_env, gd_run).

    import sys; sys.path[:0] = ["<skills>/scenario-godot-expert/scripts", "<skills>/scenario-godot-multiplayer/scripts"]
    import gd_net
    gd_net.install_netkit(P)                    # AgentKit + res://addons/agentkit/multiplayer/
    gd_net.build_scenes(P)                      # res://net/player.tscn, world.tscn, props (net_build.gd)
    roles = [gd_net.role("server", role="server", lobby_size=2, port=24010),
             gd_net.role("c1", role="client", index=0, port=24010, delay_s=0.3),
             gd_net.role("c2", role="client", index=1, port=24010, delay_s=0.3)]
    with gd_net.UdpLagProxy(24011, 24010, rtt_ms=100):   # clients use port 24011 to get 100 ms RTT
        s = gd_net.session(P, roles)
    s["roles"]["c1"]["result"]          # AGENT_RESULT of client 1
    gd_net.replication_delay(s["roles"]["server"]["result"]["traj"], s["roles"]["c1"]["result"]["traj"], pid)

Public API:
    install_netkit(project) -> Path
    build_scenes(project, dir="res://net", spawn_limit=0) -> dict
    role(name, script="res://addons/agentkit/multiplayer/net_session_job.gd", delay_s=0, headless=True,
         timeout=None, extra_args=None, fps=60, **cfg) -> dict
    role_clone(master, role_name, clone_root=None, refresh=True) -> Path
    session(master, roles, timeout=90, clone_root=None, env=None, refresh=True) -> dict
    UdpLagProxy(listen_port, target_port, one_way_ms=None, rtt_ms=None, jitter_ms=0, loss=0.0, reorder=False)
    TcpLagProxy(listen_port, target_port, one_way_ms=None, rtt_ms=None)
    replication_delay(server_traj, client_traj, pid, max_shift_ms=800, step_ms=5, min_speed=0.5) -> dict
    rpc_audit(root, skip=("addons/",)) -> dict            static @rpc scan + Godot 3 networking names
    rpc_pair_check(script_a, script_b) -> dict             do two scripts on one node path declare the same RPCs
    server_preset(project, name, platform, mode="strip", keep=(), remove=(), options=None) -> dict
    pack_report(zip_path, top=12) -> dict                  contents of an --export-pack .zip by extension
    run_binary(binary, user_args=(), engine_args=(), timeout=60, windowed_guard=True) -> dict

Why role clones: the scenario-godot-expert toolkit never runs two Godot processes on one project (one writer per
project, per-project lock). A session needs a server and several clients at once, so each role runs in
its own APFS clone of the master project (cp -cR, instant), refreshed with rsync (no deletions) before
each session; each clone gets its own application/config/name so user:// logs do not collide.
session() holds every machine slot BEFORE the first process starts: on a busy machine the whole session
waits, instead of a server that times out while its clients queue for a slot.
"""
from __future__ import annotations

__version__ = "0.1"

import bisect
import heapq
import json
import math
import os
import random
import re
import select
import shlex
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
import zipfile
from contextlib import ExitStack
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEAD = HERE.parent.parent / "scenario-godot-expert" / "scripts"
for p in (str(HERE), str(LEAD)):
    if p not in sys.path:
        sys.path.insert(0, p)
import gd_env  # noqa: E402
import gd_run  # noqa: E402

NETKIT_SRC = HERE / "agentkit" / "multiplayer"
NETKIT_RES = "res://addons/agentkit/multiplayer"
SESSION_JOB = f"{NETKIT_RES}/net_session_job.gd"


# ---------------------------------------------------------------- project setup

def install_netkit(project) -> Path:
    """Lead AgentKit into addons/agentkit/, this skill's kit into addons/agentkit/multiplayer/."""
    project = Path(project)
    gd_env.install_agentkit(project)
    dest = project / "addons" / "agentkit" / "multiplayer"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(NETKIT_SRC.glob("*.gd")):
        shutil.copy2(f, dest / f.name)
    (dest / "VERSION").write_text("netkit 0.1 (scenario-godot-multiplayer)\n")
    return dest


def build_scenes(project, dir: str = "res://net", spawn_limit: int = 0, timeout: float = 120) -> dict:
    return gd_run.run_script(project, f"{NETKIT_RES}/net_build.gd:build", {"dir": dir, "spawn_limit": spawn_limit},
                             timeout=timeout)


# ---------------------------------------------------------------- sessions

def role(name: str, script: str = SESSION_JOB, delay_s: float = 0.0, headless: bool = True, timeout: float | None = None,
         extra_args: list[str] | None = None, fps: int | None = 60, **cfg) -> dict:
    """One process of a session. cfg keys become the job's args (NetLab cfg for the default script).
    fps caps the loop with --max-fps (a headless loop runs at ~147 fps on this Mac otherwise, and a
    synchronizer with interval 0 sends once per loop)."""
    xa = list(extra_args or [])
    if fps:
        xa += ["--max-fps", str(int(fps))]
    return {"name": name, "script": script, "delay_s": float(delay_s), "headless": headless, "timeout": timeout,
            "extra_args": xa, "args": cfg}


def role_clone(master, role_name: str, clone_root=None, refresh: bool = True) -> Path:
    master = Path(master).resolve()
    root = Path(clone_root) if clone_root else master.parent / "_roles" / master.name
    dest = root / role_name
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        gd_env.clone_tree(master, dest)
    elif refresh and sys.platform == "win32":
        shutil.copytree(master, dest, symlinks=True, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".agent_out"))
    elif refresh:
        subprocess.run(["rsync", "-a", "--exclude", ".agent_out", f"{master}/", f"{dest}/"], check=True)
    name = gd_env.read_project(master).get("application/config/name", '"Net"').strip('"')
    gd_env.set_project_setting(dest, "application/config/name", json.dumps(f"{name}_{role_name}"))
    return dest


def _role_cmd(clone: Path, r: dict, out: Path, timeout: float) -> tuple[list[str], Path, Path]:
    job_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    stem = f"{r['name']}_{Path(r['script']).stem}"
    rf = out / "results" / f"{stem}_{job_id}.json"
    lp = out / "logs" / f"{stem}_{job_id}.log"
    rf.parent.mkdir(parents=True, exist_ok=True)
    lp.parent.mkdir(parents=True, exist_ok=True)
    cmd = [gd_run._godot()]
    if r["headless"]:
        cmd.append("--headless")
    else:
        cmd += ["--windowed", "--resolution", "160x90", "--position", "40,40"]
    cmd += ["--path", str(clone), "--script", gd_run._res_path(clone, r["script"])]
    cmd += r["extra_args"]
    cmd += ["--", "--agent-result", str(rf), "--agent-out", str(out), "--agent-timeout", str(max(5, int(timeout) - 10)),
            "--agent-args", json.dumps(r["args"])]
    return cmd, rf, lp


def session(master, roles: list[dict], timeout: float = 90, clone_root=None, env: dict | None = None,
            refresh: bool = True) -> dict:
    """Run every role at once (each in its own clone), return {ok, roles: {name: run dict}, duration_s}.

    Each role's run dict has the same keys as gd_run.run_script (ok, result, error, parse_errors,
    script_errors, engine_errors, log_path, ...). Roles start in delay_s order. A role's own timeout
    defaults to the session timeout. Only processes started here are ever killed.
    """
    master = Path(master).resolve()
    clones = {r["name"]: role_clone(master, r["name"], clone_root, refresh) for r in roles}
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    runs: dict[str, dict] = {}
    t_start = time.time()
    with ExitStack() as stack:
        for r in roles:
            stack.enter_context(gd_run.godot_slot(clones[r["name"]], windowed=not r["headless"]))
        procs = {}
        t0 = time.time()
        for r in sorted(roles, key=lambda x: x["delay_s"]):
            wait = t0 + r["delay_s"] - time.time()
            if wait > 0:
                time.sleep(wait)
            clone = clones[r["name"]]
            out = gd_run._ensure_out(clone, None)
            rt = r["timeout"] or timeout
            cmd, rf, lp = _role_cmd(clone, r, out, rt)
            fh = stack.enter_context(open(lp, "w"))
            fh.write(f"# {shlex.join(cmd)}\n")
            fh.flush()
            p = subprocess.Popen(cmd, cwd=str(clone), stdin=subprocess.DEVNULL, stdout=fh, stderr=subprocess.STDOUT,
                                 text=True, env=full_env)
            guard = None
            if not r["headless"] and sys.platform == "darwin":
                guard = gd_run._FocusGuard(p.pid)
                guard.start()
            procs[r["name"]] = (p, fh, rf, lp, time.time(), rt, cmd, guard)
        for name, (p, fh, rf, lp, ts, rt, cmd, guard) in procs.items():
            timed_out = False
            try:
                p.wait(timeout=max(1.0, ts + rt - time.time()))
            except subprocess.TimeoutExpired:
                timed_out = True
                p.kill()   # only the process this session started
                p.wait()
            fh.close()
            if guard:
                guard.stop.set()
            log = lp.read_text(errors="replace")
            run = gd_run._summarise(log, p.returncode, timed_out, {"duration_s": round(time.time() - ts, 2),
                                    "log_path": str(lp), "result_path": str(rf), "cmd": shlex.join(cmd),
                                    "clone": str(clones[name])})
            if rf.exists():
                try:
                    run["result"] = json.loads(rf.read_text())
                except json.JSONDecodeError:
                    pass
            res = run["result"]
            problems = []
            if timed_out:
                problems.append(f"wall timeout after {rt} s (process killed)")
            if res is None:
                problems.append("no AGENT_RESULT line")
            elif not res.get("ok", False):
                problems.append(str(res.get("error") or "job reported ok=false"))
            if run["parse_errors"]:
                e = run["parse_errors"][0]
                problems.append(f"parse error {e['file']}:{e['line']}: {e['message']}")
            run["ok"] = not problems
            run["error"] = "; ".join(problems)
            runs[name] = run
    return {"ok": all(r["ok"] for r in runs.values()), "roles": runs, "duration_s": round(time.time() - t_start, 2),
            "clones": {k: str(v) for k, v in clones.items()}}


# ---------------------------------------------------------------- latency injection (no root needed)

class UdpLagProxy:
    """Delay, jitter and drop UDP datagrams between ENet clients and a server on localhost.

    Clients connect to listen_port; datagrams reach target_port after one_way_ms (+- jitter_ms), in
    each direction, so the round trip grows by 2 x one_way_ms. loss drops a fraction of datagrams
    (ENet resends reliable ones). reorder=False keeps per-direction order (jitter without reordering).
    Each client gets its own upstream socket, so the server sees one address per client.
    """

    def __init__(self, listen_port: int, target_port: int, one_way_ms: float | None = None, rtt_ms: float | None = None,
                 jitter_ms: float = 0.0, loss: float = 0.0, reorder: bool = False, host: str = "127.0.0.1", seed: int = 7):
        self.listen = (host, int(listen_port))
        self.target = (host, int(target_port))
        self.delay = (one_way_ms if one_way_ms is not None else (rtt_ms or 0.0) / 2.0) / 1000.0
        self.jitter = jitter_ms / 1000.0
        self.loss = float(loss)
        self.reorder = reorder
        self.rng = random.Random(seed)
        self.counts = {"up_packets": 0, "up_bytes": 0, "down_packets": 0, "down_bytes": 0, "dropped": 0, "clients": 0}
        self._stop = threading.Event()
        self._thread = None
        self._last_due = {"up": 0.0, "down": 0.0}
        self._ready = threading.Event()
        self.error = None

    def __enter__(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self._ready.wait(5)
        if self.error:
            raise RuntimeError(self.error)
        return self

    def __exit__(self, *exc):
        self._stop.set()
        if self._thread:
            self._thread.join(5)
        return False

    def stats(self) -> dict:
        return dict(self.counts, one_way_ms=self.delay * 1000, jitter_ms=self.jitter * 1000, loss=self.loss)

    def _due(self, direction: str) -> float | None:
        if self.loss > 0 and self.rng.random() < self.loss:
            self.counts["dropped"] += 1
            return None
        d = self.delay + (self.rng.uniform(-self.jitter, self.jitter) if self.jitter else 0.0)
        due = time.monotonic() + max(0.0, d)
        if not self.reorder:
            due = max(due, self._last_due[direction])
            self._last_due[direction] = due
        return due

    def _run(self):
        try:
            lsock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            lsock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            lsock.bind(self.listen)
            lsock.setblocking(False)
        except OSError as e:
            self.error = f"UdpLagProxy bind {self.listen}: {e}"
            self._ready.set()
            return
        self._ready.set()
        ups: dict[tuple, socket.socket] = {}
        back: dict[int, tuple] = {}
        heap: list = []
        seq = 0
        try:
            while not self._stop.is_set():
                now = time.monotonic()
                wait = 0.02 if not heap else max(0.0, min(0.02, heap[0][0] - now))
                socks = [lsock] + list(ups.values())
                r, _, _ = select.select(socks, [], [], wait)
                for s in r:
                    try:
                        data, addr = s.recvfrom(65535)
                    except (BlockingIOError, ConnectionResetError):
                        continue
                    if s is lsock:
                        up = ups.get(addr)
                        if up is None:
                            up = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                            up.bind((self.listen[0], 0))
                            up.setblocking(False)
                            ups[addr] = up
                            back[up.fileno()] = addr
                            self.counts["clients"] += 1
                        self.counts["up_packets"] += 1
                        self.counts["up_bytes"] += len(data)
                        due = self._due("up")
                        if due is not None:
                            seq += 1
                            heapq.heappush(heap, (due, seq, up, data, self.target))
                    else:
                        caddr = back.get(s.fileno())
                        if caddr is None:
                            continue
                        self.counts["down_packets"] += 1
                        self.counts["down_bytes"] += len(data)
                        due = self._due("down")
                        if due is not None:
                            seq += 1
                            heapq.heappush(heap, (due, seq, lsock, data, caddr))
                now = time.monotonic()
                while heap and heap[0][0] <= now:
                    _, _, sock, data, addr = heapq.heappop(heap)
                    try:
                        sock.sendto(data, addr)
                    except OSError:
                        pass
        finally:
            for s in list(ups.values()) + [lsock]:
                s.close()


class TcpLagProxy:
    """Delay a TCP stream (WebSocket) between clients and a server on localhost: every chunk is
    forwarded one_way_ms after it arrived, per direction, order kept. No loss (TCP would hide it as
    retransmission delay anyway)."""

    def __init__(self, listen_port: int, target_port: int, one_way_ms: float | None = None, rtt_ms: float | None = None,
                 host: str = "127.0.0.1"):
        self.listen = (host, int(listen_port))
        self.target = (host, int(target_port))
        self.delay = (one_way_ms if one_way_ms is not None else (rtt_ms or 0.0) / 2.0) / 1000.0
        self.counts = {"connections": 0, "up_bytes": 0, "down_bytes": 0}
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []
        self._socks: list[socket.socket] = []
        self._srv = None

    def __enter__(self):
        self._srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._srv.bind(self.listen)
        self._srv.listen(16)
        self._srv.settimeout(0.2)
        t = threading.Thread(target=self._accept, daemon=True)
        t.start()
        self._threads.append(t)
        return self

    def __exit__(self, *exc):
        self._stop.set()
        for s in self._socks + [self._srv]:
            try:
                s.close()
            except OSError:
                pass
        return False

    def stats(self) -> dict:
        return dict(self.counts, one_way_ms=self.delay * 1000)

    def _accept(self):
        while not self._stop.is_set():
            try:
                c, _ = self._srv.accept()
            except (socket.timeout, OSError):
                continue
            try:
                u = socket.create_connection(self.target, timeout=5)
            except OSError:
                c.close()
                continue
            for s in (c, u):
                s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
                s.settimeout(0.2)
            self._socks += [c, u]
            self.counts["connections"] += 1
            for src, dst, key in ((c, u, "up_bytes"), (u, c, "down_bytes")):
                t = threading.Thread(target=self._pump, args=(src, dst, key), daemon=True)
                t.start()
                self._threads.append(t)

    def _pump(self, src: socket.socket, dst: socket.socket, key: str):
        q: list = []
        cv = threading.Condition()
        done = threading.Event()

        def sender():
            while not (done.is_set() and not q) and not self._stop.is_set():
                with cv:
                    while not q and not done.is_set() and not self._stop.is_set():
                        cv.wait(0.05)
                    if not q:
                        continue
                    due, data = q[0]
                wait = due - time.monotonic()
                if wait > 0:
                    time.sleep(wait)
                with cv:
                    q.pop(0)
                try:
                    dst.sendall(data)
                except OSError:
                    return
            try:
                dst.shutdown(socket.SHUT_WR)
            except OSError:
                pass

        st = threading.Thread(target=sender, daemon=True)
        st.start()
        while not self._stop.is_set():
            try:
                data = src.recv(65536)
            except socket.timeout:
                continue
            except OSError:
                break
            if not data:
                break
            self.counts[key] += len(data)
            with cv:
                q.append((time.monotonic() + self.delay, data))
                cv.notify()
        done.set()
        st.join(5)


# ---------------------------------------------------------------- analysis

def _series(traj, pid: int):
    rows = sorted((r[0], r[2], r[3]) for r in traj if int(r[1]) == int(pid))
    return [r[0] for r in rows], rows


def _interp(ts, rows, t):
    i = bisect.bisect_left(ts, t)
    if i <= 0 or i >= len(ts):
        return None
    t0, x0, z0 = rows[i - 1]
    t1, x1, z1 = rows[i]
    if t1 - t0 > 0.25:      # gap: do not interpolate across it
        return None
    a = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
    return x0 + (x1 - x0) * a, z0 + (z1 - z0) * a


def replication_delay(server_traj, client_traj, pid: int, max_shift_ms: int = 800, step_ms: int = 5,
                      min_speed: float = 0.5) -> dict:
    """How far behind the server a client displays player `pid`, from wall-clock trajectories.

    Rows are [wall_t, peer_id, x, z] (NetLab traj). Only moments where the server copy moves faster
    than min_speed (m/s) count. Returns delay_ms (shift minimising the error), err_at_delay_m,
    err_now_mean_m and err_now_p95_m (distance between what the client shows and the server truth at
    the same instant), samples.
    """
    sts, srows = _series(server_traj, pid)
    cts, crows = _series(client_traj, pid)
    if len(sts) < 4 or len(cts) < 4:
        return {"ok": False, "error": f"not enough samples (server {len(sts)}, client {len(cts)})", "pid": pid}
    moving = []
    for t, x, z in crows:
        a = _interp(sts, srows, t - 0.02)
        b = _interp(sts, srows, t + 0.02)
        if a and b and math.dist(a, b) / 0.04 >= min_speed:
            moving.append((t, x, z))
    if len(moving) < 4:
        return {"ok": False, "error": "player never moved on the server", "pid": pid}

    def errs(shift_s):
        out = []
        for t, x, z in moving:
            s = _interp(sts, srows, t - shift_s)
            if s is not None:
                out.append(math.dist((x, z), s))
        return out

    best = None
    for d in range(0, max_shift_ms + 1, step_ms):
        e = errs(d / 1000.0)
        if len(e) < max(4, len(moving) // 3):
            continue
        m = sum(e) / len(e)
        if best is None or m < best[1]:
            best = (d, m)
    now = sorted(errs(0.0))
    if best is None or not now:
        return {"ok": False, "error": "no overlap between server and client samples", "pid": pid}
    return {"ok": True, "pid": pid, "delay_ms": best[0], "err_at_delay_m": round(best[1], 4),
            "err_now_mean_m": round(sum(now) / len(now), 4), "err_now_p95_m": round(now[int(0.95 * (len(now) - 1))], 4),
            "samples": len(moving)}


def kib_per_s(bandwidth: list[dict], key: str = "sent", skip: int = 1) -> float:
    """Mean KiB/s from NetLab's per-second ENet counters, skipping the first `skip` windows (connect)."""
    rows = [b for b in bandwidth[skip:] if b.get("window_s")]
    if not rows:
        return 0.0
    return round(sum(b[key] for b in rows) / sum(b["window_s"] for b in rows) / 1024.0, 3)


# ---------------------------------------------------------------- static RPC audit

_RPC_RE = re.compile(r"^[ \t]*@rpc(?:\((?P<args>[^)]*)\))?\s*(?:static\s+)?func\s+(?P<name>\w+)\s*\((?P<params>[^)]*)\)",
                     re.M)
_G3_NET = [
    (re.compile(r"^\s*(remote|remotesync|puppet|puppetsync|master|mastersync)\s+func\b", re.M), "Godot 3 RPC keyword",
     '@rpc("any_peer") / @rpc("authority") / add "call_local"'),
    (re.compile(r"\brset(_id|_unreliable)?\s*\("), "rset was removed", "MultiplayerSynchronizer or an RPC"),
    (re.compile(r"\brpc_unreliable(_id)?\s*\("), "rpc_unreliable was removed", '@rpc(..., "unreliable") then .rpc()'),
    (re.compile(r"\bNetworkedMultiplayerENet\b"), "Godot 3 class", "ENetMultiplayerPeer"),
    (re.compile(r"\bWebSocket(Server|Client)\b"), "Godot 3 class", "WebSocketMultiplayerPeer / WebSocketPeer"),
    (re.compile(r"\bget_network_unique_id\s*\("), "Godot 3 method", "multiplayer.get_unique_id()"),
    (re.compile(r"\bget_rpc_sender_id\s*\("), "Godot 3 method", "multiplayer.get_remote_sender_id()"),
    (re.compile(r"\bnetwork_peer\b"), "Godot 3 property", "multiplayer.multiplayer_peer"),
    (re.compile(r"\bis_network_master\s*\("), "Godot 3 method", "is_multiplayer_authority()"),
    (re.compile(r"\bset_network_master\s*\("), "Godot 3 method", "set_multiplayer_authority(id)"),
    (re.compile(r"\bget_rpc_config\s*\("), "renamed in 4.5", "get_node_rpc_config()"),
    (re.compile(r"\bauth_timout\b"), "doc typo, no such property", "auth_timeout"),
    (re.compile(r"--no-window"), "Godot 3 flag", "--headless"),
]


def _func_body(text: str, start: int) -> str:
    lines = text[start:].splitlines()
    body = [lines[0]]
    for ln in lines[1:]:
        if ln.strip() == "":
            body.append(ln)
            continue
        if not ln.startswith(("\t", " ")):
            break
        body.append(ln)
    return "\n".join(body)


def _parse_rpc_args(raw: str | None) -> dict:
    vals = [a.strip().strip('"\'') for a in (raw or "").split(",") if a.strip()]
    d = {"mode": "authority", "sync": "call_remote", "transfer": "reliable", "channel": 0, "raw": vals}
    for i, v in enumerate(vals):
        if v in ("authority", "any_peer"):
            d["mode"] = v
        elif v in ("call_local", "call_remote"):
            d["sync"] = v
        elif v in ("reliable", "unreliable", "unreliable_ordered"):
            d["transfer"] = v
        elif v.isdigit():
            d["channel"] = int(v)
            if i != len(vals) - 1:
                d["channel_not_last"] = True
    return d


def rpc_script(path) -> dict:
    """RPC declarations of one .gd file: {name: {mode, sync, transfer, channel, params}} plus flags."""
    text = Path(path).read_text(errors="replace")
    rpcs, flags = {}, []
    for m in _RPC_RE.finditer(text):
        a = _parse_rpc_args(m.group("args"))
        params = [p.strip() for p in m.group("params").split(",") if p.strip()]
        a["params"] = len(params)
        body = _func_body(text, m.start("name"))
        a["line"] = text.count("\n", 0, m.start("name")) + 1
        rpcs[m.group("name")] = a
        if a.get("channel_not_last"):
            flags.append({"line": a["line"], "rpc": m.group("name"), "flag": "transfer_channel must be the last @rpc argument"})
        if a["mode"] == "any_peer" and "get_remote_sender_id" not in body:
            flags.append({"line": a["line"], "rpc": m.group("name"),
                          "flag": "any_peer RPC never reads multiplayer.get_remote_sender_id(): validate the sender"})
        if "get_remote_sender_id" in body and "await" in body:
            if body.index("await") < body.index("get_remote_sender_id"):
                flags.append({"line": a["line"], "rpc": m.group("name"),
                              "flag": "get_remote_sender_id() after an await returns 0: read it first"})
    for rx, what, fix in _G3_NET:
        for m in rx.finditer(text):
            flags.append({"line": text.count("\n", 0, m.start()) + 1, "flag": what, "found": m.group(0).strip(), "fix": fix})
    return {"file": str(path), "rpcs": rpcs, "flags": flags}


def rpc_audit(root, skip=("addons/",)) -> dict:
    """Scan every .gd under root: RPC table per script and flags (unvalidated any_peer RPCs, sender id
    after await, channel position, Godot 3 networking names)."""
    root = Path(root)
    files = []
    for f in sorted(root.rglob("*.gd")):
        rel = f.relative_to(root).as_posix()
        if any(rel.startswith(s) for s in skip) or "/.godot/" in f"/{rel}" or rel.startswith("."):
            continue
        r = rpc_script(f)
        r["file"] = rel
        files.append(r)
    flags = [dict(f, file=r["file"]) for r in files for f in r["flags"]]
    return {"files": len(files), "rpc_count": sum(len(r["rpcs"]) for r in files), "scripts": files, "flags": flags,
            "ok": not flags}


def rpc_pair_check(script_a, script_b) -> dict:
    """Two scripts that will sit at the same node path on two peers (server and client variants).
    Measured in 4.7.2: the engine checksum covers the RPC NAMES only. A name present on one side logs
    "The rpc node checksum failed" and RPCs are matched by sorted index, so a call can run the WRONG
    method. A different mode, call_local, transfer mode or argument count passes the checksum and
    fails per call (rejected, or "Method expected N argument(s)") or silently behaves differently.
    ok is stricter than the engine: any difference fails; engine_checksum_fails tells which ones log."""
    a, b = rpc_script(script_a)["rpcs"], rpc_script(script_b)["rpcs"]
    only_a = sorted(set(a) - set(b))
    only_b = sorted(set(b) - set(a))
    decl = sorted(n for n in set(a) & set(b) if (a[n]["mode"], a[n]["sync"], a[n]["transfer"], a[n]["channel"])
                  != (b[n]["mode"], b[n]["sync"], b[n]["transfer"], b[n]["channel"]))
    params = sorted(n for n in set(a) & set(b) if a[n]["params"] != b[n]["params"])
    return {"ok": not (only_a or only_b or decl or params), "engine_checksum_fails": bool(only_a or only_b),
            "only_in_a": only_a, "only_in_b": only_b, "declaration_differs": decl, "param_count_differs": params}


# ---------------------------------------------------------------- dedicated server export

def server_preset(project, name: str, platform: str, mode: str = "strip", keep=(), remove=(), options: dict | None = None,
                  export_path: str = "", custom_features: str = "") -> dict:
    """Write an "Export as dedicated server" preset (net_build.gd:server_preset)."""
    return gd_run.run_script(project, f"{NETKIT_RES}/net_build.gd:server_preset",
                             {"name": name, "platform": platform, "mode": mode, "keep": list(keep), "remove": list(remove),
                              "options": options or {}, "export_path": export_path, "custom_features": custom_features},
                             timeout=120)


def pack_report(zip_path, top: int = 12) -> dict:
    """List an --export-pack .zip: total bytes, bytes and count per extension, largest files."""
    z = zipfile.ZipFile(zip_path)
    by_ext: dict[str, list] = {}
    infos = z.infolist()
    for i in infos:
        ext = Path(i.filename).suffix.lower() or "(none)"
        e = by_ext.setdefault(ext, [0, 0])
        e[0] += 1
        e[1] += i.file_size
    largest = sorted(infos, key=lambda i: i.file_size, reverse=True)[:top]
    return {"file": str(zip_path), "files": len(infos), "bytes": sum(i.file_size for i in infos),
            "by_ext": {k: {"count": v[0], "bytes": v[1]} for k, v in sorted(by_ext.items(), key=lambda kv: -kv[1][1])},
            "largest": [{"path": i.filename, "bytes": i.file_size} for i in largest],
            "names": [i.filename for i in infos]}


def run_binary(binary, user_args=(), engine_args=(), timeout: float = 60, windowed_guard: bool = True,
               lock_key=None) -> dict:
    """Run an exported game binary (no --path) and read its AGENT_RESULT line. Holds a machine slot
    (and a windowed slot when windowed_guard, in case the build opens a window)."""
    binary = Path(binary)
    cmd = [str(binary), *engine_args, "--", *user_args]
    lock = lock_key or binary.parent
    with gd_run.godot_slot(lock, windowed=windowed_guard):
        t0 = time.time()
        p = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                             errors="replace")
        guard = None
        if windowed_guard and sys.platform == "darwin":
            guard = gd_run._FocusGuard(p.pid)
            guard.start()
        timed_out = False
        try:
            out, _ = p.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            p.kill()
            out, _ = p.communicate()
        if guard:
            guard.stop.set()
    r = gd_run._summarise(out or "", p.returncode, timed_out, {"duration_s": round(time.time() - t0, 2), "cmd": shlex.join(cmd),
                                                           "focus_restores": guard.restores if guard else 0})
    res = r["result"]
    r["ok"] = (not timed_out) and res is not None and bool(res.get("ok")) and not r["parse_errors"]
    r["error"] = "" if r["ok"] else ("timeout; " if timed_out else "") + (str(res.get("error")) if res else "no AGENT_RESULT")
    r["log"] = (out or "")[-50000:]
    return r


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="gd_net: static RPC audit of a Godot project")
    ap.add_argument("root")
    ns = ap.parse_args()
    print(json.dumps(rpc_audit(ns.root), indent=2))
