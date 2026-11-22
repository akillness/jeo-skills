"""
ue_env: find the Unreal Engine install and the project, and check the Mac before any job.

STATUS: not yet run in Unreal. Written 2026-09-24 before UE 5.8 was installed on this Mac.
The pure-Python parts (path search, Build.version and .uproject parsing, Xcode window,
plugin edits with backup) ran offline in tests/code/unreal-expert/test_ue_env_offline.py.

Library (agent side, system python3; also importable inside the editor):
  import ue_env
  eng = ue_env.find_engine()          # dict or None: root, version, editor, editor_cmd, uat...
  prj = ue_env.find_project("/abs/MyGame")   # dict or None: uproject, root, plugins, flags
  ue_env.preflight()                  # macOS, chip, RAM, Xcode, verdict lines
  ue_env.plan_plugins(prj["uproject"], ["ModelContextProtocol", "AllToolsets"])
  ue_env.enable_plugins(prj["uproject"], [...])   # writes, after a timestamped backup copy

Shell:
  python3 ue_env.py --find            # engine paths as JSON (exit 5 if none)
  python3 ue_env.py --project PATH    # project facts as JSON
  python3 ue_env.py --preflight       # Mac and toolchain checks as JSON

Engine search order: $UE_ROOT (engine root, or its Engine/ folder), then the newest
/Users/Shared/Epic Games/UE_5.* (Launcher default on macOS [added, verify]), then
~/Epic Games/UE_5.*, then Linux and Windows defaults so the module stays portable.

Mac binaries (verify on the installed build, listed in the facts-to-verify checklist):
  editor      Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor
  editor_cmd  Engine/Binaries/Mac/UnrealEditor-Cmd if it exists, else the editor binary:
              the 5.8 release-notes batch example runs `UnrealEditor ... -run=...`, so the
              plain binary with -run= is a commandlet too. `editor_cmd_is_fallback` says which.
  uat         Engine/Build/BatchFiles/RunUAT.sh
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import glob
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time

# Epic, macOS development requirements for 5.8: Xcode 26.0 minimum, 26.1.1 recommended,
# "Xcode 26.4 is not compatible". The 5.8 release notes' SDK table disagrees (Xcode 15.x for
# macOS hosts), see unreal-version-deltas.md, Conflicts item 1. Versions above 26.4 are not
# listed either way: reported as "unlisted", never as fine.
XCODE_MIN = (26, 0)
XCODE_RECOMMENDED = (26, 1, 1)
XCODE_INCOMPATIBLE = (26, 4)
MACOS_MIN = (14, 5)
RAM_MIN_GB = 16
RAM_RECOMMENDED_GB = 32


# --------------------------------------------------------------------------- versions
def parse_version(text):
    """'26.1.1' or 'Xcode 26.1.1' -> (26, 1, 1); None when no number is found."""
    if text is None:
        return None
    m = re.search(r"(\d+)(?:\.(\d+))?(?:\.(\d+))?", str(text))
    if not m:
        return None
    return tuple(int(g) for g in m.groups() if g is not None)


def _vcmp(a, b):
    """Compare version tuples of different lengths (missing parts are 0)."""
    n = max(len(a), len(b))
    a = tuple(a) + (0,) * (n - len(a))
    b = tuple(b) + (0,) * (n - len(b))
    return (a > b) - (a < b)


def xcode_status(version):
    """Classify an Xcode version against Epic's 5.8 macOS page.

    Returns one of: 'missing', 'too_old', 'recommended', 'supported', 'incompatible',
    'unlisted' (newer than 26.4: not named by Epic, treat as [verify])."""
    if not version:
        return "missing"
    if _vcmp(version, XCODE_MIN) < 0:
        return "too_old"
    if _vcmp(version, XCODE_INCOMPATIBLE) >= 0:
        if version[:2] == XCODE_INCOMPATIBLE[:2]:
            return "incompatible"
        return "unlisted"
    if _vcmp(version, XCODE_RECOMMENDED) == 0:
        return "recommended"
    return "supported"


def read_build_version(engine_root):
    """Engine/Build/Build.version (JSON) -> dict with major, minor, patch, changelist,
    branch and a 'version' string such as '5.8.3'; None if the file is missing."""
    p = os.path.join(engine_root, "Engine", "Build", "Build.version")
    if not os.path.isfile(p):
        return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
    except (OSError, ValueError):
        return None
    out = {
        "major": d.get("MajorVersion"), "minor": d.get("MinorVersion"),
        "patch": d.get("PatchVersion"), "changelist": d.get("Changelist"),
        "compatible_changelist": d.get("CompatibleChangelist"),
        "branch": d.get("BranchName"),
    }
    parts = [out["major"], out["minor"], out["patch"]]
    out["version"] = ".".join(str(x) for x in parts if x is not None)
    return out


# --------------------------------------------------------------------------- engine
def _engine_root_from(path):
    """Accept an engine root or its Engine/ folder; return the root or None."""
    if not path:
        return None
    path = os.path.abspath(os.path.expanduser(path))
    if os.path.isdir(os.path.join(path, "Engine")):
        return path
    if os.path.basename(path.rstrip("/")) == "Engine" and os.path.isdir(path):
        return os.path.dirname(path.rstrip("/"))
    return None


def _root_version_key(root):
    m = re.search(r"UE_(\d+)\.(\d+)(?:\.(\d+))?", root)
    return tuple(int(g or 0) for g in m.groups()) if m else (0, 0, 0)


def candidate_roots(version=None, home=None):
    """Engine roots to try, best first. `version` ('5.8') filters the glob search."""
    home = home or os.path.expanduser("~")
    roots = []
    env = _engine_root_from(os.environ.get("UE_ROOT"))
    if env:
        roots.append(env)
    patterns = [
        "/Users/Shared/Epic Games/UE_5.*",
        os.path.join(home, "Epic Games", "UE_5.*"),
        "/opt/UnrealEngine/UE_5.*",
        os.path.join(home, "UnrealEngine", "UE_5.*"),
        "C:/Program Files/Epic Games/UE_5.*",
    ]
    found = []
    for pat in patterns:
        found += [p for p in glob.glob(pat) if os.path.isdir(p)]
    if version:
        found = [p for p in found if ("UE_%s" % version) in p]
    found.sort(key=_root_version_key, reverse=True)
    for p in found:
        if p not in roots:
            roots.append(p)
    return roots


def engine_paths(root, system=None):
    """Binary paths for an engine root (no existence check except for the -Cmd fallback)."""
    system = system or platform.system()
    b = os.path.join(root, "Engine", "Binaries")
    if system == "Darwin":
        editor = os.path.join(b, "Mac", "UnrealEditor.app", "Contents", "MacOS", "UnrealEditor")
        cmd_candidates = [os.path.join(b, "Mac", "UnrealEditor-Cmd"),
                          os.path.join(b, "Mac", "UnrealEditor.app", "Contents", "MacOS",
                                       "UnrealEditor-Cmd")]
        uat = os.path.join(root, "Engine", "Build", "BatchFiles", "RunUAT.sh")
        insights = os.path.join(b, "Mac", "UnrealInsights.app", "Contents", "MacOS",
                                "UnrealInsights")
        trace_query = os.path.join(b, "Mac", "TraceQuery")
    elif system == "Windows":
        editor = os.path.join(b, "Win64", "UnrealEditor.exe")
        cmd_candidates = [os.path.join(b, "Win64", "UnrealEditor-Cmd.exe")]
        uat = os.path.join(root, "Engine", "Build", "BatchFiles", "RunUAT.bat")
        insights = os.path.join(b, "Win64", "UnrealInsights.exe")
        trace_query = os.path.join(b, "Win64", "TraceQuery.exe")
    else:
        editor = os.path.join(b, "Linux", "UnrealEditor")
        cmd_candidates = [os.path.join(b, "Linux", "UnrealEditor-Cmd")]
        uat = os.path.join(root, "Engine", "Build", "BatchFiles", "RunUAT.sh")
        insights = os.path.join(b, "Linux", "UnrealInsights")
        trace_query = os.path.join(b, "Linux", "TraceQuery")
    editor_cmd, fallback = None, True
    for c in cmd_candidates:
        if os.path.isfile(c):
            editor_cmd, fallback = c, False
            break
    if editor_cmd is None:
        editor_cmd = editor
    return {
        "root": root, "editor": editor, "editor_cmd": editor_cmd,
        "editor_cmd_is_fallback": fallback, "uat": uat,
        # TraceQuery is a UBT program added in 5.8; the binary location is [verify].
        "insights": insights, "trace_query": trace_query,
        "python_plugin": os.path.join(root, "Engine", "Plugins", "Experimental",
                                      "PythonScriptPlugin"),
    }


def find_engine(version=None, system=None):
    """Return a dict describing the newest usable engine, or None.

    Keys: root, version (dict from Build.version or None), editor, editor_cmd,
    editor_cmd_is_fallback, uat, insights, trace_query, python_plugin, exists (dict of
    booleans per binary). A root counts as usable when its editor binary exists."""
    for root in candidate_roots(version):
        paths = engine_paths(root, system)
        if not os.path.isfile(paths["editor"]):
            continue
        paths["version"] = read_build_version(root)
        paths["exists"] = {k: os.path.exists(paths[k]) for k in
                           ("editor", "editor_cmd", "uat", "insights", "trace_query",
                            "python_plugin")}
        return paths
    return None


# --------------------------------------------------------------------------- project
def _is_ascii(s):
    try:
        s.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False


def read_uproject(path):
    """Parse a .uproject (JSON). Returns the dict, raises ValueError on bad JSON."""
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def find_project(path):
    """Resolve a .uproject from a file, its folder, or any folder inside the project.

    Returns None or a dict: uproject, root, name, engine_association, plugins (name ->
    enabled), has_code (Modules or a Source/ folder), path_has_spaces, path_is_ascii,
    config (DefaultEngine.ini path or None). Allar's style guide advises no spaces in the
    project path; this project's own folders have spaces, so the flag matters."""
    if not path:
        return None
    p = os.path.abspath(os.path.expanduser(path))
    if os.path.isfile(p) and p.lower().endswith(".uproject"):
        up = p
    else:
        up = None
        d = p if os.path.isdir(p) else os.path.dirname(p)
        while d and d != os.path.dirname(d):
            hits = sorted(glob.glob(os.path.join(glob.escape(d), "*.uproject")))
            if hits:
                up = hits[0]
                break
            d = os.path.dirname(d)
        if up is None:
            return None
    root = os.path.dirname(up)
    try:
        data = read_uproject(up)
    except (OSError, ValueError) as e:
        return {"uproject": up, "root": root, "error": "cannot parse .uproject: %s" % e}
    plugins = {}
    for entry in data.get("Plugins", []) or []:
        if isinstance(entry, dict) and entry.get("Name"):
            plugins[entry["Name"]] = bool(entry.get("Enabled", False))
    cfg = os.path.join(root, "Config", "DefaultEngine.ini")
    return {
        "uproject": up, "root": root,
        "name": os.path.splitext(os.path.basename(up))[0],
        "engine_association": data.get("EngineAssociation"),
        "plugins": plugins,
        "has_code": bool(data.get("Modules")) or os.path.isdir(os.path.join(root, "Source")),
        "path_has_spaces": " " in up,
        "path_is_ascii": _is_ascii(up),
        "config": cfg if os.path.isfile(cfg) else None,
    }


