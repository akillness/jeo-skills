#!/usr/bin/env python3
"""gd_perf: performance and release toolkit (scenario-godot-performance-export 0.1, Godot 4.7.2, macOS arm64).

System python3, standard library (Playwright for Python is optional, for web_smoke). Builds on the
lead's toolkit (skills/scenario-godot-expert/scripts: gd_env, gd_run, gd_stat, gd_review); never replaces it.

Public API:
    install(project)                                     copy agentkit/perf/*.gd to res://addons/agentkit/perf/
    add_autoload(project, name, res_path)
    profile_variant(project, scene, size=(1280, 720), seconds=3.0, warmup=60, settings=None, toggles=None,
                    driver="vulkan", rendering_method=None, shot=None, csv=None) -> dict
    summarize_csv(path) -> dict                          p50/p95/max per column
    compare(before, after, noise=0.05, floor_ms=0.1) -> dict
    classify(summary, half_res_summary=None) -> dict     cpu / gpu bound, with reasons
    scene_audit(project, scene) -> dict                  perf_audit.gd:scene
    apply_fix(project, scene, out, fix, **kw) -> dict    perf_fixes.gd:apply (never overwrites scene)
    release_audit(project) -> dict                       project.godot + export_presets.cfg checks
    size_report(paths, brotli_quality=9) -> dict         raw, gzip -9, brotli per file and total
    pck_listing(pck) -> dict                             files and sizes inside a Godot 4 .pck
    zip_listing(zip_or_apk, top=15) -> dict
    serve(root, coop_coep=False, port=0) -> Server      .url, .requests, .stop()
    web_smoke(url, ready_line="SHIP_BOOT", timeout=90, shot=None, init_script=None, after_ready=None) -> dict
    find_android() -> dict                               SDK and JDK (env, Android Studio's defaults per OS, Unity Hub)
    make_keystore(path, alias, password, dname=..., jdk=None) -> dict
    private_home(root) -> Path                           Godot home with only export_templates linked (keeps the user's editor settings untouched)
    home_env(home) -> dict                               the variables that point Godot at a private_home (HOME, APPDATA or XDG_*)
    export_env(**env) (context manager)                  env for one gd_run.export call
    export_android(project, preset, out, debug=True, keystore=None, home=None, android=None) -> dict
    verify_apk(apk, android=None) -> dict
    verify_macos(zip_path, workdir) -> dict
    run_exported(binary, args=(), timeout=120, home=None) -> dict
    verify_xcode_project(folder) -> dict
    xcode_build(folder, scheme=None, timeout=1800) -> dict
    notarize_plan(zip_path, app_path, profile="godot-notary") -> list[str]   (documented, not run)
    steam_vdf(app_id, depots, out_dir, desc="", set_live="") -> dict         (written, steamcmd not run)
"""
from __future__ import annotations

__version__ = "0.1"

import contextlib
import gzip
import http.server
import json
import os
import plistlib
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEAD = Path(os.environ.get("GODOT_EXPERT_SCRIPTS", HERE.parents[1] / "scenario-godot-expert" / "scripts"))
if str(LEAD) not in sys.path:
    sys.path.insert(0, str(LEAD))
import gd_env  # noqa: E402
import gd_run  # noqa: E402
import gd_stat  # noqa: E402

PERF_SRC = HERE / "agentkit" / "perf"
PERF_RES = "res://addons/agentkit/perf"


# ---------------------------------------------------------------- install

def install(project) -> Path:
    """Lead AgentKit plus this skill's perf modules in res://addons/agentkit/perf/."""
    gd_env.install_agentkit(project)
    dest = Path(project) / "addons" / "agentkit" / "perf"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(PERF_SRC.glob("*.gd")):
        shutil.copy2(f, dest / f.name)
    return dest


def add_autoload(project, name: str, res_path: str) -> None:
    gd_env.set_project_setting(project, f"autoload/{name}", f'"*{res_path}"')


# ---------------------------------------------------------------- profiling

def summarize_csv(path) -> dict:
    cols = gd_stat.read_monitor_csv(path)
    out = {}
    for k in ("frame_ms", "cpu_ms", "gpu_ms", "process_ms", "physics_ms", "draw_calls", "objects", "primitives", "pipeline_compiles", "video_mem_mb"):
        if k in cols:
            # own percentiles: gd_stat.frame_stats divides by zero on an all-zero column (4.7.2 toolkit, observed)
            s = sorted(v for v in cols[k] if v == v)
            if not s:
                continue
            out[k] = {"p50": gd_stat._percentile(s, 50), "p95": gd_stat._percentile(s, 95), "max": s[-1], "mean": sum(s) / len(s)}
    out["frames"] = len(cols.get("frame", []))
    return out


def profile_variant(project, scene: str, size=(1280, 720), seconds: float = 3.0, warmup: int = 60, settings=None, toggles=None,
                    driver: str | None = "vulkan", rendering_method: str | None = None, shot: str | None = None, csv: str | None = None,
                    target_ms: float = 16.67, timeout: float = 300) -> dict:
    """Windowed run of perf_bench.gd:run_variant. driver="vulkan": Metal reports gpu_ms 0 in 4.7.2 (lead, observed).
    Returns the job result plus `summary` (summarize_csv), `budget` (gd_stat.budget_check on gpu_ms, else frame_ms)."""
    name = re.sub(r"[^A-Za-z0-9]+", "_", Path(scene).stem + "_" + (rendering_method or "default"))
    args = {"scene": scene, "size": list(size), "seconds": seconds, "warmup": warmup, "settings": settings or {},
            "toggles": list(toggles or []), "csv": csv or f"bench/{name}_{time.strftime('%H%M%S')}.csv", "shot": shot or ""}
    xa = []
    if driver:
        xa += ["--rendering-driver", driver]
    if rendering_method:
        xa += ["--rendering-method", rendering_method]
    r = gd_run.run_script(project, f"{PERF_RES}/perf_bench.gd:run_variant", args=args, headless=False, extra_args=xa or None, timeout=timeout)
    res = r.get("result") or {}
    if res.get("csv") and Path(res["csv"]).exists():
        r["summary"] = summarize_csv(res["csv"])
        cols = gd_stat.read_monitor_csv(res["csv"])
        g = cols.get("gpu_ms") or []
        series = g if any(v > 0 for v in g) else cols.get("frame_ms", [])
        if any(v > 0 for v in series):
            r["budget"] = gd_stat.budget_check(series, target_ms)
    return r


