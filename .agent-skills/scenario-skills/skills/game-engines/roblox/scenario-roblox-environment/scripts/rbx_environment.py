#!/usr/bin/env python3
"""rbx_environment: run environment kits in Studio, capture fixed cameras, measure looks.

Builds on the scenario-roblox-expert toolkit (rbx_env, rbx_mcp, rbx_run, rbx_review), found next to this
skill or through RBX_TOOLKIT. System python3; Pillow makes look_metrics faster and is optional.

    run(studio, code, dm="Edit", kit=(), lead_kit=(), timeout=None) -> rbx_run dict
        kit: modules from agentkit/environment (Graybox, TerrainKit, MaterialKit, Looks, EnvAudit, Scatter,
        WorldCheck), inlined as locals; lead_kit: the lead's AgentKit (Audit, Stats, Spec).
    capture_set(studio, cameras, out_dir, prefix) -> {name: path}
        cameras: {name: ([x, y, z], [x, y, z])}, the camera position and the point it looks at.
    look_metrics(path) -> dict   mean and spread of luma, clipped and crushed fractions, saturation, warm_cool
    sheet(paths, out, cols=2) -> path   contact sheet, 1600 px wide at most
    lune_audit(place_file) -> dict      EnvAudit on a saved place, no Studio (Lune)
    texture_check(paths, max_px=512, large=()) -> dict   pixel sizes and PBR sets of texture files before upload
    streaming_project(project, radius=64) -> path        a Rojo project copy for the streaming test place

CLI:
    python3 rbx_environment.py metrics a.png [b.png ...]
    python3 rbx_environment.py audit place.rbxl
    python3 rbx_environment.py textures folder_or_files...
"""
from __future__ import annotations

import colorsys
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT = HERE / "agentkit" / "environment"


def _toolkit() -> Path:
    env = os.environ.get("RBX_TOOLKIT")
    if env:
        return Path(env)
    return HERE.parent.parent / "scenario-roblox-expert" / "scripts"


sys.path.insert(0, str(_toolkit()))
import rbx_review  # noqa: E402
import rbx_run  # noqa: E402

MODULES = ("Graybox", "TerrainKit", "MaterialKit", "Looks", "EnvAudit", "Scatter", "WorldCheck")


def _kit(names=()) -> tuple[str, list[tuple[int, int, str]]]:
    """Inlined kit source and, per module, the (first, last) line it occupies in that source."""
    parts, spans, line = [], [], 1
    for n in names:
        if n not in MODULES:
            raise ValueError(f"unknown environment kit module {n!r}; known: {', '.join(MODULES)}")
        src = re.sub(r"(?m)^--!.*$", "", (KIT / f"{n}.luau").read_text())
        block = f"local {n} = (function()\n{src}\nend)()"
        count = block.count("\n") + 1
        spans.append((line + 1, line + count - 2, n))
        parts.append(block)
        line += count
    return "\n".join(parts) + ("\n" if parts else ""), spans


def kit_source(names=()) -> str:
    return _kit(names)[0]


def run(studio, code: str, dm: str = "Edit", kit=(), lead_kit=(), timeout=None) -> dict:
    head, spans = _kit(kit)
    shift = head.count("\n")
    r = rbx_run.run(studio, head + code, dm=dm, timeout=timeout, kit=list(lead_kit))

    def fix(m):
        n = int(m[2])
        if n > shift:
            return f"{m[1]}:{n - shift}"  # a line of the caller's code
        for first, last, mod in spans:
            if first <= n <= last:
                return f"{mod}.luau:{n - first + 1}"
        return m[0]

    if shift and r.get("error"):
        r["error"] = re.sub(r"(AssistantCommand|\]):(\d+)", fix, r["error"])
    return r


def capture_set(studio, cameras: dict, out_dir, prefix: str) -> dict:
    out_dir = Path(out_dir)
    paths = {}
    for name, (cam, look) in cameras.items():
        p = studio.capture(out_dir / f"{prefix}_{name}.png",
                           {"camera_position": list(cam), "look_at_position": list(look)})
        paths[name] = p
    return paths


def _pixels(path, size: int = 192, skip_top: float = 0.0):
    try:
        from PIL import Image  # type: ignore
        with Image.open(path) as im:
            im = im.convert("RGB")
            w, h = im.size
            im = im.resize((size, max(1, int(size * h / w))))
            gw, gh = im.size
            px = [(r / 255, g / 255, b / 255) for r, g, b in im.getdata()]
    except ImportError:
        _, _, gw, gh, raw = rbx_review._samples(path, size)
        px = [(p[0], p[1], p[2]) for p in raw]
    return px[int(gh * skip_top) * gw:]


