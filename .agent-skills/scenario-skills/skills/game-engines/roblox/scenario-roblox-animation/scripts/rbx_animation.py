#!/usr/bin/env python3
"""Runner-side helpers for scenario-roblox-animation (system python3; Studio only for the live calls).

    kit_source(names) -> str              this skill's AgentKit modules as Luau locals (AnimRig, AnimClip, ...)
    run(studio, code, dm="Edit", kit=(), lead_kit=(), timeout=None)
                                          rbx_run.run with both kits inlined
    blender(cmd, **opts) -> dict          blender_roblox_anim.py headless (`blender -b`): make-test-rig, audit,
                                          export, inspect-fbx, sample
    samples_luau(json_path) -> str        Luau expression decoding a `sample` JSON (bones, rest frames, poses)
    pose_sheet(studio, setup, times, out_dir, camera, name="pose")
                                          Edit-mode poses at track times, one viewport capture each, then one
                                          contact sheet (setup is Luau that defines `rig`, `animator`, `track`)
    audit_source(path_or_text) -> list    AnimAudit.source through Lune (offline)

CLI:
  rbx_animation.py blender <cmd> [--key value ...]
  rbx_animation.py audit <file.luau ...>
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

HERE = Path(__file__).resolve().parent
LEAD = HERE.parents[1] / "scenario-roblox-expert" / "scripts"
sys.path.insert(0, str(LEAD))

__version__ = "0.1.0"

KIT = HERE / "agentkit" / "animation"
BLENDER_SCRIPT = HERE / "blender_roblox_anim.py"
BLENDER = os.environ.get("BLENDER", "blender")


def kit_source(names: list[str] | tuple[str, ...] = ()) -> str:
    """AgentKit modules as Luau locals of the same name, in the order given (AnimClip after AnimRig)."""
    parts = []
    for n in names:
        # Mode directives (--!nonstrict) are only valid on a file's first line.
        src = re.sub(r"^--!\w+\n", "", (KIT / f"{n}.luau").read_text())
        parts.append(f"local {n} = (function()\n{src}\nend)()")
    return "\n".join(parts) + ("\n" if parts else "")


def run(studio, code: str, dm: str = "Edit", kit: list[str] | tuple[str, ...] = (),
        lead_kit: list[str] | tuple[str, ...] = (), timeout: float | None = None) -> dict:
    """rbx_run.run with this skill's kit inlined before `code`. Error line numbers then include the kit."""
    import rbx_run
    return rbx_run.run(studio, kit_source(kit) + code, dm=dm, timeout=timeout, kit=list(lead_kit))


def blender(cmd: str, timeout: float = 300, **opts) -> dict:
    """Run one command of blender_roblox_anim.py in background Blender (never the GUI)."""
    argv = [BLENDER, "-b", "--factory-startup", "--python", str(BLENDER_SCRIPT), "--", cmd]
    for k, v in opts.items():
        if v is False or v is None:
            continue
        argv.append("--" + k.replace("_", "-"))
        if v is not True:
            argv.append(str(v))
    r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    for line in reversed(r.stdout.splitlines()):
        if line.startswith("RBXANIM_JSON "):
            return json.loads(line[len("RBXANIM_JSON "):])
    return {"ok": False, "error": "no RBXANIM_JSON line", "stdout": r.stdout[-1500:], "stderr": r.stderr[-1500:]}


def samples_luau(json_path: str | Path) -> str:
    """A Luau expression that evaluates to the decoded sample table (HttpService:JSONDecode)."""
    text = Path(json_path).read_text()
    eq = "=" * 4
    while f"]{eq}]" in text:
        eq += "="
    return f'game:GetService("HttpService"):JSONDecode([{eq}[{text}]{eq}])'


POSE_LUAU = """
%s
for _, t in animator:GetPlayingAnimationTracks() do
	if t ~= track then
		t:Stop(0)
	end
end
AnimClip.at(animator, track, %f)
return AnimRig.sample(rig)
"""


