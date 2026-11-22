#!/usr/bin/env python3
"""gd_pipeline: batch asset import, gdUnit4, CI workflow and MCP helpers for Godot 4.7.2 (scenario-godot-pipeline-automation 0.1).

System python3, standard library only. Builds on the scenario-godot-expert toolkit (gd_env, gd_run, gd_review, gd_stat):
it never starts Godot itself, every Godot run goes through gd_run (GD_MAX slots, project lock, watchdog).

    install_kit(project, enable_plugin=True) -> dict        AgentKit pipeline scripts + addons/prop_pipeline
    import_props(project, drop, manifest="manifest.csv", texture_mode="extract", collision="box",
                 thumbs=False, budgets=None) -> dict          ingest -> --import -> texture pass -> --import -> audit
    install_gdunit4(project, version="6.2.1") -> Path
    run_gdunit4(project, paths=("res://test",), timeout=900) -> dict   JUnit parsed, report dir
    glb_info(path) -> dict                                    offline GLB header/JSON/triangle/bounds probe
    exclude_from_export(project, preset, patterns=DEV_ONLY) -> str  dev-only folders out of the pack
    write_workflow(project_root, project_subdir=".", godot="4.7.2", presets=("Linux",)) -> Path
    lint_workflow(path) -> dict                               actionlint through uvx (actionlint-py), offline after first fetch
    check_urls(urls) -> dict                                  HEAD each URL the workflow downloads
    mcp_stdio(cmd, calls, env=None, cwd=None, timeout=120, hold_project=None) -> dict
"""
from __future__ import annotations

__version__ = "0.1"

import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE / "agentkit" / "pipeline"
ADDON = HERE / "agentkit" / "prop_pipeline_addon"
CI_TEMPLATES = HERE / "ci"
EXPERT = Path(os.environ.get("GD_EXPERT_SCRIPTS", HERE.parent.parent / "scenario-godot-expert" / "scripts"))
for p in (str(EXPERT), str(HERE)):
    if p not in sys.path:
        sys.path.insert(0, p)
import gd_env  # noqa: E402
import gd_run  # noqa: E402
import gd_stat  # noqa: E402

ASSET_CACHE = Path(os.environ.get("GD_PIPELINE_CACHE", HERE.parent / "assets" / "cache"))
GDUNIT4_SHA256 = {
    # sha256 of https://github.com/godot-gdunit-labs/gdUnit4/archive/refs/tags/v6.2.1.zip, recorded 2026-10-02
    "6.2.1": "ffb48847c46f386bf0c7a716fd68c6dace7d67730775cf7f748adce8ef3ed794",
}
PLUGIN_CFG = "res://addons/prop_pipeline/plugin.cfg"


# ---------------------------------------------------------------- install

def _enable_plugin(project: Path, cfg_res: str) -> None:
    cur = gd_env.read_project(project).get("editor_plugins/enabled", "")
    have = re.findall(r'"([^"]+)"', cur)
    if cfg_res not in have:
        have.append(cfg_res)
        gd_env.set_project_setting(project, "editor_plugins/enabled",
                                   "PackedStringArray(" + ", ".join(f'"{h}"' for h in have) + ")")


def install_kit(project, enable_plugin: bool = True) -> dict:
    """Copy agentkit/pipeline/*.gd to res://addons/agentkit/pipeline/ and the prop_pipeline addon to
    res://addons/prop_pipeline/, then enable the plugin in project.godot (needed for headless --import)."""
    project = Path(project)
    if not (project / "addons" / "agentkit" / "agent_job.gd").exists():
        gd_env.install_agentkit(project)
    dst = project / "addons" / "agentkit" / "pipeline"
    dst.mkdir(parents=True, exist_ok=True)
    for f in sorted(KIT.glob("*.gd")):
        shutil.copy2(f, dst / f.name)
    adst = project / "addons" / "prop_pipeline"
    adst.mkdir(parents=True, exist_ok=True)
    for f in sorted(ADDON.iterdir()):
        if f.is_file():
            shutil.copy2(f, adst / f.name)
    if enable_plugin:
        _enable_plugin(project, PLUGIN_CFG)
    return {"kit": str(dst), "addon": str(adst), "plugin_enabled": enable_plugin}