def look_metrics(path, skip_top: float = 0.0) -> dict:
    """Numbers for a lighting look. warm_cool > 0: bright areas warmer (redder) than dark areas.

    skip_top drops that fraction of rows first (0.5 keeps the lower half: ground without most of the sky)."""
    px = _pixels(path, skip_top=skip_top)
    lum = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px]
    sat = [colorsys.rgb_to_hsv(r, g, b)[1] for r, g, b in px]
    n = len(px)
    order = sorted(range(n), key=lambda i: lum[i])
    k = max(1, n // 5)
    dark, bright = order[:k], order[-k:]

    def rb(ix):
        return sum(px[i][0] - px[i][2] for i in ix) / len(ix)

    srt = sorted(lum)
    return {
        "path": str(path),
        "mean_luma": round(sum(lum) / n, 4),
        "p05": round(srt[int(n * 0.05)], 4),
        "p95": round(srt[int(n * 0.95)], 4),
        "spread": round(srt[int(n * 0.95)] - srt[int(n * 0.05)], 4),
        "clipped": round(sum(1 for v in lum if v > 0.98) / n, 4),
        "crushed": round(sum(1 for v in lum if v < 0.02) / n, 4),
        "saturation": round(sum(sat) / n, 4),
        "warm_cool": round(rb(bright) - rb(dark), 4),
    }


def sheet(paths, out, cols: int = 2) -> str:
    paths = [str(p) for p in paths]
    thumb = max(200, min(800, 1600 // max(1, min(cols, len(paths)))))
    return rbx_review.contact_sheet(paths, out, cols=cols, thumb=thumb)


def lune_audit(place_file) -> dict:
    """EnvAudit on a saved .rbxl or .rbxlx through Lune (properties as saved in the file)."""
    r = subprocess.run(["lune", "run", str(KIT / "lune_env_audit.luau"), str(place_file)],
                       capture_output=True, text=True, cwd=str(KIT))
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return json.loads(r.stdout)


_MAP_ROLE = re.compile(r"(?i)[_\-. ](basecolor|base_color|albedo|diffuse|colou?r|normal|nrm|roughness|rough|"
                       r"metalness|metallic|metal|height|displacement|ao|occlusion)$")
_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".tga", ".bmp", ".webp"}


def _image_size(path) -> tuple[int, int]:
    try:
        from PIL import Image  # type: ignore
        with Image.open(path) as im:
            return im.size
    except ImportError:
        out = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
                             capture_output=True, text=True, check=True).stdout
        w = int(re.search(r"pixelWidth: (\d+)", out)[1])
        h = int(re.search(r"pixelHeight: (\d+)", out)[1])
        return w, h


def texture_check(paths, max_px: int = 512, large=()) -> dict:
    """Pixel sizes of texture files before upload, grouped into PBR sets by file-name suffix.

    paths: files or folders. large: file names allowed above max_px (surfaces that fill much of the screen).
    Findings: over-max (info; Improve performance doc: most images at most 512, minor ones under 256),
    pbr-sizes-differ (warn; Roblox Learn OCUZKJJR-TE 00:04:59: maps are packed and upscaled to the largest)."""
    files = []
    for p in map(Path, paths):
        files += sorted(f for f in p.iterdir() if f.suffix.lower() in _IMAGE_EXT) if p.is_dir() else [p]
    rows, sets, findings = [], {}, []
    for f in files:
        w, h = _image_size(f)
        m = _MAP_ROLE.search(f.stem)
        base = f.stem[:m.start()] if m else f.stem
        role = m[1].lower() if m else "color"
        rows.append({"file": f.name, "w": w, "h": h, "set": base, "map": role,
                     "pixels_vs_512": round(w * h / (512 * 512), 2)})
        sets.setdefault(base, []).append((f.name, w, h))
        if max(w, h) > max_px and f.name not in large:
            findings.append({"severity": "info", "rule": "over-max", "file": f.name,
                             "message": f"{w}x{h} above {max_px}: {w * h / (max_px * max_px):.0f}x the memory of "
                                        f"{max_px}x{max_px}; keep it only for a surface that fills the screen"})
    out_sets = []
    for base, maps in sets.items():
        sizes = sorted({(w, h) for _, w, h in maps})
        out_sets.append({"set": base, "maps": len(maps), "sizes": [f"{w}x{h}" for w, h in sizes]})
        if len(sizes) > 1:
            findings.append({"severity": "warn", "rule": "pbr-sizes-differ", "file": base,
                             "message": "maps of one set differ in size; Roblox upscales the smaller ones to the "
                                        "largest, so export them all at one size"})
    return {"files": rows, "sets": out_sets, "findings": findings,
            "tally": {s: sum(1 for x in findings if x["severity"] == s) for s in ("warn", "info")}}


def streaming_project(project, radius: int = 64) -> Path:
    """Write <dir>/streaming<radius>.project.json: a copy of a Rojo project with StreamingEnabled, the target
    radius (MinRadius kept at or under it) and StreamOutBehavior Opportunistic, so content can unload past the
    target radius without memory pressure. These Workspace settings are file-only for scripts (live, P1)."""
    project = Path(project)
    data = json.loads(project.read_text())
    ws = data.setdefault("tree", {}).setdefault("Workspace", {})
    props = ws.setdefault("$properties", {})
    props.update({"StreamingEnabled": True, "StreamingTargetRadius": radius,
                  "StreamingMinRadius": min(int(props.get("StreamingMinRadius", 64)), radius),
                  "StreamOutBehavior": "Opportunistic"})
    data["name"] = f"{data.get('name', 'place')}_streaming{radius}"
    out = project.parent / f"streaming{radius}.project.json"
    out.write_text(json.dumps(data, indent=1))
    return out


def _main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "metrics":
        for p in argv[1:]:
            print(json.dumps(look_metrics(p)))
        return 0
    if len(argv) >= 2 and argv[0] == "textures":
        print(json.dumps(texture_check(argv[1:]), indent=1))
        return 0
    if len(argv) == 2 and argv[0] == "audit":
        print(json.dumps(lune_audit(argv[1]), indent=1))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