def pose_sheet(studio, setup: str, times: list[float], out_dir: str | Path, camera: dict,
               name: str = "pose", reset: str | None = None,
               kit: tuple[str, ...] = ("AnimRig", "AnimClip")) -> dict:
    """Pose the rig at each track time in Edit (Animator:StepAnimations), capture the viewport, build a
    contact sheet. `setup` is Luau that defines locals `rig`, `animator` and `track` (it runs once per
    time, so it must find or reuse its clip, not stack new tracks). `camera` = {camera_position,
    look_at_position}. `reset` is Luau run at the end (AnimRig.reset(rig) by default). `kit` lists the
    modules `setup` uses (AnimRig and AnimClip are always needed; add "AnimFace" for face clips)."""
    import rbx_review
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    shots, poses, retries = [], [], 0

    def capture(path):
        # A capture can get no answer while the window is not drawing (seen live with four place windows
        # open): wait and try once more before giving up.
        try:
            return studio.capture(path, camera)
        except Exception:
            time.sleep(5)
            return studio.capture(path, camera)

    try:
        for i, t in enumerate(times):
            r = run(studio, POSE_LUAU % (setup, t), "Edit", kit=list(kit))
            if not r["ok"]:
                return {"ok": False, "error": r["error"], "time": t}
            poses.append(r["result"])
            png = capture(out / f"{name}_{i:02d}_t{t:.2f}.png")
            for _ in range(4):
                if not _blank(png):
                    break
                retries += 1
                time.sleep(3)
                png = capture(out / f"{name}_{i:02d}_t{t:.2f}.png")
            shots.append(png)
    finally:
        # Always: a sheet that stops half way must not leave a posed rig to be saved with the place.
        end = run(studio, setup + "\n" + (reset or "for _, t in animator:GetPlayingAnimationTracks() do t:Stop(0) end "
                                          "animator:StepAnimations(0) return AnimRig.reset(rig)"),
                  "Edit", kit=list(kit))
    sheet = rbx_review.contact_sheet(shots, out / f"{name}_sheet.png", cols=min(4, len(shots)), thumb=400)
    checks = [rbx_review.image_checks(p) for p in shots]
    diffs = [rbx_review.compare(shots[i], shots[i + 1])["mean_abs_luma_diff"] for i in range(len(shots) - 1)]
    return {"ok": True, "captures": [str(p) for p in shots], "sheet": sheet, "poses": poses,
            "frame_diffs": diffs, "checks": checks, "blank": sum(1 for p in shots if _blank(p)),
            "retries": retries, "reset": end.get("result")}


def _blank(png) -> bool:
    """A viewport that did not draw the scene: one luma band covers almost the whole image (seen live in
    Studio 0.743 with several place windows open: the Edit capture showed only the view cube)."""
    import rbx_review
    return max(rbx_review.image_checks(png)["histogram"]) > 0.95


def audit_source(src: str | Path, client: bool = False) -> list[dict]:
    """AnimAudit.source on one file or text, through Lune (no Studio)."""
    text = Path(src).read_text() if isinstance(src, Path) or (len(str(src)) < 400 and Path(str(src)).exists()) else str(src)
    with tempfile.TemporaryDirectory() as d:
        (Path(d) / "AnimAudit.luau").write_text((KIT / "AnimAudit.luau").read_text())
        (Path(d) / "input.luau").write_text(text)
        (Path(d) / "main.luau").write_text(
            'local fs = require("@lune/fs")\nlocal serde = require("@lune/serde")\n'
            'local AnimAudit = require("./AnimAudit")\n'
            f'print(serde.encode("json", AnimAudit.source(fs.readFile("{d}/input.luau"), "input", '
            f'{{client = {"true" if client else "false"}}})))\n')
        r = subprocess.run(["lune", "run", str(Path(d) / "main.luau")], capture_output=True, text=True, timeout=60)
        if r.returncode != 0:
            raise RuntimeError(r.stderr[-1500:])
        return json.loads(r.stdout) if r.stdout.strip() not in ("", "{}") else []


def _main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "blender":
        opts, i = {}, 2
        while i < len(argv):
            k = argv[i].lstrip("-").replace("-", "_")
            if i + 1 < len(argv) and not argv[i + 1].startswith("--"):
                opts[k] = argv[i + 1]
                i += 2
            else:
                opts[k] = True
                i += 1
        res = blender(argv[1], **opts)
        print(json.dumps(res, indent=1))
        return 0 if res.get("ok") else 1
    if len(argv) >= 2 and argv[0] == "audit":
        bad = 0
        for f in argv[1:]:
            for x in audit_source(Path(f)):
                print(f"{x['severity']:5} {x['rule']:24} {f}{re.sub(r'^input', '', x['path'])}  {x['message']}")
                bad += x["severity"] == "error"
        return 1 if bad else 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