def _metric(run: dict, key: str):
    if key == "scene_process_p95":
        return (((run.get("result") or {}).get("scene_process")) or {}).get("p95_ms")
    s = run.get("summary") or {}
    if key.endswith("_p95"):
        return (s.get(key[:-4]) or {}).get("p95")
    ri = ((run.get("result") or {}).get("render_info") or {})
    kind, _, field = key.partition(".")
    return (ri.get(kind) or {}).get(field)


# process_ms from Performance.TIME_PROCESS is not per frame (one value held for about a second, the
# worst step of the previous second; observed 4.7.2): scene_process_p95 is timed per frame by sentinels.
COMPARE_KEYS = ("gpu_ms_p95", "cpu_ms_p95", "scene_process_p95", "visible.draw_calls", "visible.objects",
                "shadow.draw_calls", "visible.primitives")


def compare(before: dict, after: dict, noise: float = 0.05, floor_ms: float = 0.1) -> dict:
    """Per-metric delta. A change counts only above max(noise * before, floor) [added: noise rule,
    tune with repeated runs]. Works on profile_variant results."""
    rows = {}
    for k in COMPARE_KEYS:
        b, a = _metric(before, k), _metric(after, k)
        if b is None or a is None:
            continue
        thr = max(abs(b) * noise, floor_ms if k.endswith("_p95") else 0.5)
        d = a - b
        verdict = "no change" if abs(d) <= thr else ("better" if d < 0 else "worse")
        rows[k] = {"before": b, "after": a, "delta": d, "ratio": (a / b) if b else None, "verdict": verdict}
    return {"metrics": rows, "improved": [k for k, v in rows.items() if v["verdict"] == "better"],
            "regressed": [k for k, v in rows.items() if v["verdict"] == "worse"]}


def classify(run: dict, half_res: dict | None = None) -> dict:
    """Which side bounds the frame [added heuristic, from the docs' bottleneck math: frame time is the
    slower of CPU and GPU]. Main-thread CPU = scene _process (sentinels) + physics + viewport render CPU (cpu_ms)."""
    g = _metric(run, "gpu_ms_p95") or 0.0
    cpu = sum((_metric(run, k) or 0.0) for k in ("scene_process_p95", "physics_ms_p95", "cpu_ms_p95"))
    out = {"gpu_p95": g, "cpu_main_p95": cpu, "bound": "gpu" if g > cpu else "cpu", "reasons": []}
    if out["bound"] == "cpu":
        parts = {k: _metric(run, k) or 0.0 for k in ("scene_process_p95", "physics_ms_p95", "cpu_ms_p95")}
        top = max(parts, key=parts.get)
        out["cpu_top"] = top
        out["reasons"].append(f"{top} is the largest CPU share ({parts[top]:.2f} ms)")
    if half_res is not None:
        g2 = _metric(half_res, "gpu_ms_p95") or 0.0
        out["gpu_half_res_p95"] = g2
        drop = (g - g2) / g if g else 0.0
        out["gpu_drop_at_half_res"] = drop
        out["gpu_kind"] = "fill/shading (resolution) bound" if drop > 0.3 else "geometry, draw or shadow bound (resolution barely matters)"
        out["reasons"].append(f"gpu p95 {g:.2f} -> {g2:.2f} ms at 0.5 scaling_3d_scale ({drop:.0%})")
    return out


def scene_audit(project, scene: str) -> dict:
    return gd_run.run_script(project, f"{PERF_RES}/perf_audit.gd:scene", args={"scene": scene}, timeout=300)


def apply_fix(project, scene: str, out: str, fix: str, **kw) -> dict:
    a = {"scene": scene, "out": out, "fix": fix}
    a.update(kw)
    return gd_run.run_script(project, f"{PERF_RES}/perf_fixes.gd:apply", args=a, timeout=300)


# ---------------------------------------------------------------- release audit (offline)

def read_presets(project) -> list[dict]:
    cfg = Path(project) / "export_presets.cfg"
    if not cfg.exists():
        return []
    presets, cur = {}, None
    for line in cfg.read_text().splitlines():
        m = re.match(r"^\[preset\.(\d+)(\.options)?\]$", line.strip())
        if m:
            idx = int(m.group(1))
            presets.setdefault(idx, {"index": idx, "options": {}})
            cur = (idx, bool(m.group(2)))
            continue
        if cur and "=" in line:
            k, v = line.split("=", 1)
            tgt = presets[cur[0]]["options"] if cur[1] else presets[cur[0]]
            tgt[k.strip()] = v.strip().strip('"') if v.strip().startswith('"') else v.strip()
    return [presets[i] for i in sorted(presets)]


def preset_fields(project, preset: str, **fields) -> dict:
    """Set preset-level keys that gd_run.ensure_preset does not take (custom_features, export_filter,
    export_files, include_filter, exclude_filter, encrypt_pck ...). Values are Godot literals, e.g.
    custom_features='"demo"', export_files='PackedStringArray("res://dlc/bonus.tscn")'.
    Keeps a copy of the previous file as export_presets.cfg.bak."""
    cfg = Path(project) / "export_presets.cfg"
    text = cfg.read_text()
    shutil.copy2(cfg, cfg.with_suffix(".cfg.bak"))
    lines = text.splitlines()
    start = None
    for i, ln in enumerate(lines):
        if re.match(r"^\[preset\.\d+\]$", ln.strip()):
            j = i + 1
            while j < len(lines) and not lines[j].startswith("["):
                if lines[j].strip() == f'name="{preset}"':
                    start = i
                j += 1
            if start is not None:
                end = j
                break
    if start is None:
        return {"ok": False, "error": f"preset {preset!r} not found"}
    block = lines[start + 1:end]
    for k, v in fields.items():
        for bi, ln in enumerate(block):
            if ln.split("=", 1)[0].strip() == k:
                block[bi] = f"{k}={v}"
                break
        else:
            block.insert(len([b for b in block if b.strip()]), f"{k}={v}")
    lines[start + 1:end] = block
    cfg.write_text("\n".join(lines) + "\n")
    return {"ok": True, "preset": preset, "fields": fields}