def plan_plugins(uproject, names, enabled=True):
    """Return (new_data, changes) for enabling (or disabling) plugins, without writing.

    `changes` lists (name, before, after) where before is None when the entry is new.
    Plugin names are .uplugin identifiers, for example ModelContextProtocol for Unreal
    MCP; the toolset plugin identifiers are [verify] on the installed engine."""
    data = read_uproject(uproject)
    plugins = data.setdefault("Plugins", [])
    changes = []
    for name in names:
        entry = next((e for e in plugins if isinstance(e, dict) and e.get("Name") == name), None)
        if entry is None:
            plugins.append({"Name": name, "Enabled": bool(enabled)})
            changes.append((name, None, bool(enabled)))
        elif bool(entry.get("Enabled", False)) != bool(enabled):
            changes.append((name, bool(entry.get("Enabled", False)), bool(enabled)))
            entry["Enabled"] = bool(enabled)
    return data, changes


def enable_plugins(uproject, names, enabled=True, backup_dir=None):
    """Enable plugins in a .uproject after copying the file to a timestamped backup.

    Never deletes: the previous file goes to `backup_dir` (default <project>/Saved/
    AgentBackups/) as <Name>.uproject.<YYYYmmdd-HHMMSS>.bak. The editor must restart to
    load newly enabled plugins. Returns {"changes": [...], "backup": path or None}."""
    data, changes = plan_plugins(uproject, names, enabled)
    if not changes:
        return {"changes": [], "backup": None}
    root = os.path.dirname(uproject)
    backup_dir = backup_dir or os.path.join(root, "Saved", "AgentBackups")
    os.makedirs(backup_dir, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(backup_dir, "%s.%s.bak" % (os.path.basename(uproject), stamp))
    n = 1
    while os.path.exists(backup):
        backup = os.path.join(backup_dir, "%s.%s-%d.bak" % (os.path.basename(uproject), stamp, n))
        n += 1
    shutil.copy2(uproject, backup)
    tmp = uproject + ".agent-tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent="\t")
        f.write("\n")
    os.replace(tmp, uproject)
    return {"changes": changes, "backup": backup}


def read_ini_value(ini_path, section, key):
    """Read one key from an Unreal ini (last assignment wins; +Key and -Key lines ignored).

    Enough for checks such as r.Substrate or r.DynamicGlobalIlluminationMethod under
    [/Script/Engine.RendererSettings]; not a full ini merger (no Base/Default layering)."""
    if not ini_path or not os.path.isfile(ini_path):
        return None
    cur, val = None, None
    with open(ini_path, "r", encoding="utf-8-sig", errors="replace") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith(";"):
                continue
            if line.startswith("[") and line.endswith("]"):
                cur = line[1:-1]
                continue
            if cur == section and "=" in line and line[0] not in "+-.!":
                k, v = line.split("=", 1)
                if k.strip() == key:
                    val = v.strip()
    return val


# --------------------------------------------------------------------------- Mac checks
def _run(cmd, timeout=20):
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return (out.stdout or "") + (out.stderr or "")
    except (OSError, subprocess.SubprocessError):
        return ""


def preflight(run=None):
    """Mac and toolchain checks before any Unreal job. `run` is injectable for tests.

    Returns {"macos", "chip", "ram_gb", "xcode", "xcode_status", "lines"} where lines are
    'error:', 'warn:' or 'info:' strings. Thresholds: Epic's macOS page for 5.8 (macOS
    Sonoma 14.5 minimum, 16 GB minimum and 32 GB recommended, Apple Silicon M2+ for Nanite,
    VSM, Lumen HWRT and MegaLights)."""
    run = run or _run
    info = {"lines": []}
    L = info["lines"]
    if platform.system() != "Darwin" and run is _run:
        L.append("info: not macOS; Mac checks skipped")
        return info
    info["macos"] = run(["sw_vers", "-productVersion"]).strip() or None
    info["chip"] = run(["sysctl", "-n", "machdep.cpu.brand_string"]).strip() or None
    mem = run(["sysctl", "-n", "hw.memsize"]).strip()
    info["ram_gb"] = round(int(mem) / 2 ** 30, 1) if mem.isdigit() else None
    xc = run(["xcodebuild", "-version"])
    info["xcode"] = parse_version(xc.split("\n")[0]) if "Xcode" in xc else None
    info["xcode_status"] = xcode_status(info["xcode"])
    mv = parse_version(info["macos"])
    if mv and _vcmp(mv, MACOS_MIN) < 0:
        L.append("error: macOS %s is below the 5.8 minimum 14.5" % info["macos"])
    chip = info["chip"] or ""
    if "Apple" not in chip:
        L.append("error: 5.8 renders on Apple Silicon only (Intel rendering removed): %s" % chip)
    elif re.search(r"\bM1\b", chip):
        L.append("warn: M1: Nanite, VSM, Lumen HWRT and MegaLights need M2 or newer; judge "
                 "those looks on another machine")
    if info["ram_gb"] is not None and info["ram_gb"] < RAM_MIN_GB:
        L.append("warn: %s GB RAM is below Epic's 16 GB minimum" % info["ram_gb"])
    st = info["xcode_status"]
    if st == "missing":
        L.append("info: no full Xcode: Blueprint-only projects work, C++ and code plugins do not")
    elif st in ("too_old", "incompatible"):
        L.append("error: Xcode %s is %s for 5.8 (Epic: 26.0 min, 26.1.1 recommended, 26.4 "
                 "not compatible)" % (".".join(map(str, info["xcode"])), st.replace("_", " ")))
    elif st == "unlisted":
        L.append("warn: Xcode %s is newer than any version Epic lists for 5.8: verify a C++ "
                 "build before relying on it" % ".".join(map(str, info["xcode"])))
    return info


def _main(argv):
    if "--find" in argv:
        eng = find_engine()
        print(json.dumps(eng, indent=2))
        return 0 if eng else 5
    if "--project" in argv:
        i = argv.index("--project")
        prj = find_project(argv[i + 1] if i + 1 < len(argv) else ".")
        print(json.dumps(prj, indent=2))
        return 0 if prj else 5
    if "--preflight" in argv:
        print(json.dumps(preflight(), indent=2))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
