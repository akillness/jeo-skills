#!/usr/bin/env python3
"""gd_env: find Godot, check and install export templates, create projects, install the AgentKit and GUT.

System python3, standard library only. Tested on macOS 26 arm64 with Godot 4.7.2.stable (2026-10-02).

Public API (signatures are a contract for the domain skills):
    find_godot() -> str
    version(godot=None) -> str                              e.g. "4.7.2.stable.official.ed1daf0bf"
    version_tag(godot=None) -> str                          e.g. "4.7.2.stable" (templates folder name)
    templates_dir(tag=None) -> Path
    templates_ok(tag=None, platforms=None) -> bool          platforms default: the host OS
    install_templates(tag=None, tpz=None, keep_download=True) -> Path
    new_project(path, template="2d", renderer="forward_plus", jolt=True, name=None,
                stretch_mode="canvas_items", stretch_aspect="expand", pixel_art=False,
                viewport=(1152, 648), main_scene=True, do_import=True, isolate_user=False) -> Path
    install_agentkit(project, overwrite=True) -> Path
    install_gut(project, version="9.7.1", do_import=True) -> Path
    base_project(kind, dest=None, isolate_user=True) -> Path clone_tree() of tests/projects/Base2D|Base3D
    clone_tree(src, dest) -> Path                           APFS clone (cp -cR) on macOS, shutil.copytree elsewhere
    isolate_user_dir(project, label=None) -> Path           own user:// under godot-agentkit/userdata/
    user_data_dir(project) -> Path; userdata_report() -> dict   where user:// is; leftovers with sizes
    read_project(project) -> dict                           {"section/key": raw value string}
    set_project_setting(project, key, value_literal) -> None
"""
from __future__ import annotations

__version__ = "0.1"

import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL_DIR = HERE.parent
AGENTKIT_SRC = HERE / "agentkit"
ASSET_CACHE = Path(os.environ.get("GD_ASSET_CACHE", SKILL_DIR / "assets" / "cache"))
# Dev layout: <repo>/skills/scenario-godot-expert/scripts -> <repo>/tests/projects
BASE_PROJECTS = Path(os.environ.get("GD_BASE_PROJECTS", SKILL_DIR.parent.parent / "tests" / "projects"))

TEMPLATES_ROOT = Path.home() / "Library" / "Application Support" / "Godot" / "export_templates"
if sys.platform.startswith("linux"):
    TEMPLATES_ROOT = Path.home() / ".local" / "share" / "godot" / "export_templates"
elif sys.platform == "win32":
    TEMPLATES_ROOT = Path(os.environ.get("APPDATA", "")) / "Godot" / "export_templates"

HOST_TEMPLATES = {"darwin": "macos", "win32": "windows"}.get(sys.platform, "linux")

GUT_SHA256 = {
    # sha256 of https://github.com/bitwes/Gut/archive/refs/tags/v9.7.1.zip, recorded 2026-10-02
    "9.7.1": "14969aa46adc84aa08cdd21b9f6d1a64addd92ae60b36f02d0521ed305aa4086",
}

