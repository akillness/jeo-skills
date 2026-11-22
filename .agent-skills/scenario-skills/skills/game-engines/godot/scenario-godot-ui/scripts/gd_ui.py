#!/usr/bin/env python3
"""gd_ui: runner-side helpers for the scenario-godot-ui skill (Godot 4.7.2). System python3, stdlib only.

Builds on the scenario-godot-expert toolkit (gd_env, gd_run, gd_review). Public API:
    install_ui_kit(project)                         copy agentkit/ui/ into <project>/addons/agentkit/ui/
    TARGETS                                         named device sizes (physical px)
    stretch_math(window, base, mode, aspect, stretch="fractional", factor=1.0) -> dict   (engine parity tested)
    layout_matrix(project, scene, targets=None, **opts) -> dict     headless, ui_layout.gd:matrix
    capture_matrix(project, scene, targets=None, out_dir=..., sheet=True, **opts) -> dict   windowed
    focus_walk(project, scene, steps, size=(1280, 720), **opts) -> dict
    audit_ui(project, scene, hud=False, theme="") -> dict
    check_csv(path) -> dict                         keys, empty cells, placeholder parity, BBCode balance
    register_translations(project, csv_res_dir="res://ui/i18n") -> list   after --import
    wcag_contrast(fg, bg) -> float                  "#rrggbb" or (r, g, b) 0..1
"""
from __future__ import annotations

__version__ = "0.1"

import csv
import math
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXPERT = HERE.parents[1] / "scenario-godot-expert" / "scripts"
for p in (HERE, EXPERT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))
import gd_env  # noqa: E402
import gd_review  # noqa: E402
import gd_run  # noqa: E402

KIT = HERE / "agentkit" / "ui"
UI_RES = "res://addons/agentkit/ui"

# Physical window sizes. Phone and tablet entries are size classes, not specific devices.
TARGETS = {
    "phone_portrait": (1080, 2400),
    "phone_landscape": (2400, 1080),
    "tablet_4x3": (2048, 1536),
    "laptop_hd": (1366, 768),
    "fhd": (1920, 1080),
    "ultrawide": (2560, 1080),
    "uhd": (3840, 2160),
    "small_window": (800, 600),
}


def install_ui_kit(project, overwrite: bool = True) -> Path:
    """Copy the UI AgentKit (and the base AgentKit if missing) into the project."""
    project = Path(project)
    if not (project / "addons" / "agentkit" / "agent_job.gd").exists():
        gd_env.install_agentkit(project)
    dest = project / "addons" / "agentkit" / "ui"
    for src in KIT.rglob("*.gd"):
        out = dest / src.relative_to(KIT)
        out.parent.mkdir(parents=True, exist_ok=True)
        if overwrite or not out.exists():
            shutil.copy2(src, out)
    return dest


def stretch_math(window, base, mode="canvas_items", aspect="expand", stretch="fractional", factor=1.0) -> dict:
    """Python twin of Window::_update_viewport_size (root window). Returns logical canvas, drawn area,
    black-bar margin and scale (physical px per logical px)."""
    wx, wy = float(window[0]), float(window[1])
    bx, by = float(base[0]), float(base[1])
    f = max(1.0, math.floor(factor)) if stretch == "integer" else float(factor)
    if mode == "disabled" or bx == 0 or by == 0:
        return {"logical": (wx / f, wy / f), "screen": (wx, wy), "margin": (0.0, 0.0), "scale": f}
    vpa, vma = bx / by, wx / wy
    if aspect == "ignore" or math.isclose(vpa, vma, rel_tol=1e-5, abs_tol=1e-5):
        vs, ss = (bx, by), (wx, wy)
    elif vpa < vma:
        if aspect in ("keep_height", "expand"):
            vs, ss = (by * vma, by), (wx, wy)
        else:
            vs, ss = (bx, by), (wy * vpa, wy)
    else:
        if aspect in ("keep_width", "expand"):
            vs, ss = (bx, bx / vma), (wx, wy)
        else:
            vs, ss = (bx, by), (wx, wx / vpa)
    ss = (math.floor(ss[0]), math.floor(ss[1]))
    vs = (math.floor(vs[0]), math.floor(vs[1]))
    if stretch == "integer":
        k = max(1, math.floor(min(ss[0] / vs[0], ss[1] / vs[1])))
        ss = (vs[0] * k, vs[1] * k)
    # centred on each axis where the drawn area is smaller than the window (keep* bars, integer borders)
    mx = round((wx - ss[0]) / 2.0) if ss[0] < wx else 0.0
    my = round((wy - ss[1]) / 2.0) if ss[1] < wy else 0.0
    logical = (vs[0] / f, vs[1] / f)
    if mode == "viewport":
        logical = (math.floor(vs[0] / f), math.floor(vs[1] / f))
    return {"logical": logical, "screen": ss, "margin": (mx, my), "scale": ss[0] / logical[0]}


def _targets(targets):
    if targets is None:
        return [[k, *v] for k, v in TARGETS.items()]
    out = []
    for t in targets:
        if isinstance(t, str):
            out.append([t, *TARGETS[t]])
        else:
            out.append(list(t))
    return out