def _download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as fh:
        shutil.copyfileobj(r, fh, length=1 << 20)
    tmp.replace(dest)
    return dest


def install_gdunit4(project, version: str = "6.2.1", enable_plugin: bool = False, do_import: bool = True) -> Path:
    """gdUnit4 (godot-gdunit-labs/gdUnit4, MIT) from the GitHub tag zip, cached, sha256 recorded.

    v6.2.x lists Godot 4.7 and 4.7.1 (README compatibility table, 2026-10-02); 4.7.2 ran here.
    The command-line runner does not need the editor plugin enabled; do_import builds the class cache
    it relies on (GdUnitTestSuite, class_name)."""
    project = Path(project)
    cache = ASSET_CACHE / "gdunit4"
    z = cache / f"gdUnit4-{version}.zip"
    if not z.exists():
        _download(f"https://github.com/godot-gdunit-labs/gdUnit4/archive/refs/tags/v{version}.zip", z)
    digest = hashlib.sha256(z.read_bytes()).hexdigest()
    (cache / f"gdUnit4-{version}.zip.sha256").write_text(digest + "\n")
    known = GDUNIT4_SHA256.get(version)
    if known and known != digest:
        raise RuntimeError(f"gdUnit4 zip sha256 {digest} != pinned {known}")
    dest = project / "addons" / "gdUnit4"
    with zipfile.ZipFile(z) as zf:
        names = [n for n in zf.namelist() if re.match(r"^[^/]+/addons/gdUnit4/", n)]
        if not names:
            raise RuntimeError(f"{z} has no addons/gdUnit4")
        prefix = names[0].split("/addons/gdUnit4/")[0] + "/addons/gdUnit4/"
        for n in names:
            rel = n[len(prefix):]
            if not rel or n.endswith("/"):
                continue
            t = dest / rel
            t.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(n) as fi, open(t, "wb") as fo:
                shutil.copyfileobj(fi, fo)
            if rel.endswith(".sh"):
                os.chmod(t, 0o755)
    if enable_plugin:
        _enable_plugin(project, "res://addons/gdUnit4/plugin.cfg")
    if do_import:
        gd_run.import_project(project)
    return dest


def run_gdunit4(project, paths=("res://test",), timeout: float = 900, extra=()) -> dict:
    """Run gdUnit4's command-line tool headless and parse its JUnit XML.

    Command (verified with gdUnit4 6.2.1 on Godot 4.7.2, see procedures.md): godot --headless --path P
    -s res://addons/gdUnit4/bin/GdUnitCmdTool.gd --ignoreHeadlessMode -a <dir> ... -rd res://<report dir> -c
    Exit code (GdUnitTestSessionRunner.gd): 0 pass, 100 failures or errors, 101 orphans only, 103 headless refused,
    104 Godot version not supported, 105 script errors detected."""
    project = Path(project).resolve()
    out = project / ".agent_out"
    out.mkdir(exist_ok=True)
    if not (out / ".gdignore").exists():
        (out / ".gdignore").write_text("")
    stamp = time.strftime("%Y%m%d-%H%M%S")
    rd = out / "tests" / f"gdunit_{stamp}"
    rd.mkdir(parents=True, exist_ok=True)
    # -rd must be a res:// path: gdUnit4 6.2.1 joins an absolute OS path onto the project root
    # (verified 2026-10-02: reports landed in <project>/Users/.../results.xml)
    rd_res = "res://" + rd.relative_to(project).as_posix()
    cmd = [gd_env.find_godot(), "--headless", "--path", str(project), "-s", "res://addons/gdUnit4/bin/GdUnitCmdTool.gd",
           "--ignoreHeadlessMode"]
    for p in paths:
        cmd += ["-a", p]
    cmd += ["-rd", rd_res, "-c", *extra]
    log_path = out / "logs" / f"gdunit_{stamp}.log"
    log, code, timed_out, secs, _ = gd_run._run(cmd, project, timeout, False, log_path)
    xml = sorted(rd.rglob("results.xml"))
    junit = gd_stat.parse_junit(xml[-1]) if xml else {"ok": False, "tests": 0}
    html = sorted(rd.rglob("index.html"))
    parsed = gd_stat.parse_godot_log(log)
    ok = (not timed_out) and code == 0 and junit.get("ok", False) and junit.get("tests", 0) > 0
    return {"ok": ok, "exit_code": code, "timed_out": timed_out, "duration_s": round(secs, 2), "junit": junit,
            "junit_path": str(xml[-1]) if xml else None, "html": str(html[-1]) if html else None, "report_dir": str(rd),
            "parse_errors": parsed["parse_errors"], "script_errors": parsed["script_errors"][:20],
            "log_path": str(log_path), "cmd": " ".join(cmd), "log": log[-60000:]}


