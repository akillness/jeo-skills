"""
ut_env: find the Unity editor and project, check the license, make or clone projects, install
the C# AgentKit, and apply the lock rule (never batch a project an editor has open).

Shared toolkit of the scenario-unity-* skills (lead: scenario-unity-expert). System python3, 3.9+, stdlib only.
Run in Unity 6000.3.21f1 on macOS 26.5.1 (Apple Silicon) on 2026-09-24:
tests/code/unity-expert/test_offline.py and test_live_toolkit.py.

    import sys; sys.path.insert(0, "<scenario-unity-expert skill>/scripts")
    import ut_env
    ed = ut_env.find_editor()                 # {"version", "app", "binary", "playback_engines", ...}
    ut_env.license_ok()                       # {"ok": True, "update_date": "2026-10-24T...", ...}
    p = ut_env.base_project("3d", "/abs/tests/projects/my-skill")   # APFS clone of Base3D_URP
    ut_env.install_agentkit(p)                # copies scripts/AgentKit -> Assets/Editor/AgentKit
    ut_env.project_lock(p)                    # {"locked": False, "pids": [], ...}
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24)

import datetime
import fcntl
import glob
import json
import os
import re
import subprocess
import time

DEFAULT_VERSION = "6000.3.21f1"
HUB_EDITORS = "/Applications/Unity/Hub/Editor"
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AGENTKIT_SRC = os.path.join(SKILL_DIR, "scripts", "AgentKit")
# <project root>/skills/scenario-unity-expert -> <project root>
PROJECT_ROOT = os.path.dirname(os.path.dirname(SKILL_DIR))
BASE_PROJECTS = {
    "3d": os.path.join(PROJECT_ROOT, "tests", "projects", "Base3D_URP"),
    "2d": os.path.join(PROJECT_ROOT, "tests", "projects", "Base2D_URP"),
}
TEMPLATES = {  # ids -> tarball names bundled with 6000.3.21f1 (file names differ from ids)
    "3d": "com.unity.template.3d-cross-platform",    # com.unity.template.urp-blank, "Universal 3D"
    "2d": "com.unity.template.2d-cross-platform-2d",  # com.unity.template.universal-2d
    "hdrp": "com.unity.template.3d-high-end",         # com.unity.template.hdrp-blank
}
LICENSE_FILE = os.path.expanduser("~/Library/Unity/licenses/UnityEntitlementLicense.xml")
SERIAL_LICENSE_FILE = "/Library/Application Support/Unity/Unity_lic.ulf"


class ProjectLockedError(RuntimeError):
    """Raised when a batch job targets a project that a running editor holds open."""


# ============================================================================ editor
def find_editor(version=DEFAULT_VERSION):
    """Locate an installed editor. UNITY_EDITOR env var (path to the Unity binary) overrides.

    Returns {"version", "app", "binary", "contents", "playback_engines", "templates",
    "yaml_merge"}. Raises FileNotFoundError with the installed versions when missing."""
    env = os.environ.get("UNITY_EDITOR")
    if env and os.path.isfile(env):
        binary = env
        app = binary.split("/Contents/")[0] if "/Contents/" in binary else os.path.dirname(binary)
        version = version or os.path.basename(os.path.dirname(app))
    else:
        app = os.path.join(HUB_EDITORS, version, "Unity.app")
        binary = os.path.join(app, "Contents", "MacOS", "Unity")
        if not os.path.isfile(binary):
            have = sorted(os.listdir(HUB_EDITORS)) if os.path.isdir(HUB_EDITORS) else []
            raise FileNotFoundError("Unity %s not found at %s; installed: %s" % (version, binary, have))
    contents = os.path.join(app, "Contents")
    # macOS support is inside the .app; Hub-installed modules (WebGLSupport, iOSSupport,
    # AndroidPlayer) sit next to it in <version>/PlaybackEngines (observed 2026-09-24)
    engines = []
    for pe in (os.path.join(contents, "PlaybackEngines"), os.path.join(os.path.dirname(app), "PlaybackEngines")):
        if os.path.isdir(pe):
            engines += [e for e in os.listdir(pe) if not e.startswith(".")]
    engines = sorted(set(engines))
    tdir = os.path.join(contents, "Resources", "PackageManager", "ProjectTemplates")
    return {
        "version": version,
        "app": app,
        "binary": binary,
        "contents": contents,
        "playback_engines": engines,  # MacStandaloneSupport is built in; WebGLSupport, iOSSupport, AndroidPlayer
        "templates": sorted(glob.glob(os.path.join(tdir, "*.tgz"))),
        "yaml_merge": os.path.join(contents, "Helpers", "UnityYAMLMerge"),
    }


def license_ok(now=None):
    """Personal named-user license check without launching Unity (no secret is read or copied).

    A Personal license must go online every 30 days: the file's UpdateDate is the end of the
    offline window (observed: issued 2026-08-12, UpdateDate 2026-09-11, batch mode refused on
    2026-09-24 with LicenseGroupOfflineValidityPeriodIsExpired). Fix: sign in to Unity Hub.
    Returns {"ok", "kind", "update_date", "days_left", "file", "reason"}."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    if os.path.isfile(LICENSE_FILE):
        with open(LICENSE_FILE, "r", errors="replace") as f:
            txt = f.read()
        m = re.search(r"<UpdateDate>([^<]+)</UpdateDate>", txt) or re.search(r'UpdateDate\s+Value="([^"]+)"', txt)
        if not m:
            return {"ok": None, "kind": "named-user", "file": LICENSE_FILE, "update_date": None,
                    "days_left": None, "reason": "no UpdateDate in the license file"}
        raw = m.group(1).replace("Z", "+00:00")
        raw = re.sub(r"\.(\d{6})\d+", r".\1", raw)
        try:
            upd = datetime.datetime.fromisoformat(raw)
        except ValueError:
            return {"ok": None, "kind": "named-user", "file": LICENSE_FILE, "update_date": m.group(1),
                    "days_left": None, "reason": "unparsed date"}
        left = (upd - now).total_seconds() / 86400.0
        return {"ok": left > 0, "kind": "named-user", "file": LICENSE_FILE,
                "update_date": m.group(1), "days_left": round(left, 1),
                "reason": None if left > 0 else "offline validity expired: sign in to Unity Hub"}
    if os.path.isfile(SERIAL_LICENSE_FILE):
        return {"ok": True, "kind": "serial", "file": SERIAL_LICENSE_FILE, "update_date": None,
                "days_left": None, "reason": None}
    return {"ok": False, "kind": None, "file": None, "update_date": None, "days_left": None,
            "reason": "no license file: sign in to Unity Hub (Personal) once"}