SECRET_KEYS = ("keystore/release_password", "keystore/debug_password", "notarization/apple_id_password", "notarization/api_key",
               "codesign/certificate_password", "script_encryption_key")
ANDROID_PKG = re.compile(r"^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$")
APPLE_ID = re.compile(r"^[A-Za-z0-9.-]+$")
GODOT_ICON_COLORS = ("#478cbf", "#363d52")


def release_audit(project) -> dict:
    """Pre-publish and export-readiness checks from project.godot, export_presets.cfg and the files.
    Flags: {id, severity, what, fix}. Offline: no Godot process."""
    P = Path(project)
    s = gd_env.read_project(P)
    get = lambda k, d="": s.get(k, d).strip('"')  # noqa: E731
    flags = []
    add = lambda i, sev, what, fix: flags.append({"id": i, "severity": sev, "what": what, "fix": fix})  # noqa: E731
    presets = read_presets(P)
    plats = {p.get("platform") for p in presets}
    name = get("application/config/name")
    if not name or name.lower() in ("new game project", "my untitled game", "base2d", "base3d"):
        add("default_name", "medium", f"application/config/name is {name!r}", "set the real title (StayAtHomeDev, 3iGHpha-DmE)")
    icon = get("application/config/icon")
    icon_file = P / icon.replace("res://", "") if icon else None
    if not icon:
        add("no_icon", "medium", "no application/config/icon", "set a real icon (taskbar, dock, launcher)")
    elif icon_file and icon_file.exists() and icon_file.suffix == ".svg" and all(c in icon_file.read_text(errors="ignore") for c in GODOT_ICON_COLORS):
        add("default_icon", "medium", f"{icon} uses the default Godot icon colors", "replace the icon before publishing")
    if not get("application/boot_splash/image"):
        add("default_splash", "low", "boot splash image not set", "application/boot_splash/image and bg_color")
    ms = get("application/run/main_scene")
    if not ms or not (P / ms.replace("res://", "")).exists():
        add("main_scene", "high", f"main scene {ms!r} missing", "set application/run/main_scene")
    if s.get("physics/3d/physics_engine", "").strip('"') in ("", "DEFAULT", "GodotPhysics3D") and (P / "main.tscn").exists() and "Node3D" in (P / "main.tscn").read_text(errors="ignore"):
        add("physics_engine", "medium", "3D project without Jolt (hand-written project.godot defaults to GodotPhysics3D)", 'physics/3d/physics_engine="Jolt Physics"')
    needs_astc = plats & {"macOS", "Android", "iOS"}
    if needs_astc and s.get("rendering/textures/vram_compression/import_etc2_astc", "false") != "true":
        add("etc2_astc", "high", f"{sorted(needs_astc)} presets but import_etc2_astc is off (macOS export fails, verified)", "set it true and --import")
    if s.get("rendering/renderer/rendering_method.web") and s["rendering/renderer/rendering_method.web"].strip('"') != "gl_compatibility":
        add("web_renderer", "high", "rendering_method.web is not gl_compatibility", "web is WebGL 2 only: Compatibility")
    has_tests = any((P / d).exists() for d in ("test", "tests", "addons/gut", "addons/gdUnit4"))
    for p in presets:
        o, plat, pname = p["options"], p.get("platform", ""), p.get("name", "?")
        for k in SECRET_KEYS:
            if o.get(k):
                add("secret_in_presets", "high", f"{pname}: {k} is written in export_presets.cfg", "pass it as a GODOT_* env var at export time")
        ep = p.get("export_path", "")
        if ep and not ep.startswith(("/", "..")) and not os.path.isabs(ep):
            d = (P / ep).parent
            if d != P and not (d / ".gdignore").exists():
                add("export_inside_project", "medium", f"{pname}: export_path {ep} is inside the project", "export outside or add .gdignore (else the build is packed next time)")
        if has_tests and "test" not in p.get("exclude_filter", "") and "gut" not in p.get("exclude_filter", ""):
            add("tests_shipped", "low", f"{pname}: test code and test addons are exported", 'exclude_filter="test/*, tests/*, addons/gut/*"')
        if (P / "addons" / "agentkit").exists() and "addons/agentkit" not in p.get("exclude_filter", ""):
            add("agent_tooling_shipped", "low", f"{pname}: addons/agentkit (agent test tooling) is exported",
                "exclude addons/agentkit/* and keep only the runtime autoloads the game uses (seen: 30 .gdc files in a 4.7.2 macOS pck)")
        if plat == "Android":
            if not ANDROID_PKG.match(o.get("package/unique_name", "")):
                add("android_package", "high", f"{pname}: package/unique_name {o.get('package/unique_name')!r} invalid", "reverse DNS, letters first in each segment")
            if o.get("gradle_build/use_gradle_build") != "true" and o.get("gradle_build/export_format", "0") == "1":
                add("aab_needs_gradle", "high", f"{pname}: AAB without Gradle build", "use_gradle_build=true (AAB is the Play Store format)")
            if o.get("gradle_build/use_gradle_build") != "true":
                add("android_apk_only", "low", f"{pname}: no Gradle build: APK only, no AAB for Google Play", "Gradle build + export_format=1 for the store")
        if plat in ("iOS", "macOS"):
            bid = o.get("application/bundle_identifier", "")
            if not bid or not APPLE_ID.match(bid) or "." not in bid:
                add("bundle_id", "high", f"{pname}: bundle identifier {bid!r} invalid", "reverse DNS, only A-Z a-z 0-9 - .")
        if plat == "iOS" and len(o.get("application/app_store_team_id", "")) != 10:
            add("team_id", "high", f"{pname}: app_store_team_id not a 10-character Team ID", "Apple developer account, Membership page")
        if plat == "macOS" and o.get("codesign/entitlements/debugging") == "true":
            add("mac_debug_entitlement", "high", f"{pname}: Debugging entitlement on", "off, or notarization is refused (docs)")
        if plat == "Web" and o.get("variant/thread_support") == "true":
            add("web_threads", "medium", f"{pname}: thread support on: needs COOP/COEP headers over HTTPS (itch: SharedArrayBuffer box)",
                "single-threaded unless threads are measured to matter")
    return {"ok": not any(f["severity"] == "high" for f in flags), "flags": flags, "presets": [{k: v for k, v in p.items() if k != "options"} for p in presets]}