RENDERER_FEATURE = {"forward_plus": "Forward Plus", "mobile": "Mobile", "gl_compatibility": "GL Compatibility"}

ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="124" height="124" x="2" y="2" fill="#363d52" stroke="#212532" stroke-width="4" rx="14"/><circle cx="64" cy="64" r="30" fill="#478cbf"/><circle cx="52" cy="58" r="6" fill="#fff"/><circle cx="76" cy="58" r="6" fill="#fff"/></svg>
"""

GITIGNORE = """# Godot 4+ specific ignores
.godot/
/android/
# AgentKit run output (results, captures, profiles)
.agent_out/
"""


def find_godot() -> str:
    """Path of the Godot 4 editor binary: $GODOT, PATH, then /Applications/Godot.app."""
    cands = [os.environ.get("GODOT"), shutil.which("godot"), shutil.which("godot4"),
             "/Applications/Godot.app/Contents/MacOS/Godot",
             str(Path.home() / "Applications/Godot.app/Contents/MacOS/Godot")]
    for c in cands:
        if c and Path(c).exists():
            return str(Path(c))
    raise FileNotFoundError("Godot not found: set $GODOT, put `godot` on PATH (Windows: winget install GodotEngine.GodotEngine), "
                            "or install /Applications/Godot.app (brew install --cask godot)")


def version(godot: str | None = None) -> str:
    """Full version string printed by `godot --version`, for example 4.7.2.stable.official.ed1daf0bf."""
    g = godot or find_godot()
    out = subprocess.run([g, "--headless", "--version"], capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL)
    lines = [ln.strip() for ln in (out.stdout or "").splitlines() if re.match(r"^\d+\.\d+", ln.strip())]
    if not lines:
        raise RuntimeError(f"cannot read Godot version: {out.stdout!r} {out.stderr!r}")
    return lines[-1]


def version_tag(godot: str | None = None) -> str:
    """Templates folder name: '<major>.<minor>[.<patch>].<status>' such as 4.7.2.stable."""
    v = version(godot)
    m = re.match(r"^(\d+\.\d+(?:\.\d+)?)\.([a-z]+\d*)", v)
    if not m:
        raise RuntimeError(f"unexpected version string {v}")
    return f"{m.group(1)}.{m.group(2)}"


def templates_dir(tag: str | None = None) -> Path:
    return TEMPLATES_ROOT / (tag or version_tag())


def templates_ok(tag: str | None = None, platforms=None) -> bool:
    """True when version.txt matches and each requested platform template exists.

    platforms: any of macos, linux, windows, web, android, ios; None checks the host OS's own.
    """
    tag = tag or version_tag()
    d = templates_dir(tag)
    vt = d / "version.txt"
    if not vt.exists() or vt.read_text().strip() != tag:
        return False
    need = {
        "macos": ["macos.zip"],
        "linux": ["linux_release.x86_64", "linux_debug.x86_64"],
        "windows": ["windows_release_x86_64.exe", "windows_debug_x86_64.exe"],
        "web": ["web_nothreads_release.zip", "web_release.zip"],
        "android": ["android_release.apk", "android_source.zip"],
        "ios": ["ios.zip"],
    }
    for p in (HOST_TEMPLATES,) if platforms is None else platforms:
        for f in need.get(p, []):
            if not (d / f).exists():
                return False
    return True


def _download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as fh:
        shutil.copyfileobj(r, fh, length=1 << 20)
    tmp.replace(dest)
    return dest


def _sha(path: Path, algo: str) -> str:
    h = hashlib.new(algo)
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def install_templates(tag: str | None = None, tpz: str | Path | None = None, keep_download: bool = True) -> Path:
    """Install the official export templates for this exact Godot version.

    Downloads Godot_v<ver>-<status>_export_templates.tpz from github.com/godotengine/godot-builds
    (unless `tpz` points at a local copy), checks it against that release's SHA512-SUMS.txt, and
    unpacks `templates/*` into <templates root>/<tag>/ (the .tpz nests everything in templates/).
    About 1.3 GB download, 2.1 GB on disk. Never deletes: the download is kept in the asset cache.
    """
    tag = tag or version_tag()
    ver, status = tag.rsplit(".", 1)
    rel = f"{ver}-{status}"
    name = f"Godot_v{rel}_export_templates.tpz"
    base = f"https://github.com/godotengine/godot-builds/releases/download/{rel}"
    cache = ASSET_CACHE / "templates"
    cache.mkdir(parents=True, exist_ok=True)
    sums = cache / f"SHA512-SUMS-{rel}.txt"
    if not sums.exists():
        _download(f"{base}/SHA512-SUMS.txt", sums)
    expected = None
    for line in sums.read_text().splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1] == name:
            expected = parts[0]
    if not expected:
        raise RuntimeError(f"{name} not listed in {sums}")
    src = Path(tpz) if tpz else cache / name
    if not src.exists():
        _download(f"{base}/{name}", src)
    got = _sha(src, "sha512")
    if got != expected:
        raise RuntimeError(f"SHA512 mismatch for {src}: {got[:16]}... != {expected[:16]}...")
    dest = templates_dir(tag)
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(src) as z:
        for info in z.infolist():
            if info.is_dir() or not info.filename.startswith("templates/"):
                continue
            rel_name = info.filename[len("templates/"):]
            target = dest / rel_name
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as fin, open(target, "wb") as fout:
                shutil.copyfileobj(fin, fout, length=1 << 20)
            mode = (info.external_attr >> 16) & 0o777
            if mode:
                os.chmod(target, mode)
    vt = (dest / "version.txt").read_text().strip()
    if vt != tag:
        raise RuntimeError(f"templates version.txt says {vt}, expected {tag}")
    if not keep_download and not tpz:
        archive = cache / "archive"
        archive.mkdir(exist_ok=True)
        src.replace(archive / src.name)
    return dest


# ---------------------------------------------------------------- project.godot

def _project_godot(name: str, template: str, renderer: str, jolt: bool, stretch_mode: str, stretch_aspect: str,
                   pixel_art: bool, viewport, main_scene: bool) -> str:
    if renderer not in RENDERER_FEATURE:
        raise ValueError(f"renderer must be one of {list(RENDERER_FEATURE)}")
    feats = f'PackedStringArray("4.7", "{RENDERER_FEATURE[renderer]}")'
    lines = ["; Engine configuration file.", "; Written by scenario-godot-expert gd_env.new_project (explicit settings, see SKILL.md).", "",
             "config_version=5", "", "[application]", "", f'config/name="{name}"']
    if main_scene:
        lines.append('run/main_scene="res://main.tscn"')
    lines += [f"config/features={feats}", 'config/icon="res://icon.svg"', "",
              "[display]", "", f"window/size/viewport_width={int(viewport[0])}", f"window/size/viewport_height={int(viewport[1])}",
              f'window/stretch/mode="{stretch_mode}"', f'window/stretch/aspect="{stretch_aspect}"']
    if pixel_art:
        lines.append('window/stretch/scale_mode="integer"')
    lines += [""]
    if template == "3d" or jolt:
        lines += ["[physics]", "", '3d/physics_engine="Jolt Physics"' if jolt else '3d/physics_engine="GodotPhysics3D"', ""]
    lines += ["[rendering]", ""]
    if pixel_art:
        lines += ["textures/canvas_textures/default_texture_filter=0", "2d/snap/snap_2d_transforms_to_pixel=true"]
    # Same keys the 4.7 project manager writes (project_dialog.cpp + EditorNode::get_initial_settings).
    lines += ['rendering_device/driver.windows="d3d12"', f'renderer/rendering_method="{renderer}"']
    if renderer == "gl_compatibility":
        lines.append('renderer/rendering_method.mobile="gl_compatibility"')
    return "\n".join(lines) + "\n"


def read_project(project) -> dict:
    """Flat view of project.godot: {"section/key": raw value}. Keys before any section use their bare name."""
    out, section = {}, ""
    for line in (Path(project) / "project.godot").read_text().splitlines():
        s = line.strip()
        if not s or s.startswith(";"):
            continue
        if s.startswith("[") and s.endswith("]"):
            section = s[1:-1]
            continue
        if "=" in s:
            k, v = s.split("=", 1)
            out[f"{section}/{k}" if section else k] = v
    return out


def set_project_setting(project, key: str, value_literal: str) -> None:
    """Set 'section/sub/key' to a raw Godot literal (for example '"Jolt Physics"', 'true', '60').

    The first path segment is the ConfigFile section, as Godot writes it: 'physics/3d/physics_engine'
    lives in [physics] as 3d/physics_engine. Close the editor first: it rewrites project.godot on save.
    """
    p = Path(project) / "project.godot"
    section, sub = key.split("/", 1)
    lines = p.read_text().splitlines()
    sec_idx, end_idx, found = None, len(lines), None
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            if sec_idx is not None and end_idx == len(lines):
                end_idx = i
            if s[1:-1] == section:
                sec_idx, end_idx = i, len(lines)
        elif sec_idx is not None and end_idx == len(lines) and s.split("=", 1)[0] == sub:
            found = i
    entry = f"{sub}={value_literal}"
    if found is not None:
        lines[found] = entry
    elif sec_idx is not None:
        ins = end_idx
        while ins > sec_idx + 1 and not lines[ins - 1].strip():
            ins -= 1
        lines.insert(ins, entry)
    else:
        lines += ["", f"[{section}]", "", entry]
    p.write_text("\n".join(lines) + "\n")


AGENT_USERDATA = "godot-agentkit/userdata"   # under the OS app data folder (macOS: ~/Library/Application Support)


def _app_data_root() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support"
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", ""))
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))


def isolate_user_dir(project, label: str | None = None) -> Path:
    """Give this project its own user:// folder, outside Godot's shared app_userdata.

    Every clone of Base2D/Base3D keeps config/name "Base3D", so all clones on the machine used to share
    app_userdata/Base3D (saves, input maps, logs, the shader cache: a 3.9 s cold-start hitch measured
    there against 0.45 s fresh). Sets application/config/use_custom_user_dir=true and
    custom_user_dir_name="godot-agentkit/userdata/<label>-<hash of the path>" (verified 4.7.2: user://
    is then ~/Library/Application Support/godot-agentkit/userdata/<label>-<hash>/). All agent user
    folders land in one place, listed by userdata_report(). This is a project setting that ships with an
    export, so it is for agent clones and scratch projects, not a user's game (new_project leaves it off).
    """
    p = Path(project).resolve()
    lab = re.sub(r"[^A-Za-z0-9_.-]+", "_", label or p.name)[:48] or "project"
    name = f"{AGENT_USERDATA}/{lab}-{hashlib.sha1(str(p).encode()).hexdigest()[:8]}"
    set_project_setting(p, "application/config/use_custom_user_dir", "true")
    set_project_setting(p, "application/config/custom_user_dir_name", f'"{name}"')
    return _app_data_root() / name


def user_data_dir(project) -> Path:
    """Where user:// lives for this project (read from project.godot, no Godot run)."""
    s = read_project(project)
    if s.get("application/config/use_custom_user_dir", "false") == "true":
        name = s.get("application/config/custom_user_dir_name", '""').strip('"')
        if name:
            return _app_data_root() / name
    name = s.get("application/config/name", '""').strip('"') or "[unnamed project]"
    base = _app_data_root() / ("Godot" if sys.platform == "darwin" or sys.platform == "win32" else "godot")
    return base / "app_userdata" / name