# ============================================================================ project
def find_project(path):
    """Resolve a Unity project root from any path inside it (walks up to the folder that holds
    Assets/ and ProjectSettings/ProjectVersion.txt). Returns {"root", "version", "name",
    "packages", "render_pipeline_package", "has_agentkit", "path_has_spaces"}."""
    p = os.path.abspath(path)
    while True:
        if os.path.isdir(os.path.join(p, "Assets")) and os.path.isfile(
                os.path.join(p, "ProjectSettings", "ProjectVersion.txt")):
            break
        parent = os.path.dirname(p)
        if parent == p:
            raise FileNotFoundError("no Unity project (Assets + ProjectSettings/ProjectVersion.txt) at or above %s" % path)
        p = parent
    with open(os.path.join(p, "ProjectSettings", "ProjectVersion.txt")) as f:
        ver = re.search(r"m_EditorVersion:\s*(\S+)", f.read())
    pkgs = {}
    man = os.path.join(p, "Packages", "manifest.json")
    if os.path.isfile(man):
        with open(man) as f:
            pkgs = json.load(f).get("dependencies", {})
    rp = [k for k in pkgs if k.startswith("com.unity.render-pipelines.")]
    return {
        "root": p,
        "name": os.path.basename(p),
        "version": ver.group(1) if ver else None,
        "packages": pkgs,
        "render_pipeline_package": rp[0] if rp else None,
        "has_agentkit": os.path.isfile(os.path.join(p, "Assets", "Editor", "AgentKit", "AgentJob.cs")),
        "path_has_spaces": " " in p,
    }


