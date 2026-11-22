#!/usr/bin/env python3
"""Run a Luau chunk in Studio with a result protocol: you get a dict, not loose text.

The chunk runs inside a function: `return` a value (table, Instance, Vector3, CFrame...)
and it comes back JSON-safe. `print` and `warn` inside the chunk are captured too.

    from rbx_mcp import Studio
    from rbx_run import run
    with Studio(place="arena") as s:
        r = run(s, "return {parts = #workspace:GetDescendants()}")
        r["ok"], r["result"], r["error"], r["output"]

AgentKit modules (scripts/agentkit/*.luau) can be inlined as locals, nothing is written into the place:
        run(s, "return Audit.all(game)", kit=["Audit"])
        run(s, "return Stats.snapshot()", dm="Server", kit=["Stats"])

Data models: "Edit" (the place as saved), "Server" and "Client" (only during a playtest,
see rbx_play.py). Errors carry a traceback with line numbers of YOUR chunk.

No Studio window: run_headless(place, code, kit) uses Studio's CLI (`--task RunScript`) on a local
place file and returns the same dict. It refuses while any Studio process runs (the launch would take
over that window). Edit data model only; no playtest, no input, no capture.

CLI:
  rbx_run.py [--studio NAME] [--dm Edit|Server|Client] [--kit Audit,Stats,Spec] (--file F | --code C)
Exit code 1 when the chunk raised.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rbx_mcp import MCPError, Studio  # noqa: E402

__version__ = "0.1.0"

BEGIN, END = "<<RBXRUN>>", "<<RBXEND>>"
KIT_DIR = Path(__file__).resolve().parent / "agentkit"

# One line, so the user chunk starts on line 2 and error line numbers shift by exactly 1.
PRELUDE = (
    'local __H = game:GetService("HttpService") local __out = {} local __p, __w = print, warn '
    'local function __cap(tag, ...) local t = table.pack(...) for i = 1, t.n do t[i] = tostring(t[i]) end '
    'table.insert(__out, tag .. table.concat(t, " ")) end '
    'local function __ser(v, seen, depth) local ty = typeof(v) '
    'if ty == "nil" or ty == "boolean" or ty == "string" then return v end '
    'if ty == "number" then if v ~= v or v == math.huge or v == -math.huge then return tostring(v) end return v end '
    'if ty == "Instance" then return {__type = "Instance", class = v.ClassName, path = v:GetFullName()} end '
    'if ty == "Vector3" then return {__type = ty, x = v.X, y = v.Y, z = v.Z} end '
    'if ty == "Vector2" then return {__type = ty, x = v.X, y = v.Y} end '
    'if ty == "CFrame" then return {__type = ty, components = {v:GetComponents()}} end '
    'if ty == "Color3" then return {__type = ty, hex = v:ToHex()} end '
    'if ty == "UDim2" then return {__type = ty, xs = v.X.Scale, xo = v.X.Offset, ys = v.Y.Scale, yo = v.Y.Offset} end '
    'if ty == "EnumItem" then return tostring(v) end '
    'if ty == "buffer" then return {__type = ty, len = buffer.len(v)} end '
    'if ty == "table" then if seen[v] or depth > 12 then return "<cycle or too deep>" end seen[v] = true '
    'local n, out, arr = 0, {}, true for k in pairs(v) do n += 1 if type(k) ~= "number" then arr = false end end '
    'if arr and n == #v then for i = 1, n do out[i] = __ser(v[i], seen, depth + 1) end '
    'else for k, x in pairs(v) do out[tostring(k)] = __ser(x, seen, depth + 1) end end seen[v] = nil return out end '
    'return tostring(v) end '
    'local __ok, __res = xpcall(function() local print = function(...) __cap("", ...) __p(...) end '
    'local warn = function(...) __cap("WARN ", ...) __w(...) end'
)
EPILOGUE = (
    '\nend, debug.traceback) '
    'local __r = {ok = __ok, output = __out} '
    'if __ok then __r.result = __ser(__res, {}, 0) else __r.error = tostring(__res) end '
    'local __s, __j = pcall(__H.JSONEncode, __H, __r) '
    'if not __s then __j = __H:JSONEncode({ok = false, error = "result not JSON-encodable: " .. tostring(__j), output = __out}) end '
    f'return "{BEGIN}" .. __j .. "{END}"'
)


def kit_source(names: list[str] | tuple[str, ...] = ()) -> str:
    """Luau that defines each AgentKit module as a local of the same name."""
    parts = []
    for n in names:
        src = (KIT_DIR / f"{n}.luau").read_text()
        parts.append(f"local {n} = (function()\n{src}\nend)()")
    return "\n".join(parts)


def wrap(code: str, kit: list[str] | tuple[str, ...] = ()) -> tuple[str, int]:
    """The chunk as sent to execute_luau, and the number of lines before the user's code."""
    head = PRELUDE + "\n" + (kit_source(kit) + "\n" if kit else "")
    return head + code + EPILOGUE, head.count("\n")