def userdata_report() -> dict:
    """Agent user:// folders left on disk (logs, shader caches, saves): never deletes anything.

    Lists ~/Library/Application Support/godot-agentkit/userdata/* and Godot's app_userdata/* with
    sizes, so the user can decide on a cleanup. app_userdata also holds folders of real projects the
    user opened in the editor: report them, never touch them.
    """
    def du(d: Path) -> int:
        return sum(f.stat().st_size for f in d.rglob("*") if f.is_file() and not f.is_symlink())

    out = {}
    for key, root in (("agentkit", _app_data_root() / AGENT_USERDATA),
                      ("app_userdata", _app_data_root() / ("Godot" if sys.platform in ("darwin", "win32") else "godot") / "app_userdata")):
        rows = []
        if root.exists():
            for d in sorted(x for x in root.iterdir() if x.is_dir()):
                rows.append({"path": str(d), "bytes": du(d)})
        out[key] = {"root": str(root), "folders": rows, "total_bytes": sum(r["bytes"] for r in rows)}
    return out


def install_agentkit(project, overwrite: bool = True) -> Path:
    """Copy scripts/agentkit/*.gd into <project>/addons/agentkit/ (no plugin.cfg: plain scripts, preload them).

    Domain kits under scripts/agentkit/<domain>/ are copied too when present in this skill.
    """
    dest = Path(project) / "addons" / "agentkit"
    dest.mkdir(parents=True, exist_ok=True)
    for f in sorted(AGENTKIT_SRC.rglob("*.gd")):
        rel = f.relative_to(AGENTKIT_SRC)
        t = dest / rel
        t.parent.mkdir(parents=True, exist_ok=True)
        if t.exists() and not overwrite:
            continue
        shutil.copy2(f, t)
    (dest / "VERSION").write_text("agentkit 0.1 (scenario-godot-expert)\n")
    return dest