# ---------------------------------------------------------------- sizes

def _brotli_size(path: Path, quality: int) -> int | None:
    try:
        import brotli  # type: ignore
        return len(brotli.compress(path.read_bytes(), quality=quality))
    except ImportError:
        exe = shutil.which("brotli")
        if not exe:
            return None
        out = subprocess.run([exe, "-c", f"-q{quality}", str(path)], capture_output=True)
        return len(out.stdout) if out.returncode == 0 else None


def size_report(paths, brotli_quality: int = 9) -> dict:
    """paths: a folder (every file in it) or a list of files. Transfer size budgets use compressed bytes:
    itch.io does not compress on the fly (web docs), so precompress or count raw."""
    if isinstance(paths, (str, Path)) and Path(paths).is_dir():
        files = sorted(p for p in Path(paths).rglob("*") if p.is_file())
    else:
        files = [Path(p) for p in ([paths] if isinstance(paths, (str, Path)) else paths)]
    rows, tot = [], {"raw": 0, "gzip": 0, "brotli": 0}
    for f in files:
        raw = f.stat().st_size
        gz = len(gzip.compress(f.read_bytes(), 9))
        br = _brotli_size(f, brotli_quality)
        rows.append({"file": f.name, "raw": raw, "gzip": gz, "brotli": br})
        tot["raw"] += raw
        tot["gzip"] += gz
        tot["brotli"] += br or gz
    rows.sort(key=lambda r: -r["raw"])
    mb = {k: round(v / 1048576, 2) for k, v in tot.items()}
    return {"files": rows, "total": tot, "total_mb": mb, "brotli_quality": brotli_quality}


def pck_listing(pck, top: int = 20) -> dict:
    """Read the directory of a Godot 4 .pck (format 2 and 3, unencrypted directory). Sizes per file,
    largest first: the list to cut when a build is over budget."""
    data = Path(pck).read_bytes()
    off = 0
    if data[:4] != b"GDPC":
        i = data.rfind(b"GDPC")                    # embedded pack: trailer points back
        if i < 0:
            return {"ok": False, "error": "no GDPC magic"}
        off = i
    fmt, vmaj, vmin, vpat, flags = struct.unpack_from("<5I", data, off + 4)
    p = off + 24
    if fmt >= 3:
        file_base, dir_off = struct.unpack_from("<QQ", data, p)
        p = off + dir_off if dir_off else p + 16 + 64
    else:
        struct.unpack_from("<Q", data, p)[0]
        p += 8 + 64
    if flags & 1:
        return {"ok": False, "error": "encrypted directory", "format": fmt}
    count = struct.unpack_from("<I", data, p)[0]
    p += 4
    files = []
    for _ in range(count):
        ln = struct.unpack_from("<I", data, p)[0]
        p += 4
        path = data[p:p + ln].rstrip(b"\0").decode("utf-8", "replace")
        p += ln
        fo, fs = struct.unpack_from("<QQ", data, p)
        p += 16 + 16 + 4                           # offset, size, md5, flags
        files.append({"path": path, "size": fs})
    files.sort(key=lambda f: -f["size"])
    return {"ok": True, "format": fmt, "godot": f"{vmaj}.{vmin}.{vpat}", "count": count,
            "total": sum(f["size"] for f in files), "largest": files[:top], "paths": [f["path"] for f in files]}


def zip_listing(path, top: int = 15) -> dict:
    with zipfile.ZipFile(path) as z:
        rows = [{"name": i.filename, "raw": i.file_size, "stored": i.compress_size} for i in z.infolist()]
    rows.sort(key=lambda r: -r["stored"])
    groups = {}
    for r in rows:
        g = r["name"].split("/", 1)[0] if "/" in r["name"] else r["name"]
        groups[g] = groups.get(g, 0) + r["stored"]
    return {"entries": len(rows), "bytes_on_disk": Path(path).stat().st_size, "largest": rows[:top],
            "by_top_folder": dict(sorted(groups.items(), key=lambda kv: -kv[1])[:10])}


# ---------------------------------------------------------------- web

