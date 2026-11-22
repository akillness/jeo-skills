"""Shared setup and finish for the example scenes in references/examples.md.

blender -b --factory-startup --python-exit-code 1 --python ex1_watchmaker.py -- <out dir> [stills|playblast|both] [cast style]

Writes <tag>_stats.json (budget, cut list, audits), stills at the first, middle and last frame of
each shot, a Workbench playblast and the .blend into <out dir>. Needs scenario-blender-expert
installed next to this skill for the playblast (bx_review).
"""
import json
import math
import os
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
SK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # this skill's scripts/
OUT = argv[0]
MODE = argv[1] if len(argv) > 1 else "stills"
CAST = argv[2] if len(argv) > 2 else None  # a K.CAST style for the scenes that offer one
sys.path.append(SK)
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(SK)), "scenario-blender-expert", "scripts"))
import bx_blockout as B  # noqa: E402
import bx_kits as K  # noqa: E402

os.makedirs(OUT, exist_ok=True)


def start(fps, seconds, world_rgb=(0.03, 0.03, 0.04)):
    # Clears the factory scene only. On a file that holds other work, B.park and B.make_scene instead.
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    B.lock_format(fps, seconds, (1920, 1080))
    sc = bpy.context.scene
    sc.world = sc.world or bpy.data.worlds.new("World")
    sc.world.color = world_rgb
    B.collection("BLK")
    return {n: B.collection(f"BLK_{n}", "BLK") for n in ("env", "fig", "prp", "cam")}


def sun(rot_deg=(50, 0, 30), energy=3.0):
    sc = bpy.context.scene
    light = bpy.data.lights.new("LGT_key", "SUN")
    light.energy = energy
    lo = bpy.data.objects.new("LGT_key", light)
    sc.collection.objects.link(lo)
    lo.rotation_euler = [math.radians(a) for a in rot_deg]
    return lo


def pose(obj_name, frame, **parts_deg):
    """K.pose: key joint rotations at a frame, in degrees."""
    return K.pose(obj_name, frame, **parts_deg)


def smooth_all(names):
    for n in names:
        o = bpy.data.objects[n]
        B.smooth_keys(o)


def finish(tag, level, audits, still_frames=None):
    sc = bpy.context.scene
    end = sc.frame_end
    for cam in [o for o in sc.objects if o.type == "CAMERA"]:
        cam.data.clip_end = max(cam.data.clip_end, 3000.0)
    stats = {"tag": tag, "level": level, "elements": len(K.elements()),
             "heroes": K.movers()[0], "extras": len(K.movers()[1]),
             "budget_gaps": K.audit_budget(level), "cuts": B.cut_list(),
             "audit_frames": B.audit_frames(end / sc.render.fps, sc.render.fps),
             "audit_cuts": B.audit_cuts()}
    for name, fn in audits.items():
        try:
            stats[name] = fn()
        except Exception as e:  # report, keep going
            stats[name] = f"ERROR {e!r}"
    print("STATS " + json.dumps(stats, default=str))
    with open(os.path.join(OUT, f"{tag}_stats.json"), "w") as f:
        json.dump(stats, f, indent=1, default=str)
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_cavity, sh.show_shadows = "STUDIO", "MATERIAL", True, True
    sh.show_object_outline = False
    sc.view_settings.view_transform = "Standard"
    if MODE in ("stills", "both"):
        frames = still_frames
        if frames is None:
            frames = []
            for c in stats["cuts"]:
                a, b = c["frames"] if "frames" in c else (c["start_frame"], c["end_frame"])
                frames += [a, (a + b) // 2, b]
            frames = sorted(set(frames)) or [1, end // 2, end]
        sc.render.resolution_percentage = 50
        for f in frames:
            sc.frame_set(f)
            m = [mk for mk in sc.timeline_markers if mk.camera and mk.frame <= f]
            if m:
                sc.camera = max(m, key=lambda mk: mk.frame).camera
            sc.render.filepath = os.path.join(OUT, "stills", f"{tag}_f{f:03d}.png")
            bpy.ops.render.render(write_still=True)
        sc.render.resolution_percentage = 100
    if MODE in ("playblast", "both"):
        import bx_review
        sc.frame_set(1)
        bx_review.playblast(os.path.join(OUT, f"{tag}_playblast.mp4"), res_pct=100)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, f"{tag}.blend"))
    print("DONE", tag)