def _main_scene_job(template: str) -> str:
    return "res://addons/agentkit/agent_build.gd:make_base_scene_" + ("3d" if template == "3d" else "2d")


def new_project(path, template: str = "2d", renderer: str = "forward_plus", jolt: bool = True, name: str | None = None,
                stretch_mode: str = "canvas_items", stretch_aspect: str = "expand", pixel_art: bool = False,
                viewport=(1152, 648), main_scene: bool = True, do_import: bool = True,
                isolate_user: bool = False) -> Path:
    """Create a Godot 4.7 project with every 'new project' default written explicitly.

    isolate_user=True calls isolate_user_dir() (scratch and test projects; it ships with exports).

    A hand-written project.godot otherwise runs GodotPhysics3D, stretch disabled/keep and Vulkan on
    Windows (verified 4.7.2): the project manager's defaults are applied only by the GUI.
    Installs the AgentKit, builds res://main.tscn in Godot (2D: Node2D + Camera2D + Sprite2D;
    3D: WorldEnvironment + sun + camera + floor + reference cube), then runs --import so class_name
    and UIDs resolve. Refuses to write into a folder that already holds a project.godot.
    """
    p = Path(path).resolve()
    if (p / "project.godot").exists():
        raise FileExistsError(f"{p} already holds a project.godot")
    p.mkdir(parents=True, exist_ok=True)
    (p / "project.godot").write_text(_project_godot(name or p.name, template, renderer, jolt, stretch_mode, stretch_aspect,
                                                     pixel_art, viewport, main_scene))
    (p / "icon.svg").write_text(ICON_SVG)
    (p / ".gitignore").write_text(GITIGNORE)
    (p / ".gitattributes").write_text("# Normalize EOL for all files that Git considers text files.\n* text=auto eol=lf\n")
    install_agentkit(p)
    if isolate_user:
        isolate_user_dir(p)
    sys.path.insert(0, str(HERE))
    import gd_run  # noqa: E402
    if do_import:
        gd_run.import_project(p)
    if main_scene:
        r = gd_run.run_script(p, _main_scene_job(template), args={"path": "res://main.tscn"}, timeout=120)
        if not r["ok"]:
            raise RuntimeError(f"main scene build failed: {r.get('error')} {r.get('script_errors')}")
        if do_import:
            gd_run.import_project(p)
    return p