class Server:
    def __init__(self, httpd, thread, url, log):
        self.httpd, self.thread, self.url, self.requests = httpd, thread, url, log

    def stop(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(5)


def serve(root, coop_coep: bool = False, port: int = 0) -> Server:
    """Static server for a web export: application/wasm MIME, no-store cache, and optionally the
    cross-origin isolation headers a threaded export needs (COOP same-origin, COEP require-corp).
    localhost counts as a secure context, so this is a faithful local test of the header rule."""
    root = str(Path(root).resolve())
    log: list[dict] = []

    class H(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm",
                          ".pck": "application/octet-stream", ".js": "application/javascript"}

        def __init__(self, *a, **k):
            super().__init__(*a, directory=root, **k)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            if coop_coep:
                self.send_header("Cross-Origin-Opener-Policy", "same-origin")
                self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
            super().end_headers()

        def log_message(self, fmt, *args):
            log.append({"line": fmt % args})

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return Server(httpd, t, f"http://127.0.0.1:{httpd.server_address[1]}/", log)


def web_smoke(url: str, ready_line: str = "SHIP_BOOT", timeout: float = 90, shot: str | None = None,
              init_script: str | None = None, after_ready=None, viewport=(960, 540)) -> dict:
    """Load a web export in headless Chrome (Playwright, channel="chrome"), wait for a console line,
    collect console, page errors and isolation facts, optional canvas screenshot. after_ready(page)
    may run extra checks and return a dict (stored under "after")."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"ok": False, "ran": False, "error": "playwright for python not installed (pip install playwright)"}
    console, errors = [], []
    out = {"url": url, "ran": True}
    with sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chrome", headless=True)
        except Exception:
            browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": viewport[0], "height": viewport[1]})
        if init_script:
            page.add_init_script(init_script)
        t_ready = {}
        t0 = time.time()

        def on_console(m):
            console.append({"type": m.type, "text": m.text[:500], "t": round(time.time() - t0, 3)})
            if ready_line in m.text and "t" not in t_ready:
                t_ready["t"] = time.time() - t0

        page.on("console", on_console)
        page.on("pageerror", lambda e: errors.append(str(e)[:500]))
        page.goto(url, wait_until="load", timeout=int(timeout * 1000))
        while "t" not in t_ready and time.time() - t0 < timeout and not errors:
            page.wait_for_timeout(200)
        out["ready_s"] = round(t_ready["t"], 2) if "t" in t_ready else None
        out["facts"] = page.evaluate("""() => ({crossOriginIsolated: self.crossOriginIsolated,
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            webgl2: !!document.createElement('canvas').getContext('webgl2'),
            statusText: (document.querySelector('#status-notice') || {}).textContent || ''})""")
        if out["ready_s"] is not None:
            page.wait_for_timeout(1500)
            if after_ready:
                out["after"] = after_ready(page)
            if shot:
                Path(shot).parent.mkdir(parents=True, exist_ok=True)
                page.locator("canvas").first.screenshot(path=shot)
                out["shot"] = shot
        browser.close()
    out["console"] = console[-80:]
    out["page_errors"] = errors
    out["ok"] = out["ready_s"] is not None and not errors
    return out


# ---------------------------------------------------------------- Android

def _java_major(java: Path) -> int:
    try:
        v = subprocess.run([str(java), "-version"], capture_output=True, text=True, timeout=30).stderr
        m = re.search(r'version "(\d+)', v)
        return int(m.group(1)) if m else 0
    except Exception:
        return 0


def _tool(folder, name: str) -> Path | None:
    """folder/name as this OS spells it: Windows ships adb.exe, apksigner.bat and keytool.exe."""
    for suffix in (".exe", ".bat", ".cmd") if sys.platform == "win32" else ("",):
        p = Path(folder) / (name + suffix)
        if p.exists():
            return p
    return None


def find_android() -> dict:
    """Locate an Android SDK and a JDK 17+. Order: ANDROID_HOME/ANDROID_SDK_ROOT and JAVA_HOME,
    Android Studio's default SDK and JBR for this OS, Unity Hub's AndroidPlayer (SDK + OpenJDK), the
    system JDKs, then (Linux and Windows) the JDK behind `java` on PATH."""
    sdks, jdks = [], []
    for e in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        if os.environ.get(e):
            sdks.append(Path(os.environ[e]))
    if os.environ.get("JAVA_HOME"):
        jdks.append(Path(os.environ["JAVA_HOME"]))
    if sys.platform == "win32":
        sdks.append(Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "Android" / "Sdk")
        jdks.append(Path(os.environ.get("ProgramFiles") or "C:/Program Files") / "Android" / "Android Studio" / "jbr")
    elif sys.platform == "darwin":
        sdks.append(Path.home() / "Library" / "Android" / "sdk")
        jdks.append(Path("/Applications/Android Studio.app/Contents/jbr/Contents/Home"))
    else:
        sdks.append(Path.home() / "Android" / "Sdk")
        # Android Studio's documented Linux install folders, then the distribution JDKs.
        jdks += [Path(d) / "jbr" for d in ("/opt/android-studio", "/usr/local/android-studio", Path.home() / "android-studio")]
        jdks += sorted(Path("/usr/lib/jvm").glob("*"), reverse=True)
    for u in sorted(Path("/Applications/Unity/Hub/Editor").glob("*/PlaybackEngines/AndroidPlayer"), reverse=True):
        sdks.append(u / "SDK")
        jdks.append(u / "OpenJDK")
    jdks += sorted(Path("/Library/Java/JavaVirtualMachines").glob("*/Contents/Home"), reverse=True)
    # bin/java -> the JDK home. Not on macOS: /usr/bin/java there is a stub that can open an install dialog.
    if sys.platform != "darwin" and shutil.which("java"):
        jdks.append(Path(shutil.which("java")).resolve().parent.parent)
    out = {"sdk": None, "jdk": None, "build_tools": None, "platforms": [], "ndk": None, "problems": []}
    for s in sdks:
        bts = sorted(d for d in (s / "build-tools").glob("*") if _tool(d, "apksigner")) if (s / "build-tools").exists() else []
        if _tool(s / "platform-tools", "adb") and bts:
            out.update(sdk=str(s), build_tools=str(bts[-1]), platforms=sorted(p.name for p in (s / "platforms").glob("android-*")))
            ndk = sorted((s / "ndk").glob("*")) if (s / "ndk").exists() else []
            out["ndk"] = str(ndk[-1]) if ndk else (str(s.parent / "NDK") if (s.parent / "NDK").exists() else None)
            break
    for j in jdks:
        java = _tool(j / "bin", "java")
        if java and _tool(j / "bin", "keytool") and _java_major(java) >= 17:
            out["jdk"] = str(j)
            out["java_major"] = _java_major(java)
            break
    if not out["sdk"]:
        out["problems"].append("no Android SDK with platform-tools/adb and build-tools/*/apksigner")
    if not out["jdk"]:
        out["problems"].append("no JDK 17+ (Godot docs recommend OpenJDK 17)")
    out["ok"] = not out["problems"]
    return out


def make_keystore(path, alias: str, password: str, dname: str = "CN=Android Debug,O=Android,C=US", jdk: str | None = None,
                  validity_days: int = 10000) -> dict:
    """keytool -genkeypair (RSA 2048). Keystore and key password are the same (Godot docs: they must
    match). Never overwrites an existing keystore; returns its SHA-256 certificate fingerprint."""
    jdk = jdk or find_android().get("jdk")
    kt = str(_tool(Path(jdk) / "bin", "keytool") or "keytool") if jdk else "keytool"
    path = Path(path)
    created = False
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run([kt, "-genkeypair", "-v", "-keystore", str(path), "-storepass", password, "-alias", alias,
                            "-keypass", password, "-keyalg", "RSA", "-keysize", "2048", "-validity", str(validity_days),
                            "-dname", dname], capture_output=True, text=True)
        if r.returncode != 0:
            return {"ok": False, "error": r.stderr[-500:]}
        created = True
    lst = subprocess.run([kt, "-list", "-v", "-keystore", str(path), "-storepass", password, "-alias", alias], capture_output=True, text=True).stdout
    m = re.search(r"SHA256:\s*([0-9A-F:]+)", lst)
    return {"ok": bool(m), "path": str(path), "alias": alias, "created": created,
            "sha256": m.group(1).replace(":", "").lower() if m else None}


def _godot_dirs(home: Path) -> tuple[Path, Path]:
    """(config, data) folders Godot uses under a private home; data holds export_templates."""
    if sys.platform == "win32":
        g = home / "AppData" / "Roaming" / "Godot"
        return g, g
    if sys.platform == "darwin":
        g = home / "Library" / "Application Support" / "Godot"
        return g, g
    return home / ".config" / "godot", home / ".local" / "share" / "godot"


def home_env(home) -> dict:
    """Variables that point a Godot child at a private_home: macOS reads HOME, Windows APPDATA and
    LOCALAPPDATA, Linux the XDG folders (set on many machines, so HOME alone is not enough)."""
    h = Path(home)
    if sys.platform == "win32":
        return {"APPDATA": str(h / "AppData" / "Roaming"), "LOCALAPPDATA": str(h / "AppData" / "Local")}
    if sys.platform == "darwin":
        return {"HOME": str(h)}
    return {"HOME": str(h), "XDG_CONFIG_HOME": str(h / ".config"), "XDG_DATA_HOME": str(h / ".local" / "share"),
            "XDG_CACHE_HOME": str(h / ".cache")}


def private_home(root) -> Path:
    """A home for Godot export runs that links only the real export templates. Run Godot with
    home_env(root): it then creates its own editor settings there, taking JAVA_HOME and ANDROID_HOME
    as the Android path defaults (verified 4.7.2), so the user's editor_settings-4.7.tres is never
    touched. On Windows the link is a junction, which needs no symlink privilege."""
    root = Path(root).resolve()
    config, data = _godot_dirs(root)
    config.mkdir(parents=True, exist_ok=True)
    data.mkdir(parents=True, exist_ok=True)
    link = data / "export_templates"
    if not os.path.lexists(link):
        if sys.platform == "win32":
            subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(gd_env.TEMPLATES_ROOT)], check=True, capture_output=True)
        else:
            link.symlink_to(gd_env.TEMPLATES_ROOT)
    return root


def set_private_editor_setting(home, key: str, value: str) -> bool:
    """Write one editor setting in a PRIVATE home's editor_settings-4.7.tres (never the user's real
    home: refuses Path.home()). Needed because JAVA_HOME / ANDROID_HOME only seed the Android paths
    when that file is first created: a private home first used for a macOS or web export keeps
    java_sdk_path="" and fails the Android export (observed 4.7.2)."""
    home = Path(home).resolve()
    if home == Path.home().resolve():
        raise ValueError("refusing to edit the user's real editor settings")
    f = _godot_dirs(home)[0] / "editor_settings-4.7.tres"
    if not f.exists():
        return False
    lines = f.read_text().splitlines()
    lit = json.dumps(value)
    for i, ln in enumerate(lines):
        if ln.split(" = ", 1)[0] == key:
            lines[i] = f"{key} = {lit}"
            break
    else:
        lines.append(f"{key} = {lit}")
    f.write_text("\n".join(lines) + "\n")
    return True


@contextlib.contextmanager
def export_env(**env):
    """Temporarily set environment variables for the Godot child process of one gd_run call."""
    old = {k: os.environ.get(k) for k in env}
    os.environ.update({k: str(v) for k, v in env.items() if v is not None})
    try:
        yield
    finally:
        for k, v in old.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def export_android(project, preset: str, out, debug: bool = True, keystore: dict | None = None, home=None,
                   android: dict | None = None, timeout: float = 1200) -> dict:
    """APK/AAB export with credentials only in env vars (GODOT_ANDROID_KEYSTORE_{DEBUG,RELEASE}_{PATH,USER,PASSWORD}).
    keystore: {"path", "alias", "password"}; home: private_home() folder (recommended)."""
    android = android or find_android()
    if not android.get("ok"):
        return {"ok": False, "error": "; ".join(android["problems"]), "android": android}
    kind = "DEBUG" if debug else "RELEASE"
    env = {"JAVA_HOME": android["jdk"], "ANDROID_HOME": android["sdk"]}
    if home:
        env.update(home_env(home))
        set_private_editor_setting(home, "export/android/java_sdk_path", android["jdk"])
        set_private_editor_setting(home, "export/android/android_sdk_path", android["sdk"])
    if keystore:
        env.update({f"GODOT_ANDROID_KEYSTORE_{kind}_PATH": keystore["path"], f"GODOT_ANDROID_KEYSTORE_{kind}_USER": keystore["alias"],
                    f"GODOT_ANDROID_KEYSTORE_{kind}_PASSWORD": keystore["password"]})
    with export_env(**env):
        r = gd_run.export(project, preset, out, release=not debug, timeout=timeout)
    r.pop("log", None)
    if r.get("ok") and str(out).endswith(".apk"):
        r["apk"] = verify_apk(out, android)
    return r


def verify_apk(apk, android: dict | None = None) -> dict:
    """apksigner verify --print-certs and aapt2 dump badging: signer, schemes, package, versions,
    min/target SDK, ABIs, plus the biggest entries (zip_listing)."""
    android = android or find_android()
    bt = Path(android["build_tools"])
    env = dict(os.environ, JAVA_HOME=android["jdk"], PATH=str(Path(android["jdk"]) / "bin") + os.pathsep + os.environ.get("PATH", ""))
    v = subprocess.run([str(_tool(bt, "apksigner")), "verify", "--print-certs", "-v", str(apk)], capture_output=True, text=True, env=env)
    b = subprocess.run([str(_tool(bt, "aapt2")), "dump", "badging", str(apk)], capture_output=True, text=True).stdout
    g = lambda pat: (re.search(pat, b) or [None, None])[1]  # noqa: E731
    out = {
        "verifies": v.returncode == 0 and "Verifies" in v.stdout,
        "schemes": re.findall(r"Verified using (v[\d.]+) scheme.*?: true", v.stdout),
        "signer_dn": (re.search(r"certificate DN: (.+)", v.stdout) or [None, None])[1],
        "signer_sha256": (re.search(r"certificate SHA-256 digest: ([0-9a-f]+)", v.stdout) or [None, None])[1],
        "package": g(r"package: name='([^']+)'"), "version_code": g(r"versionCode='([^']+)'"),
        "version_name": g(r"versionName='([^']*)'"), "min_sdk": g(r"minSdkVersion:'(\d+)'") or g(r"sdkVersion:'(\d+)'"),
        "target_sdk": g(r"targetSdkVersion:'(\d+)'"), "abis": re.findall(r"'([^']+)'", g(r"native-code: (.+)") or ""),
        "permissions": re.findall(r"uses-permission: name='([^']+)'", b), "debuggable": "application-debuggable" in b,
        "bytes": Path(apk).stat().st_size,
    }
    out["contents"] = zip_listing(apk, top=8)
    out["ok"] = out["verifies"] and bool(out["package"])
    return out


# ---------------------------------------------------------------- macOS and iOS

def _run(cmd, timeout=120, env=None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)


def verify_macos(zip_path, workdir) -> dict:
    """Unzip with ditto (keeps permissions and signatures), then Info.plist, lipo archs, codesign and
    Gatekeeper (spctl). An ad-hoc signed export is expected to be REJECTED by spctl: that is the state
    notarization fixes (Artium Nihamkin, _n9l15CANag)."""
    workdir = Path(workdir)
    if workdir.exists():
        shutil.move(str(workdir), str(workdir) + f"_old_{int(time.time())}")
    workdir.mkdir(parents=True)
    _run(["ditto", "-x", "-k", str(zip_path), str(workdir)])
    apps = list(workdir.glob("*.app"))
    if not apps:
        return {"ok": False, "error": "no .app in zip"}
    app = apps[0]
    info = plistlib.loads((app / "Contents" / "Info.plist").read_bytes())
    exe = app / "Contents" / "MacOS" / info.get("CFBundleExecutable", "")
    cs = _run(["codesign", "-dv", "--verbose=2", str(app)])
    ver = _run(["codesign", "--verify", "--deep", "--strict", str(app)])
    sp = _run(["spctl", "-a", "-vvv", "-t", "exec", str(app)])
    ent = _run(["codesign", "-d", "--entitlements", "-", "--xml", str(app)])
    ents = {}
    try:
        i = ent.stdout.find("<?xml")
        ents = plistlib.loads(ent.stdout[i:].encode()) if i >= 0 else {}
    except Exception:
        pass
    pcks = list((app / "Contents" / "Resources").glob("*.pck"))
    out = {
        "app": str(app), "bundle_id": info.get("CFBundleIdentifier"), "version": info.get("CFBundleShortVersionString"),
        "min_macos": info.get("LSMinimumSystemVersion") or info.get("LSMinimumSystemVersionByArchitecture"), "executable": str(exe),
        "archs": _run(["lipo", "-archs", str(exe)]).stdout.split(), "exec_bit": os.access(exe, os.X_OK),
        "signature": "adhoc" if "Signature=adhoc" in cs.stderr else ("developer_id" if "Developer ID Application" in cs.stderr else "none/other"),
        "codesign_verify_ok": ver.returncode == 0, "codesign_verify_msg": (ver.stderr or ver.stdout).strip()[-300:],
        "gatekeeper_accepted": sp.returncode == 0, "gatekeeper_msg": (sp.stderr or sp.stdout).strip()[-300:],
        "entitlements": ents, "debugging_entitlement": bool(ents.get("com.apple.security.get-task-allow")),
        "pck_bytes": pcks[0].stat().st_size if pcks else 0, "exe_bytes": exe.stat().st_size if exe.exists() else 0,
        "zip_bytes": Path(zip_path).stat().st_size,
    }
    out["ok"] = bool(out["bundle_id"]) and out["exec_bit"] and out["codesign_verify_ok"]
    return out


def run_exported(binary, args=(), timeout: float = 120, home=None) -> dict:
    """Run an exported desktop build (e.g. --headless -- --perf-log --perf-seconds 3 --perf-quit) and
    parse SHIP_BOOT / PERF_SUMMARY lines. home: a private_home so user:// lands in the test folder."""
    env = dict(os.environ)
    if home:
        env.update(home_env(home))
    t0 = time.time()
    try:
        r = subprocess.run([str(binary), *args], capture_output=True, text=True, timeout=timeout, env=env, stdin=subprocess.DEVNULL)
        text, code, to = (r.stdout or "") + (r.stderr or ""), r.returncode, False
    except subprocess.TimeoutExpired as e:
        text, code, to = (e.stdout or b"").decode() if isinstance(e.stdout, bytes) else (e.stdout or ""), None, True
    lines = {}
    for tag in ("SHIP_BOOT", "PERF_SUMMARY", "DLC"):
        for ln in text.splitlines():
            if ln.startswith(tag + " "):
                try:
                    lines.setdefault(tag, []).append(json.loads(ln[len(tag) + 1:]))
                except json.JSONDecodeError:
                    lines.setdefault(tag, []).append(ln[len(tag) + 1:])
    errs = [ln for ln in text.splitlines() if ln.startswith(("ERROR", "SCRIPT ERROR"))]
    return {"ok": code == 0 and not to and "SHIP_BOOT" in lines, "exit_code": code, "timed_out": to, "seconds": round(time.time() - t0, 2),
            "lines": lines, "errors": errs[:20], "log_tail": text[-3000:]}


