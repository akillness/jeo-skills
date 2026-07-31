#!/usr/bin/env python3
"""Offline self-test for the Animato agent loop.

Starts a stub Animato server (/api/upload, /api/prompt, /api/run, /api/chat, /api/files)
plus a stub OpenAI-compatible LLM endpoint, then drives `animato_agent.py animate` against
them. Verifies the wiring — upload, prompt, one inference, static gate, execute — without a
Blender install, an API key, or network access.

Usage: python3 selftest.py    (exit 0 = all cases passed)
"""
from __future__ import annotations

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

HERE = Path(__file__).resolve().parent
AGENT = HERE / "animato_agent.py"
GOOD_SCRIPT = (HERE.parent / "references" / "example-bpy-script.py").read_text(encoding="utf-8")
BAD_SCRIPT = (
    "import bpy\n"
    'bpy.ops.import_scene.fbx(filepath="public/upload/X-Bot.fbx")\n'
    'bpy.ops.export_scene.fbx(filepath="public/upload/X-Bot.fbx")\n'
)

STATE = {"reply": GOOD_SCRIPT, "ran": []}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):  # keep the test output clean
        pass

    def _send(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> bytes:
        return self.rfile.read(int(self.headers.get("Content-Length", 0)))

    def do_GET(self):
        if self.path == "/api/files":
            self._send([{"filename": "X-Bot.fbx", "url": "/public/upload/X-Bot.fbx"}])
        else:
            self._send({"detail": "not found"}, 404)

    def do_POST(self):
        raw = self._body()
        if self.path == "/api/upload":
            assert b"X-Bot.fbx" in raw, "multipart body lost the filename"
            self._send({"filename": "X-Bot.fbx", "size": len(raw), "url": "/public/upload/X-Bot.fbx"})
        elif self.path == "/api/prompt":
            payload = json.loads(raw)
            self._send({"prompt": f"MODEL public/upload/{payload['filename']}\nTASK {payload['message']}",
                        "output_url": f"/public/upload/{payload['filename']}"})
        elif self.path == "/api/run":
            STATE["ran"].append(raw.decode())
            self._send({"ok": True, "returncode": 0, "stdout": "exported", "stderr": "",
                        "output_url": "/public/upload/X-Bot.fbx"})
        elif self.path == "/api/chat":
            payload = json.loads(raw)
            assert payload.get("api_key"), "/api/chat called without a key"
            STATE["ran"].append(STATE["reply"])
            self._send({"code": STATE["reply"], "ok": True, "returncode": 0, "stdout": "", "stderr": "",
                        "output_url": "/public/upload/X-Bot.fbx"})
        elif self.path.endswith("/chat/completions"):
            assert self.headers.get("Authorization", "").startswith("Bearer "), "LLM called without a bearer key"
            self._send({"choices": [{"message": {"content": f"```python\n{STATE['reply']}```"}}]})
        else:
            self._send({"detail": "not found"}, 404)


def run_agent(base: str, workdir: Path, *args: str) -> subprocess.CompletedProcess:
    cmd = [sys.executable, str(AGENT), "--server", base, "--provider", "openai",
           "--endpoint", base, "--model", "stub-model", "--api-key", "test-key", *args]
    return subprocess.run(cmd, capture_output=True, text=True, cwd=workdir)


def main() -> int:
    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    failures: list[str] = []

    with TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        model = workdir / "X-Bot.fbx"
        model.write_bytes(b"stub-fbx-bytes")

        # 1. happy path: upload -> prompt -> inference -> gate -> run
        STATE["reply"] = GOOD_SCRIPT
        STATE["ran"].clear()
        proc = run_agent(base, workdir, "animate", "--file", str(model), "--message", "wave hello")
        if proc.returncode != 0:
            failures.append(f"local mode should succeed: {proc.stdout}{proc.stderr}")
        if len(STATE["ran"]) != 1:
            failures.append(f"expected exactly one /api/run execution, got {len(STATE['ran'])}")
        if not (workdir / "animato-out" / "X-Bot.generated.py").is_file():
            failures.append("generated script was not persisted for audit")
        if not (workdir / "animato-out" / "X-Bot.prompt.txt").is_file():
            failures.append("prompt was not persisted for audit")

        # 2. a script that fails the gate must never reach /api/run
        STATE["reply"] = BAD_SCRIPT
        STATE["ran"].clear()
        proc = run_agent(base, workdir, "animate", "--filename", "X-Bot.fbx", "--message", "wave hello")
        if proc.returncode == 0:
            failures.append("gate failure should exit non-zero")
        if STATE["ran"]:
            failures.append("ungated script reached /api/run")
        if "static gate FAILED" not in proc.stdout:
            failures.append(f"missing gate failure report: {proc.stdout}")

        # 3. --dry-run stops before execution even when the gate passes
        STATE["reply"] = GOOD_SCRIPT
        STATE["ran"].clear()
        proc = run_agent(base, workdir, "animate", "--filename", "X-Bot.fbx", "--message", "wave", "--dry-run")
        if proc.returncode != 0 or STATE["ran"]:
            failures.append(f"--dry-run must pass without executing: rc={proc.returncode} ran={len(STATE['ran'])}")

        # 4. server mode delegates to /api/chat and still reports a post-hoc gate
        STATE["ran"].clear()
        proc = run_agent(base, workdir, "animate", "--filename", "X-Bot.fbx", "--message", "wave", "--mode", "server")
        if proc.returncode != 0 or "post_hoc_gate" not in proc.stdout:
            failures.append(f"server mode failed: {proc.stdout}{proc.stderr}")

        # 5. missing key is a hard stop, not a silent unauthenticated call
        cmd = [sys.executable, str(AGENT), "--server", base, "animate", "--filename", "X-Bot.fbx", "--message", "x"]
        env = {k: v for k, v in __import__("os").environ.items() if k not in
               ("ANIMATO_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY")}
        proc = subprocess.run(cmd, capture_output=True, text=True, cwd=workdir, env=env)
        if proc.returncode == 0 or "no API key" not in proc.stderr:
            failures.append(f"missing key must fail loudly: rc={proc.returncode} {proc.stderr}")

        # 6. doctor reports a reachable server
        proc = run_agent(base, workdir, "doctor")
        if "Animato server reachable" not in proc.stdout:
            failures.append(f"doctor did not detect the server: {proc.stdout}")

    server.shutdown()
    for item in failures:
        print(f"[fail] {item}")
    print("selftest: 6 cases, " + ("all passed" if not failures else f"{len(failures)} failure(s)"))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