def install_gut(project, version: str = "9.7.1", do_import: bool = True) -> Path:
    """Download GUT (bitwes/Gut, MIT) once into the asset cache and copy addons/gut into the project.

    GUT 9.7.x is the line for Godot 4.7 (its README table); 9.6 is for 4.6. Runs --import after
    copying because GUT's command line relies on class_name (GutTest).
    """
    cache = ASSET_CACHE / "gut"
    cache.mkdir(parents=True, exist_ok=True)
    zpath = cache / f"Gut-{version}.zip"
    if not zpath.exists():
        _download(f"https://github.com/bitwes/Gut/archive/refs/tags/v{version}.zip", zpath)
    digest = _sha(zpath, "sha256")
    (cache / f"Gut-{version}.zip.sha256").write_text(digest + "\n")
    known = GUT_SHA256.get(version)
    if known and known != digest:
        raise RuntimeError(f"GUT zip sha256 {digest} does not match the pinned {known}")
    dest = Path(project) / "addons" / "gut"
    prefix = f"Gut-{version}/addons/gut/"
    with zipfile.ZipFile(zpath) as z:
        names = [n for n in z.namelist() if n.startswith(prefix)]
        if not names:
            raise RuntimeError(f"{zpath} has no {prefix}")
        for n in names:
            rel = n[len(prefix):]
            if not rel or n.endswith("/"):
                continue
            t = dest / rel
            t.parent.mkdir(parents=True, exist_ok=True)
            with z.open(n) as fin, open(t, "wb") as fout:
                shutil.copyfileobj(fin, fout)
    if do_import:
        sys.path.insert(0, str(HERE))
        import gd_run  # noqa: E402
        gd_run.import_project(project)
    return dest


def clone_tree(src, dest) -> Path:
    """Copy folder src to the new path dest: an APFS clone on macOS (cp -cR, instant), shutil.copytree elsewhere."""
    if sys.platform == "darwin":
        subprocess.run(["cp", "-cR", str(src), str(dest)], check=True)
    else:
        shutil.copytree(src, dest, symlinks=True)
    return Path(dest)


def base_project(kind: str, dest=None, isolate_user: bool = True) -> Path:
    """Clone tests/projects/Base2D or Base3D with clone_tree (instant APFS clone on macOS). Never opens the base.

    kind: "2d" or "3d". dest defaults to a new temp folder. Falls back to new_project() when the
    base projects are not present (installed skill outside this repo). isolate_user (default True)
    gives the clone its own user:// (isolate_user_dir): clones no longer share app_userdata/Base3D.
    """
    k = kind.lower().replace("base", "")
    src = BASE_PROJECTS / ("Base3D" if k == "3d" else "Base2D")
    if dest is None:
        dest = Path(tempfile.mkdtemp(prefix=f"gd_{k}_")) / src.name
    dest = Path(dest)
    if dest.exists():
        raise FileExistsError(f"{dest} exists; pick a new folder")
    if not (src / "project.godot").exists():
        return new_project(dest, template="3d" if k == "3d" else "2d", isolate_user=isolate_user)
    dest.parent.mkdir(parents=True, exist_ok=True)
    clone_tree(src, dest)
    install_agentkit(dest)
    if isolate_user:
        isolate_user_dir(dest)
    return dest


if __name__ == "__main__":
    import json
    g = find_godot()
    print(json.dumps({"godot": g, "version": version(g), "tag": version_tag(g), "templates_ok": templates_ok(),
                      "templates_dir": str(templates_dir()), "base_projects": str(BASE_PROJECTS)}, indent=2))