def verify_xcode_project(folder) -> dict:
    """Check an iOS export made with application/export_project_only=true."""
    folder = Path(folder)
    projs = list(folder.glob("*.xcodeproj"))
    if not projs:
        return {"ok": False, "error": "no .xcodeproj"}
    proj = projs[0]
    pbx = (proj / "project.pbxproj").read_text(errors="ignore")
    name = proj.stem
    plist_path = folder / name / f"{name}-Info.plist"
    info = plistlib.loads(plist_path.read_bytes()) if plist_path.exists() else {}
    lst = _run(["xcodebuild", "-list", "-project", str(proj)], timeout=120)
    schemes = re.findall(r"^\s{8}(\S.*)$", lst.stdout.split("Schemes:")[-1], re.M) if "Schemes:" in lst.stdout else []
    pcks = list(folder.glob("*.pck"))
    out = {"xcodeproj": str(proj), "bundle_ids": sorted(set(re.findall(r"PRODUCT_BUNDLE_IDENTIFIER = \"?([^\";]+)", pbx))),
           "teams": sorted(set(re.findall(r"DEVELOPMENT_TEAM = \"?([^\";]+)", pbx))), "info_plist": bool(info),
           "short_version": info.get("CFBundleShortVersionString"), "min_ios": info.get("MinimumOSVersion"),
           "schemes": schemes, "pck_bytes": pcks[0].stat().st_size if pcks else 0,
           "xcframeworks": sorted(p.name for p in folder.glob("*.xcframework"))}
    out["ok"] = bool(out["bundle_ids"]) and bool(schemes) and out["pck_bytes"] > 0
    return out


