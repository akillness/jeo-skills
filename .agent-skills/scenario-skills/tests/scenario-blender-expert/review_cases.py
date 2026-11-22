"""Renders a box with one face pointing inward through bx_review, with and without culling.

Run by test_live_review.py:
  blender -b --factory-startup --python-exit-code 1 -P review_cases.py -- <expert scripts> <out.json> <tmp dir>
"""

import json
import os
import sys

import bmesh
import bpy

SCRIPTS, OUT, TMP = sys.argv[sys.argv.index("--") + 1:][:3]
sys.path.insert(0, SCRIPTS)
import bx_review  # noqa: E402


def magenta_share(path):
    """Share of the frame that shows the magenta culling background."""
    img = bpy.data.images.load(path)
    px = list(img.pixels)
    n = len(px) // 4
    hit = sum(1 for i in range(n) if px[4 * i] > 0.9 and px[4 * i + 1] < 0.1 and px[4 * i + 2] > 0.9)
    bpy.data.images.remove(img)
    return round(hit / n, 4)


bpy.ops.wm.read_factory_settings(use_empty=True)
me = bpy.data.meshes.new("Box")
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
front = next(f for f in bm.faces if f.normal.y < -0.9)
bmesh.ops.reverse_faces(bm, faces=[front])  # the face the front camera sees now points inward
bm.to_mesh(me)
bm.free()
box = bpy.data.objects.new("Box", me)
bpy.context.scene.collection.objects.link(box)

cases = {}
for culling in (False, True):
    out = os.path.join(TMP, "culled" if culling else "plain")
    # The culled pass takes the name, as bx_audit.deliverable() does.
    sheet = bx_review.review(["Box"] if culling else [box], out, views=("front", "right"), modes=("matcap",),
                             res=96, culling=culling)
    cases["culled" if culling else "plain"] = {
        "sheet": os.path.exists(sheet),
        "front": magenta_share(os.path.join(out, "matcap_front.png")),
        "right": magenta_share(os.path.join(out, "matcap_right.png")),
    }
cases["scene_culling_after"] = bpy.context.scene.display.shading.show_backface_culling

# The command line SKILL.md shows: comma-separated names, an output folder, culling on.
cli_out = os.path.join(TMP, "cli")
argv, sys.argv = sys.argv, ["blender", "--", "--objects", "Box", "--out", cli_out, "--views", "front",
                            "--modes", "matcap", "--res", "96", "--culling", "1"]
try:
    bx_review._cli()
finally:
    sys.argv = argv
cases["cli"] = {"front": magenta_share(os.path.join(cli_out, "matcap_front.png"))}

with open(OUT, "w") as f:
    json.dump(cases, f, indent=1)
print("REVIEW CASES", len(cases))