def layout_matrix(project, scene, targets=None, timeout=300, **opts) -> dict:
    """Headless layout report at each target. opts: factor, min_touch_px, safe_insets {name: [l,t,r,b]},
    locale, pseudo, expansion, track, setup. Result: result.targets[name].counts / issues / tracked."""
    install_ui_kit(project, overwrite=False)
    args = {"scene": scene, "targets": _targets(targets)}
    args.update(opts)
    return gd_run.run_script(project, f"{UI_RES}/ui_layout.gd:matrix", args, timeout=timeout)


def capture_matrix(project, scene, targets=None, out_dir="captures/ui", sheet=True, thumb=400, timeout=300, **opts) -> dict:
    """Windowed render at each target (black bars and safe-area bands included), image_checks per PNG,
    and a contact sheet (max 1600 px wide) to open and judge."""
    install_ui_kit(project, overwrite=False)
    args = {"scene": scene, "targets": _targets(targets), "out_dir": out_dir}
    args.update(opts)
    r = gd_run.run_script(project, f"{UI_RES}/ui_capture.gd:matrix", args, timeout=timeout, headless=False)
    imgs = (r.get("result") or {}).get("images") or []
    r["checks"] = {p: gd_review.image_checks(p) for p in imgs if Path(p).exists()}
    if sheet and imgs:
        out = str(Path(imgs[0]).parent / "contact_sheet.png")
        cols = min(4, len(imgs))
        r["contact_sheet"] = gd_review.contact_sheet(imgs, out, cols=cols, thumb=min(thumb, 1600 // cols))
    return r


def focus_walk(project, scene, steps, size=(1280, 720), timeout=120, **opts) -> dict:
    install_ui_kit(project, overwrite=False)
    args = {"scene": scene, "steps": list(steps), "size": list(size)}
    args.update(opts)
    return gd_run.run_script(project, f"{UI_RES}/ui_focus.gd:walk", args, timeout=timeout)


def audit_ui(project, scene, hud=False, theme="", timeout=120) -> dict:
    install_ui_kit(project, overwrite=False)
    return gd_run.run_script(project, f"{UI_RES}/ui_audit.gd:scene", {"scene": scene, "hud": hud, "theme": theme}, timeout=timeout)


_PH = re.compile(r"\{[A-Za-z_][A-Za-z0-9_]*\}|%[-+0-9.]*[sdif]")
_TAG = re.compile(r"\[(/?)([a-z_]+)[^\]]*\]")


def _bbcode_ok(s: str) -> bool:
    stack = []
    for close, name in _TAG.findall(s):
        if close:
            if not stack or stack.pop() != name:
                return False
        elif name not in ("img", "br", "lb", "rb"):
            stack.append(name)
    return not stack


def check_csv(path) -> dict:
    """Offline checks of a Godot translation CSV: duplicate keys, empty cells, placeholder sets that
    differ from the first language, unbalanced BBCode. Plural continuation rows (empty key) are
    checked for placeholders only; special columns start with '?' and '_' columns are comments."""
    rows = list(csv.reader(Path(path).read_text(encoding="utf-8").splitlines()))
    header = rows[0]
    langs = [i for i, h in enumerate(header) if i > 0 and not h.startswith("?") and not h.startswith("_")]
    issues, seen = [], set()
    for n, row in enumerate(rows[1:], start=2):
        row = row + [""] * (len(header) - len(row))
        key = row[0]
        if key.startswith("?"):
            continue
        if key:
            if key in seen:
                issues.append({"line": n, "kind": "duplicate_key", "key": key})
            seen.add(key)
        ref = None
        for i in langs:
            cell = row[i]
            if cell == "":
                if key:
                    issues.append({"line": n, "kind": "empty", "key": key, "lang": header[i]})
                continue
            ph = sorted(_PH.findall(cell))
            if ref is None:
                ref = ph
            elif ph != ref:
                issues.append({"line": n, "kind": "placeholders", "key": key, "lang": header[i], "got": ph, "want": ref})
            if not _bbcode_ok(cell):
                issues.append({"line": n, "kind": "bbcode", "key": key, "lang": header[i]})
    return {"ok": not issues, "keys": len(seen), "languages": [header[i] for i in langs], "issues": issues}


def register_translations(project, csv_res_dir="res://ui/i18n") -> list:
    """After gd_run.import_project: list the generated .translation files and write
    internationalization/locale/translations in project.godot."""
    project = Path(project)
    d = project / csv_res_dir.replace("res://", "")
    files = sorted(f"{csv_res_dir}/{p.name}" for p in d.glob("*.translation"))
    lit = "PackedStringArray(" + ", ".join(f'"{f}"' for f in files) + ")"
    gd_env.set_project_setting(project, "internationalization/locale/translations", lit)
    return files


def _rgb(c):
    if isinstance(c, str):
        c = c.lstrip("#")
        return tuple(int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return tuple(c[:3])


def wcag_contrast(fg, bg) -> float:
    def lum(c):
        lin = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in _rgb(c)]
        return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
    a, b = lum(fg), lum(bg)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


if __name__ == "__main__":
    import json
    print(json.dumps(stretch_math((1080, 2400), (720, 720)), indent=1))