def base_project(kind="3d", dest=None):
    """Clone tests/projects/Base3D_URP or Base2D_URP (already imported, so the first batch run
    takes seconds, not minutes) to dest with `cp -cR` (APFS clone: instant, no extra disk).
    Never opens or edits the base. Idempotent: an existing dest is kept (AgentKit refreshed).
    Installs the AgentKit. Returns the project root. dest: tests/projects/<your skill>/."""
    src = BASE_PROJECTS[kind.lower()]
    if not os.path.isdir(src):
        raise FileNotFoundError(src)
    if dest is None:
        raise ValueError("dest is required (tests/projects/<skill>/)")
    dest = os.path.abspath(dest)
    if not os.path.exists(dest):
        subprocess.run(["cp", "-cR", src, dest], check=True)
        # a clone must not inherit an editor session of the base
        jp = os.path.join(dest, "Temp")
        if os.path.isdir(jp):
            os.rename(jp, jp + ".from-base-%d" % int(time.time()))
    install_agentkit(dest)
    return dest


def new_project(path, template="3d", version=DEFAULT_VERSION, timeout=1800, log=None):
    """Create a project from a template bundled with the editor:
    Unity -batchmode -nographics -quit -createProject <path> -cloneFromTemplate <tgz>.
    Without -cloneFromTemplate, -createProject makes a Built-in pipeline project (observed
    2026-09-24): always pass a URP template. Slow (full import, minutes): prefer base_project()."""
    ed = find_editor(version)
    prefix = TEMPLATES[template.lower()]
    tgz = [t for t in ed["templates"] if os.path.basename(t).startswith(prefix + "-")]
    if not tgz:
        raise FileNotFoundError("template %s not in %s" % (prefix, ed["templates"]))
    path = os.path.abspath(path)
    log = log or path.rstrip("/") + ".create.log"
    cmd = [ed["binary"], "-batchmode", "-nographics", "-quit", "-createProject", path,
           "-cloneFromTemplate", tgz[0], "-logFile", log]
    r = subprocess.run(cmd, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError("createProject exit %d, see %s" % (r.returncode, log))
    install_agentkit(path)
    return path


def install_agentkit(project, src=AGENTKIT_SRC):
    """Copy scripts/AgentKit/*.cs (and domain subfolders) into <project>/Assets/Editor/AgentKit/.
    Existing files are replaced only when their content differs; files present only in the
    project are left alone. Unity compiles the copy on its next start or refresh. No asmdef on
    purpose: AgentKit and domain code compile into Assembly-CSharp-Editor, which sees every
    auto-referenced package (URP, Input System, ...). Returns the list of files written."""
    root = find_project(project)["root"]
    dst = os.path.join(root, "Assets", "Editor", "AgentKit")
    written = []
    for dirpath, _dirs, files in os.walk(src):
        rel = os.path.relpath(dirpath, src)
        out_dir = os.path.normpath(os.path.join(dst, rel))
        for fn in files:
            if not fn.endswith(".cs"):
                continue
            s = os.path.join(dirpath, fn)
            d = os.path.join(out_dir, fn)
            with open(s, "rb") as f:
                data = f.read()
            if os.path.isfile(d):
                with open(d, "rb") as f:
                    if f.read() == data:
                        continue
            os.makedirs(out_dir, exist_ok=True)
            with open(d, "wb") as f:
                f.write(data)
            written.append(os.path.relpath(d, root))
    return written


# ============================================================================ lock rule
def _unity_processes():
    """[(pid, command line)] of running Unity editor processes (GUI or batch)."""
    try:
        out = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True, timeout=10).stdout
    except Exception:
        return []
    procs = []
    for line in out.splitlines():
        line = line.strip()
        if "/Unity.app/Contents/MacOS/Unity" not in line:
            continue
        pid, _, cmd = line.partition(" ")
        try:
            procs.append((int(pid), cmd))
        except ValueError:
            pass
    return procs