def _fix_lines(msg: str, offset: int = 1) -> str:
    # Shift `:<line>:` references back to the user's chunk (prelude and kit come first).
    return re.sub(r":(\d+)(?=[:\s]|$)", lambda m: f":{max(1, int(m[1]) - offset)}", msg)


def parse(text: str, offset: int = 1) -> dict:
    """Extract the protocol payload from execute_luau's text output."""
    i, j = text.rfind(BEGIN), text.rfind(END)
    if i < 0 or j < i:
        return {"ok": False, "error": f"no result payload in tool output: {text[:2000]}", "output": [],
                "result": None}
    raw = text[i + len(BEGIN):j]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # The tool may return the string JSON-quoted (escaped): unescape once, then parse.
        data = json.loads(json.loads('"' + raw + '"'))
    if not data.get("output"):
        data["output"] = []  # an empty Luau table encodes as {}
    data.setdefault("result", None)
    data.setdefault("error", None)
    if data.get("error"):
        data["error"] = _fix_lines(data["error"], offset)
    return data


def run(studio: Studio, code: str, dm: str = "Edit", timeout: float | None = None,
        kit: list[str] | tuple[str, ...] = ()) -> dict:
    """Execute `code` in data model `dm`. Returns {ok, result, error, output}. Never raises on Luau errors."""
    chunk, offset = wrap(code, kit)
    try:
        text = studio.luau(chunk, dm=dm, timeout=timeout)
    except MCPError as e:
        # Compile errors and tool-level failures (wrong data model, no playtest) land here.
        return {"ok": False, "result": None, "error": _fix_lines(str(e), offset), "output": []}
    return parse(text, offset)


STUDIO_BIN = Path(os.environ.get("RBX_STUDIO_APP", "/Applications/RobloxStudio.app")) / "Contents" / "MacOS" / "RobloxStudio"


def studio_running() -> bool:
    return subprocess.run(["pgrep", "-x", "RobloxStudio"], capture_output=True).returncode == 0


def parse_headless(text: str, source: str, offset: int = 1) -> dict:
    """Parse a RunScript output file: it echoes the script after '> ', then the prints."""
    body = text[len("> " + source):] if text.startswith("> " + source) else text
    if BEGIN in body and END in body:
        return parse(body, offset)
    err = [ln for ln in body.splitlines() if ln.strip() and not ln.startswith(("Stack ", "Script '"))]
    return {"ok": False, "result": None, "output": [],
            "error": _fix_lines("\n".join(err[-6:]) or "no output (did Studio start?)", offset)}


def run_headless(place: str | Path, code: str, kit: list[str] | tuple[str, ...] = (), timeout: float = 180) -> dict:
    """Run a chunk in the Edit data model of a local place with no Studio window (Studio CLI RunScript).

    Same dict as run() plus seconds, exit_code, log_path. Refuses while any RobloxStudio process runs:
    on macOS the launch hands off to the running Studio, opens the place there and closes that window
    at quit. For CI or a Mac with no interactive Studio. Hold an rbx_env.place_slot() around it.
    Exit code is 0 even when the script errors: the result comes from the payload only."""
    if studio_running():
        return {"ok": False, "result": None, "output": [], "exit_code": None, "seconds": 0, "log_path": None,
                "error": "refused: a RobloxStudio process is running (RunScript would take over its window)"}
    chunk, offset = wrap(code, kit)
    source = "print((function() " + chunk + "\nend)())"  # same line 1 as run(): line numbers unchanged
    work = Path(tempfile.mkdtemp(prefix="rbx_headless_"))
    script, log = work / "chunk.luau", work / "out.log"
    script.write_text(source)
    t0 = time.time()
    try:
        p = subprocess.run([str(STUDIO_BIN), "--task", "RunScript", "--localPlaceFile", str(Path(place).resolve()),
                            "--runScriptFile", str(script), "--outputFile", str(log), "--quitAfterExecution"],
                           capture_output=True, text=True, timeout=timeout)
        rc = p.returncode
    except subprocess.TimeoutExpired:
        rc = None
    text = log.read_text(errors="replace") if log.exists() else ""
    r = parse_headless(text, source, offset)
    r.update(exit_code=rc, seconds=round(time.time() - t0, 2), log_path=str(log))
    if rc is None:
        r.update(ok=False, error=f"RunScript did not quit within {timeout:.0f}s")
    return r


def main(argv: list[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--studio")
    ap.add_argument("--dm", default="Edit", choices=["Edit", "Server", "Client"])
    ap.add_argument("--file")
    ap.add_argument("--code")
    ap.add_argument("--kit", default="", help="comma-separated AgentKit modules, e.g. Audit,Stats")
    ap.add_argument("--timeout", type=float, default=120.0)
    a = ap.parse_args(argv)
    code = Path(a.file).read_text() if a.file else a.code
    if not code:
        ap.error("give --file or --code")
    kit = [k for k in a.kit.split(",") if k]
    with Studio(studio=a.studio, timeout=a.timeout) as s:
        r = run(s, code, a.dm, kit=kit)
    print(json.dumps(r, indent=1))
    return 0 if r["ok"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