# ---------------------------------------------------------------- the batch import

def _imported_count(project: Path) -> int:
    d = project / ".godot" / "imported"
    return len(list(d.glob("*.md5"))) if d.exists() else 0


def import_props(project, drop, manifest: str = "manifest.csv", texture_mode: str = "extract", collision: str = "box",
                 thumbs: bool = False, budgets: dict | None = None, timeout: float = 3600) -> dict:
    """Run the whole batch: ingest (headless job) -> --import -> texture pass -> --import -> audit
    (+ thumbnails, windowed). Each stage's dict is kept; `ok` only when every stage passed."""
    project = Path(project).resolve()
    install_kit(project)
    stages: dict = {}
    t0 = time.time()
    stages["ingest"] = gd_run.run_script(project, "res://addons/agentkit/pipeline/prop_ingest.gd:ingest",
                                         {"drop": str(Path(drop).resolve()), "manifest": manifest, "texture_mode": texture_mode,
                                          "collision": collision, "budgets": budgets or {}}, timeout=timeout)
    if not stages["ingest"]["ok"]:
        return {"ok": False, "failed_stage": "ingest", "stages": _slim(stages)}
    before = _imported_count(project)
    stages["import1"] = gd_run.import_project(project, timeout=timeout)
    stages["import1"]["imported_files"] = _imported_count(project) - before
    if texture_mode == "extract":
        stages["textures"] = gd_run.run_script(project, "res://addons/agentkit/pipeline/prop_textures.gd:fix", {}, timeout=600)
        stages["import2"] = gd_run.import_project(project, timeout=timeout)
    stages["audit"] = gd_run.run_script(project, "res://addons/agentkit/pipeline/prop_audit.gd:audit", {}, timeout=1200)
    if thumbs:
        stages["thumbs"] = gd_run.run_script(project, "res://addons/agentkit/pipeline/prop_thumbs.gd:thumbs", {"size": 160},
                                             headless=False, timeout=900)
    ok = all(s.get("ok") for s in stages.values())
    return {"ok": ok, "seconds": round(time.time() - t0, 1), "stages": _slim(stages)}


def _slim(stages: dict) -> dict:
    out = {}
    for k, v in stages.items():
        s = {x: v.get(x) for x in ("ok", "error", "duration_s", "exit_code", "log_path", "imported_files", "class_cache")}
        s["result"] = v.get("result")
        s["engine_errors"] = len(v.get("engine_errors", []))
        s["engine_error_sample"] = [e.get("message", "")[:160] for e in v.get("engine_errors", [])[:5]]
        out[k] = s
    return out


# ---------------------------------------------------------------- offline GLB probe (same rules as glb_probe.gd)

