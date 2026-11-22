#!/usr/bin/env python3
"""ZBrush agent bridge (client side). Sends Python code to a running ZBrush that loaded
zb_plugins/zb_bridge_server.py, prints the JSON reply.

Usage: python3 zb_bridge.py [--main] [--port 7788] "code"   or   ... -f script.py
In the code, `zbc` is zbrush.commands; assign `result = ...` to return a value.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import json
import socket
import sys


def send(code, mode="thread", port=7788, timeout=600):
    with socket.create_connection(("127.0.0.1", port), timeout=timeout + 5) as s:
        s.sendall((json.dumps({"code": code, "mode": mode, "timeout": timeout}) + "\n").encode())
        data = b""
        while not data.endswith(b"\n"):
            chunk = s.recv(1 << 16)
            if not chunk:
                break
            data += chunk
    return json.loads(data.decode())


if __name__ == "__main__":
    args = sys.argv[1:]
    mode = "main" if "--main" in args else "thread"
    args = [a for a in args if a != "--main"]
    port = 7788
    if "--port" in args:
        i = args.index("--port"); port = int(args[i + 1]); args = args[:i] + args[i + 2:]
    if args[0] == "-f":
        with open(args[1]) as fh:
            code = fh.read()
    else:
        code = args[0]
    print(json.dumps(send(code, mode, port), indent=1))