def _cmd_project(cmd):
    m = re.search(r"-projectpath\s+(.+?)(?=\s-[A-Za-z]|$)", cmd, re.IGNORECASE)
    if not m:
        m = re.search(r"-createProject\s+(.+?)(?=\s-[A-Za-z]|$)", cmd, re.IGNORECASE)
    return m.group(1).strip().strip('"') if m else None


def editor_processes(project=None):
    """Running Unity editors, optionally only those holding `project`.
    Returns [{"pid", "project", "batch", "quit", "gui", "cmd"}]."""
    root = os.path.realpath(find_project(project)["root"]) if project else None
    res = []
    for pid, cmd in _unity_processes():
        proj = _cmd_project(cmd)
        real = os.path.realpath(proj) if proj else None
        if root and real != root:
            continue
        low = cmd.lower()
        res.append({"pid": pid, "project": real, "batch": "-batchmode" in low, "quit": " -quit" in low,
                    "gui": "-batchmode" not in low, "cmd": cmd[:400]})
    return res


def project_lock(project):
    """The lock rule: "You can't open a project in batch mode while the Editor has the same project
    open" (6.3 Manual, -batchmode). Evidence, strongest first: a running Unity process whose
    -projectPath is this project; a held lock on Temp/UnityLockfile (probed with a non-blocking
    fcntl lock that is released at once). Returns {"locked", "pids", "gui", "batch", "lockfile",
    "lockfile_held", "evidence"}."""
    root = find_project(project)["root"]
    procs = editor_processes(root)
    lf = os.path.join(root, "Temp", "UnityLockfile")
    held = None
    if os.path.exists(lf):
        held = False
        try:
            fd = os.open(lf, os.O_RDWR)
            try:
                fcntl.lockf(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.lockf(fd, fcntl.LOCK_UN)
            except OSError:
                held = True
            finally:
                os.close(fd)
        except OSError:
            held = None
    evidence = []
    if procs:
        evidence.append("process %s" % ", ".join(str(p["pid"]) for p in procs))
    if held:
        evidence.append("Temp/UnityLockfile is locked")
    elif held is False:
        evidence.append("stale Temp/UnityLockfile (not held)")
    return {
        "locked": bool(procs) or bool(held),
        "pids": [p["pid"] for p in procs],
        "gui": any(p["gui"] for p in procs),
        "batch": any(p["batch"] for p in procs),
        "lockfile": lf if os.path.exists(lf) else None,
        "lockfile_held": held,
        "evidence": evidence,
    }


def assert_unlocked(project):
    """Raise ProjectLockedError (with the live-channel advice) if an editor holds the project."""
    st = project_lock(project)
    if st["locked"]:
        kind = "a GUI editor" if st["gui"] else "a batch editor"
        raise ProjectLockedError(
            "%s holds %s (%s). Batch mode would be refused or corrupt the Library. Drive the open "
            "editor instead: ut_live.call()/ut_live.eval() (AgentKit bridge) or the Unity CLI "
            "(unity command --project-path ...); or ask the user to close it."
            % (kind, find_project(project)["root"], "; ".join(st["evidence"])))
    return st


def preflight(project=None, version=DEFAULT_VERSION):
    """One call before any work: editor, modules, license, project facts, lock state, Xcode."""
    out = {"editor": None, "license": license_ok(), "project": None, "lock": None, "xcode": None}
    try:
        out["editor"] = find_editor(version)
    except FileNotFoundError as e:
        out["editor_error"] = str(e)
    if project:
        out["project"] = find_project(project)
        out["lock"] = project_lock(project)
    try:
        out["xcode"] = subprocess.run(["xcodebuild", "-version"], capture_output=True, text=True,
                                      timeout=20).stdout.strip().replace("\n", " ")
    except Exception:
        pass
    return out


if __name__ == "__main__":
    import sys
    print(json.dumps(preflight(sys.argv[1] if len(sys.argv) > 1 else None), indent=2, default=str))