def glb_info(path) -> dict:
    """Header, JSON chunk, generator, triangles, materials, images, extensions; no Godot needed."""
    b = Path(path).read_bytes()
    r: dict = {"file": str(path), "bytes": len(b), "valid": False}
    if len(b) < 20 or b[:4] != b"glTF":
        r["error"] = "not a binary glTF"
        return r
    ver, length = struct.unpack("<II", b[4:12])
    if length > len(b):
        r["error"] = f"truncated: header {length} bytes, file {len(b)}"
        return r
    jl, jt = struct.unpack("<I4s", b[12:20])
    if jt != b"JSON":
        r["error"] = "first chunk is not JSON"
        return r
    j = json.loads(b[20:20 + jl])
    acc = j.get("accessors", [])
    tris = 0
    for m in j.get("meshes", []):
        for p in m.get("primitives", []):
            c = acc[p["indices"]]["count"] if "indices" in p else acc[p["attributes"]["POSITION"]]["count"]
            tris += c // 3 if p.get("mode", 4) == 4 else max(c - 2, 0)
    r.update({"version": ver, "generator": j.get("asset", {}).get("generator", ""), "triangles": tris,
              "materials": len(j.get("materials", [])), "images": len(j.get("images", [])),
              "animations": len(j.get("animations", [])), "extensions_used": j.get("extensionsUsed", []),
              "extensions_required": j.get("extensionsRequired", []),
              "external_uris": [x["uri"] for x in j.get("buffers", []) + j.get("images", []) if "uri" in x and not str(x["uri"]).startswith("data:")]})
    r["valid"] = tris > 0 and not r["external_uris"]
    return r


# ---------------------------------------------------------------- export filters

# Dev-only folders that must not ship [added]: test frameworks, tests, agent tooling, editor-only plugins.
DEV_ONLY = ("*.agent_out/*", "addons/gdUnit4/*", "addons/gut/*", "test/*", "tests/*", "test_red/*",
            "addons/agentkit/*", "addons/prop_pipeline/*")


def exclude_from_export(project, preset: str, patterns=DEV_ONLY) -> str:
    """Set exclude_filter of one preset in export_presets.cfg (text edit of that preset's block only)."""
    cfg = Path(project) / "export_presets.cfg"
    text = cfg.read_text()
    blocks = re.split(r"(?m)^(?=\[preset\.)", text)
    value = ", ".join(patterns)
    for i, b in enumerate(blocks):
        head = b.split("\n", 1)[0]
        if head.startswith("[preset.") and ".options]" not in head and re.search(r'(?m)^name="%s"$' % re.escape(preset), b):
            blocks[i] = re.sub(r'(?m)^exclude_filter=".*"$', f'exclude_filter="{value}"', b)
    cfg.write_text("".join(blocks))
    return value


# ---------------------------------------------------------------- CI

def write_workflow(project_root, project_subdir: str = ".", godot: str = "4.7.2", presets=("Linux",),
                   name: str = "godot-ci.yml") -> Path:
    """Copy the workflow and the CI script from scripts/ci/ into <root>/.github/workflows/ and <root>/tools/ci/.
    The YAML is a thin shell around tools/ci/godot_ci.sh, which runs locally too (test it there first)."""
    root = Path(project_root)
    wf = root / ".github" / "workflows" / name
    wf.parent.mkdir(parents=True, exist_ok=True)
    text = (CI_TEMPLATES / "godot-ci.yml").read_text()
    text = text.replace("__GODOT_VERSION__", godot).replace("__PROJECT_DIR__", project_subdir)
    # space-separated; a space inside a preset name becomes "_" (godot_ci.sh turns it back)
    text = text.replace("__PRESETS__", " ".join(p.replace(" ", "_") for p in presets))
    wf.write_text(text)
    sh = root / "tools" / "ci" / "godot_ci.sh"
    sh.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(CI_TEMPLATES / "godot_ci.sh", sh)
    os.chmod(sh, 0o755)
    return wf


def lint_workflow(path, timeout: float = 300) -> dict:
    """actionlint (rhysd/actionlint, via the actionlint-py wheel run by uvx: nothing installed globally)."""
    uvx = shutil.which("uvx")
    if not uvx:
        return {"ok": False, "error": "uvx not found (install uv), or run actionlint another way"}
    cmd = [uvx, "--from", "actionlint-py", "actionlint", "-format", "{{json .}}", str(path)]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    try:
        issues = json.loads(p.stdout or "[]")
    except json.JSONDecodeError:
        issues = [{"message": p.stdout[-2000:]}]
    return {"ok": p.returncode == 0 and not issues, "exit_code": p.returncode, "issues": issues,
            "stderr": p.stderr[-2000:], "cmd": " ".join(cmd)}


