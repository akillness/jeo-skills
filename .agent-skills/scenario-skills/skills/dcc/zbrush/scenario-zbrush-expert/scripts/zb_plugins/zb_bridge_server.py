"""ZBrush agent bridge (server side). Loaded by ZBrush at startup when this folder is on
ZBRUSH_PLUGIN_PATH. Listens on 127.0.0.1:$ZB_BRIDGE_PORT (default 7788) for one JSON
line {"code": "...", "mode": "thread"|"main"} and answers one JSON line
{"ok": bool, "out": str, "result": repr, "error": str}.

mode "thread": code runs on the bridge thread (to be proven safe for zbrush.commands).
mode "main": code is queued; it runs when the "ZScript:Agent Bridge:Serve" loop, running
on ZBrush's main thread, picks it up (the loop keeps the UI alive with commands.update()).
Experimental, 2026-09-24.
"""
import json
import os
import queue
import socket
import threading
import time
import traceback

from zbrush import commands as zbc

PORT = int(os.environ.get("ZB_BRIDGE_PORT", "7788"))
READ_TIMEOUT = 30.0  # seconds to receive one request line
LOG = os.path.expanduser("~/Library/Logs/zb_bridge.log")
MAIN_Q: "queue.Queue" = queue.Queue()
PALETTE = "ZScript:Agent Bridge"


def log(msg):
    with open(LOG, "a") as f:
        f.write(f"{time.strftime('%H:%M:%S')} {msg}\n")


def run_code(code):
    """Each call gets a fresh namespace. Code built by zb_launch defines _zb_restore(), which
    puts sys.path, sys.modules, stdout and the working directory back as they were; its
    epilogue calls it, and this finally calls it again when the code raised (idempotent)."""
    out = []
    ns = {"zbc": zbc, "print": lambda *a, **k: out.append(" ".join(str(x) for x in a))}
    try:
        exec(compile(code, "<agent>", "exec"), ns)
        return {"ok": True, "out": "\n".join(out), "result": repr(ns.get("result"))}
    except Exception:
        return {"ok": False, "out": "\n".join(out), "error": traceback.format_exc()}
    finally:
        hook = ns.get("_zb_restore")
        if callable(hook):
            try:
                hook()
            except Exception:
                log("hygiene hook error " + traceback.format_exc())


def handle(conn):
    with conn:
        # One accept loop serves every caller, so a client that stalls mid-request
        # must not hold it: the read times out, the code itself runs untimed.
        conn.settimeout(READ_TIMEOUT)
        data = b""
        while not data.endswith(b"\n"):
            chunk = conn.recv(1 << 16)
            if not chunk:
                break
            data += chunk
        conn.settimeout(None)
        req = json.loads(data.decode() or "{}")
        if req.get("mode") == "main":
            box = queue.Queue(maxsize=1)
            MAIN_Q.put((req.get("code", ""), box))
            try:
                res = box.get(timeout=float(req.get("timeout", 600)))
            except queue.Empty:
                res = {"ok": False, "error": "timeout: is the main-thread Serve loop running?"}
        else:
            res = run_code(req.get("code", ""))
        conn.sendall((json.dumps(res) + "\n").encode())


def server():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(("127.0.0.1", PORT))
    s.listen(4)
    log(f"bridge listening on {PORT}")
    while True:
        conn, _ = s.accept()
        try:
            handle(conn)
        except Exception:
            log("handler error " + traceback.format_exc())


def serve_main(sender=None):
    """Main-thread loop: run queued code between UI updates until 'stop' is queued."""
    log("main-thread serve loop started")
    while True:
        try:
            code, box = MAIN_Q.get(timeout=0.05)
        except queue.Empty:
            zbc.update(redraw_ui=True)
            continue
        if code.strip() == "stop":
            box.put({"ok": True, "out": "loop stopped"})
            break
        box.put(run_code(code))
    log("main-thread serve loop stopped")


if __name__ == "__main__" or True:
    try:
        zbc.add_subpalette(PALETTE, 0)
        zbc.add_button(f"{PALETTE}:Serve", "Run queued agent code on the main thread", serve_main)
    except Exception:
        log("palette error " + traceback.format_exc())
    threading.Thread(target=server, daemon=True).start()
    log("plugin loaded")
    if os.environ.get("ZB_BRIDGE_AUTOSERVE") == "1":
        # The embedded VM keeps the GIL on the main thread between scripts, so the socket
        # thread only runs while main-thread Python is active: serve from here.
        serve_main()