def xcode_build(folder, scheme: str | None = None, timeout: float = 1800, derived=None) -> dict:
    """Unsigned device build (CODE_SIGNING_ALLOWED=NO, generic iOS destination): proves the exported
    project compiles and links. Reports ran=False with the reason when the iOS platform component is
    missing from Xcode (Xcode > Settings > Components)."""
    folder = Path(folder)
    proj = next(folder.glob("*.xcodeproj"))
    scheme = scheme or proj.stem
    derived = derived or folder.parent / (folder.name + "_dd")
    cmd = ["xcodebuild", "-project", str(proj), "-scheme", scheme, "-destination", "generic/platform=iOS", "-configuration", "Debug",
           "-derivedDataPath", str(derived), "CODE_SIGNING_ALLOWED=NO", "CODE_SIGNING_REQUIRED=NO", "build"]
    t0 = time.time()
    r = _run(cmd, timeout=timeout)
    text = r.stdout + r.stderr
    missing = re.search(r"(iOS [\d.]+ is not installed[^}]*)", text)
    out = {"cmd": " ".join(cmd), "exit_code": r.returncode, "seconds": round(time.time() - t0, 1),
           "succeeded": "BUILD SUCCEEDED" in text, "errors": re.findall(r"error: (.+)", text)[:10]}
    if missing:
        out.update(ran=False, reason=missing.group(1).split(",")[0].strip())
    else:
        out["ran"] = True
    out["ok"] = out["succeeded"]
    return out