def check_urls(urls, timeout: float = 30) -> dict:
    out = {}
    for u in urls:
        try:
            req = urllib.request.Request(u, method="HEAD")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                out[u] = {"status": r.status, "bytes": int(r.headers.get("Content-Length") or 0)}
        except Exception as exc:  # noqa: BLE001
            out[u] = {"status": getattr(exc, "code", None), "error": str(exc)[:200]}
    return {"ok": all(v.get("status") == 200 for v in out.values()), "urls": out}


# ---------------------------------------------------------------- MCP over stdio (project-local)

def mcp_stdio(cmd: list[str], calls: list[tuple[str, dict]], env: dict | None = None, cwd=None, timeout: float = 120,
              hold_project=None) -> dict:
    """Start an MCP server over stdio, initialize, list tools, run `calls`, stop it (only the process this
    started). hold_project: hold that project's gd_run lock and a GD_MAX slot while the server may run Godot."""
    import contextlib
    full_env = dict(os.environ)
    full_env.update(env or {})
    ctx = gd_run.godot_slot(hold_project) if hold_project else contextlib.nullcontext()
    out: dict = {"cmd": cmd, "calls": []}
    t0 = time.time()
    with ctx:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                env=full_env, cwd=str(cwd) if cwd else None)
        import queue
        import threading
        q: "queue.Queue[str]" = queue.Queue()
        err_lines: list[str] = []
        # reader threads: a blocking readline() would ignore the timeout, and a full stderr pipe deadlocks
        threading.Thread(target=lambda: [q.put(l) for l in proc.stdout], daemon=True).start()
        threading.Thread(target=lambda: [err_lines.append(l) for l in proc.stderr], daemon=True).start()

        def send(msg):
            proc.stdin.write(json.dumps(msg) + "\n")
            proc.stdin.flush()

        def wait_id(i, t):
            end = time.time() + t
            while time.time() < end:
                try:
                    line = q.get(timeout=0.2)
                except queue.Empty:
                    if proc.poll() is not None:
                        return None
                    continue
                try:
                    m = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if m.get("id") == i:
                    return m
            return None
        try:
            send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                                                                                   "clientInfo": {"name": "gd_pipeline", "version": "0.1"}}})
            init = wait_id(1, timeout)
            out["initialized"] = bool(init and "result" in init)
            out["server_info"] = (init or {}).get("result", {}).get("serverInfo")
            send({"jsonrpc": "2.0", "method": "notifications/initialized"})
            send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
            tl = wait_id(2, 60)
            tools = [t["name"] for t in (tl or {}).get("result", {}).get("tools", [])]
            out["tool_count"] = len(tools)
            out["tools"] = tools
            for k, (name, args) in enumerate(calls):
                t1 = time.time()
                send({"jsonrpc": "2.0", "id": 10 + k, "method": "tools/call", "params": {"name": name, "arguments": args}})
                resp = wait_id(10 + k, timeout)
                res = (resp or {}).get("result") or (resp or {}).get("error")
                text = ""
                if isinstance(res, dict):
                    text = "\n".join(c.get("text", "") for c in res.get("content", []) if isinstance(c, dict))
                out["calls"].append({"name": name, "args": args, "seconds": round(time.time() - t1, 2),
                                     "is_error": bool(isinstance(res, dict) and res.get("isError")), "text": text[:4000],
                                     "raw": None if text else res})
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
    out["seconds"] = round(time.time() - t0, 1)
    out["stderr_tail"] = "".join(err_lines)[-2000:]
    out["ok"] = out.get("initialized", False) and out.get("tool_count", 0) > 0
    return out


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "glb":
        for f in sys.argv[2:]:
            print(json.dumps(glb_info(f)))
    else:
        print(__doc__)
