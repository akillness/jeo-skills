"""
ue_contact_sheet_job: one screenshot per imported mesh, framed from its bounds, for the human
and agent review pass after an import. Latent job (needs editor ticks and rendering):
    ue_run.run_python(uproject, "<skills>/scenario-unreal-pipeline-automation/scripts/ue_contact_sheet_job.py",
                      args={"meshes": [...], "out_dir": "/abs/shots", "level": "/Game/Dev/L_Lookdev"},
                      mode="latent", timeout=3600)
NOT YET RUN IN UNREAL. Screenshot call order of preference: the lead's ue_review.screenshot
(if present), unreal.AutomationLibrary.take_high_res_screenshot plus waiting on the task
(automation doc, Screenshot Support) [verify outside a test], else the HighResShot console
command [verify]. Then, on the parent side: ue_review.review_images(paths, sheet=...) runs
image_checks on every frame (an agent once approved an all-white frame, lDf_y-YPELo
[00:17:29]) and tiles a PNG sheet; P.contact_sheet_html adds a captioned HTML page for a person.

args: meshes (content paths), out_dir (abs, no spaces), level (lookdev level from
scenario-unreal-lighting-rendering; None = current level), width 1280, height 720, fov 40, settle 0.5 s.
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import json
import os
import sys

try:
    _HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:
    _HERE = os.getcwd()


def parse_args(args):
    """Dict args from ue_run.run_python (a dict), or from the ue_run.py CLI (a list holding one
    JSON string, or key=value strings)."""
    if isinstance(args, dict):
        return args
    if isinstance(args, (list, tuple)):
        if len(args) == 1 and str(args[0]).strip().startswith("{"):
            return json.loads(args[0])
        out = {}
        for x in args:
            if "=" in str(x):
                k, v = str(x).split("=", 1)
                out[k.lstrip("-")] = v
        return out
    return {}


def main(args):
    if _HERE not in sys.path:
        sys.path.insert(0, _HERE)
    import unreal
    import ue_pipeline as P
    review = P._lead("ue_review")
    a = parse_args(args)
    out_dir = a["out_dir"]
    os.makedirs(out_dir, exist_ok=True)
    w, h, fov = int(a.get("width", 1280)), int(a.get("height", 720)), float(a.get("fov", 40.0))
    settle = float(a.get("settle", 0.5))   # Fray: settle before judging (KuIWCzujtag [01:03:07])
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    ues = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    if a.get("level"):
        les.load_level(a["level"])   # closes the current level WITHOUT saving (our own session)
        yield 1.0
    try:
        les.set_level_viewport_fov(fov)   # 5.8, clamped 5 to 170
    except Exception:
        pass
    shots = []
    for path in a.get("meshes", []):
        mesh = unreal.load_asset(path)
        if mesh is None:
            shots.append({"mesh": path, "error": "not found"})
            continue
        actor = eas.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0))
        box = mesh.get_bounding_box()
        mn, mx = box.get_editor_property("min"), box.get_editor_property("max")
        cam = P.frame_camera([mn.x, mn.y, mn.z], [mx.x, mx.y, mx.z], fov_deg=fov)
        ues.set_level_viewport_camera_info(unreal.Vector(*cam["location"]),
                                           unreal.Rotator(pitch=cam["rotation"][0], yaw=cam["rotation"][1], roll=0.0))
        yield settle
        name = path.rsplit("/", 1)[-1]
        target = os.path.join(out_dir, name + ".png")
        rec = {"mesh": path, "image": target, "camera": cam}
        try:
            if review is not None and hasattr(review, "screenshot") and hasattr(review, "wait_screenshot"):
                req = review.screenshot(target, w, h)          # the lead's toolkit (ue_review)
                target = yield from review.wait_screenshot(req)
                rec["image"] = target
            elif hasattr(unreal, "AutomationLibrary"):
                task = unreal.AutomationLibrary.take_high_res_screenshot(w, h, target)
                waited = 0
                while task is not None and not task.is_task_done() and waited < 600:
                    waited += 1
                    yield
            else:
                unreal.SystemLibrary.execute_console_command(None, "HighResShot %dx%d filename=%s" % (w, h, target))
                yield 2.0
        except Exception as e:
            rec["error"] = "%s: %s" % (type(e).__name__, e)
        rec["exists"] = os.path.isfile(target)
        eas.destroy_actor(actor)
        shots.append(rec)
    return {"shots": shots, "out_dir": out_dir, "missing": [s["mesh"] for s in shots if not s.get("exists")]}