def notarize_plan(zip_path, app_path, profile: str = "godot-notary") -> list[str]:
    """The Developer ID path, as commands for a human with an Apple account (NOT run by the skill)."""
    return [
        f'xcrun notarytool store-credentials "{profile}" --apple-id <apple-id> --team-id <TEAMID>   # once, prompts for the app-specific password',
        f'xcrun notarytool submit "{zip_path}" --keychain-profile "{profile}" --wait',
        f'xcrun notarytool log <submission-id> --keychain-profile "{profile}"   # when status is Invalid',
        f'xcrun stapler staple "{app_path}"',
        f'spctl -a -vvv -t exec "{app_path}"   # expect: accepted, source=Notarized Developer ID',
        f'xcrun stapler validate "{app_path}"',
    ]


def steam_vdf(app_id: int, depots: dict, out_dir, desc: str = "", set_live: str = "") -> dict:
    """Write SteamPipe app_build and depot_build VDFs for steamcmd (+run_app_build). depots: {depot_id: content_dir}.
    set_live: a beta branch name, never "default" for a released game (BluePhoenix: test branch first)."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    depot_lines = "\n".join(f'\t\t"{d}" "depot_build_{d}.vdf"' for d in depots)
    app = (f'"AppBuild"\n{{\n\t"AppID" "{app_id}"\n\t"Desc" "{desc}"\n\t"BuildOutput" "{(out_dir / "output").as_posix()}"\n'
           f'\t"ContentRoot" ""\n\t"SetLive" "{set_live}"\n\t"Depots"\n\t{{\n{depot_lines}\n\t}}\n}}\n')
    paths = {"app": out_dir / f"app_build_{app_id}.vdf"}
    paths["app"].write_text(app)
    for d, content in depots.items():
        p = out_dir / f"depot_build_{d}.vdf"
        p.write_text(f'"DepotBuild"\n{{\n\t"DepotID" "{d}"\n\t"ContentRoot" "{Path(content).as_posix()}"\n'
                     f'\t"FileMapping"\n\t{{\n\t\t"LocalPath" "*"\n\t\t"DepotPath" "."\n\t\t"Recursive" "1"\n\t}}\n}}\n')
        paths[str(d)] = p
    cmd = f'steamcmd +login <builder-account> +run_app_build "{paths["app"]}" +quit'
    return {"ok": True, "files": {k: str(v) for k, v in paths.items()}, "command": cmd}


if __name__ == "__main__":
    print(json.dumps({"android": find_android(), "lead": str(LEAD)}, indent=2))
