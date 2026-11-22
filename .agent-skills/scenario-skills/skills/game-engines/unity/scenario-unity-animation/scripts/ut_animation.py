"""
ut_animation: runner-side helpers of the scenario-unity-animation skill (animator / technical animator).

Imports the shared toolkit of scenario-unity-expert (ut_env, ut_run, ut_review, ut_stat); never copies it.
System python3, 3.9+, stdlib only. Run on 2026-09-24 against Unity 6000.3.21f1 (macOS, Apple Silicon):
tests/code/unity-animation/test_offline.py (pure Python) and test_live_animation.py (live jobs).

    import sys; sys.path.insert(0, "<skills>/scenario-unity-expert/scripts"); sys.path.insert(0, "<skills>/scenario-unity-animation/scripts")
    import ut_animation as ua
    P = ua.prepare(P)                                   # AgentKit + AgentKit/Animation + runtime scripts
    ua.pinned_packages(P)                               # {"com.unity.cinemachine": "3.1.7", ...} from packages-lock.json
    rules = ua.default_rules("Hero.fbx")                # role table -> AnimImportRules.json
    ua.blend_tree_checks(tree, {"Speed": (0, 4)})       # offline static checks of a blend tree spec (+ parameter extents)
    ua.second_order_constants(f=2, zeta=0.5, r=-2)      # t3ssel8r k1, k2, k3 and the critical timestep
    ua.interruption_probe_spec(...)                     # controller that reproduces the transition-interruption rules
    ua.camera_probe_checks(probe_result)                # flips, swing-through, occlusion, camera inside geometry
    ua.jitter_metrics(probe_result["vp_series"])        # target screen steps that reverse frame to frame
    ua.scan_csharp("<project>/Assets")                  # animation and camera traps in project C#
    ua.MIXAMO_DOWNLOAD                                  # download settings (root motion vs in place)

What needs Unity is a C# job in scripts/AgentKit/Animation (namespace AgentKit.Animation), launched with
ut_run.run_method. Files whose first lines say "// REQUIRES: <package>" are installed only when that
package is in packages-lock.json: a compile error in ANY assembly aborts every batch job (lead trap O3),
so code that references Cinemachine or Animation Rigging must not land in a project without them.
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24, refactor after blind grade Y5)

import glob
import json
import math
import os
import re
import shutil

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT_SRC = os.path.join(SKILL_DIR, "scripts", "AgentKit")
RUNTIME_SRC = os.path.join(SKILL_DIR, "scripts", "Runtime")
RUNTIME_DST = os.path.join("Assets", "AgentKitRuntime", "Animation")

# Versions this skill was proven with on 6000.3.21f1 (2026-09-24). The editor manifest lists
# Cinemachine 2.10.7; Client.Add("com.unity.cinemachine") without a version resolved to 3.1.7 that
# day (registry latest). Pin anyway: bare adds follow the registry, the GUI can offer the editor's
# recommended version, and CM2 code does not compile against CM3.
PINNED = {
    "com.unity.cinemachine": "3.1.7",
    "com.unity.animation.rigging": "1.4.1",
    "com.unity.timeline": "1.8.12",
}

_REQ = re.compile(r"^//\s*REQUIRES:\s*(.+)$", re.M)


# ============================================================================ project setup
def _toolkit():
    import sys
    lead = os.path.join(os.path.dirname(SKILL_DIR), "scenario-unity-expert", "scripts")
    if lead not in sys.path:
        sys.path.insert(0, lead)
    import ut_env  # noqa: F401
    return ut_env


def packages_lock(project):
    """{name: version} resolved in Packages/packages-lock.json (what Unity actually installed)."""
    path = os.path.join(project, "Packages", "packages-lock.json")
    if not os.path.isfile(path):
        return {}
    with open(path) as f:
        deps = json.load(f).get("dependencies", {})
    return {k: v.get("version") for k, v in deps.items()}


def pinned_packages(project):
    """Resolved versions of the animation stack, plus a verdict per package against PINNED."""
    lock = packages_lock(project)
    out = {}
    for name, want in PINNED.items():
        have = lock.get(name)
        out[name] = {"want": want, "have": have, "ok": have is not None and have.split(".")[:2] == want.split(".")[:2]}
    out["com.unity.splines"] = {"have": lock.get("com.unity.splines")}
    return out


def pin_manifest(project, packages=None):
    """Offline alternative to AnimPackages.Add: write explicit versions into Packages/manifest.json.
    Unity resolves them at the next editor start. Returns the changed entries."""
    packages = packages or PINNED
    path = os.path.join(project, "Packages", "manifest.json")
    with open(path) as f:
        man = json.load(f)
    changed = {}
    for k, v in packages.items():
        if man["dependencies"].get(k) != v:
            changed[k] = (man["dependencies"].get(k), v)
            man["dependencies"][k] = v
    if changed:
        with open(path, "w") as f:
            json.dump(man, f, indent=2)
            f.write("\n")
    return changed


def requirements(cs_path):
    """Package names a C# file declares with '// REQUIRES: a, b' in its header."""
    with open(cs_path, encoding="utf-8") as f:
        head = f.read(4000)
    m = _REQ.search(head)
    return [p.strip() for p in m.group(1).split(",")] if m else []


def install(project, force_all=False):
    """Copy AgentKit/Animation (Editor, filtered by REQUIRES against packages-lock.json) and the
    runtime scripts (Assets/AgentKitRuntime/Animation, compiled into Assembly-CSharp so Timeline can
    serialize the custom tracks). Returns {"editor": [...], "runtime": [...], "skipped": {...}}."""
    ut_env = _toolkit()
    root = ut_env.find_project(project)["root"]
    ut_env.install_agentkit(root)                        # the lead's core AgentKit
    lock = packages_lock(root)
    written = {"editor": [], "runtime": [], "skipped": {}}
    for src_root, dst_root, key in ((KIT_SRC, os.path.join(root, "Assets", "Editor", "AgentKit"), "editor"),
                                    (RUNTIME_SRC, os.path.join(root, RUNTIME_DST), "runtime")):
        for dirpath, _d, files in os.walk(src_root):
            for fn in sorted(files):
                if not (fn.endswith(".cs") or fn.endswith(".asmdef")):
                    continue
                s = os.path.join(dirpath, fn)
                d = os.path.join(dst_root, os.path.relpath(s, src_root))
                missing = [p for p in (requirements(s) if fn.endswith(".cs") else []) if p not in lock]
                if missing and not force_all:
                    written["skipped"][os.path.relpath(s, SKILL_DIR)] = missing
                    if os.path.isfile(d):   # a stale copy would break compilation: park it outside Assets
                        park = os.path.join(root, "Library", "AgentKit", "parked")
                        os.makedirs(park, exist_ok=True)
                        shutil.move(d, os.path.join(park, fn))
                    continue
                with open(s, "rb") as f:
                    data = f.read()
                if os.path.isfile(d):
                    with open(d, "rb") as f:
                        if f.read() == data:
                            continue
                os.makedirs(os.path.dirname(d), exist_ok=True)
                with open(d, "wb") as f:
                    f.write(data)
                written[key].append(os.path.relpath(d, root))
    return written


def prepare(dest, kind="3d"):
    """Clone the base project (APFS clone) if needed and install everything this skill uses."""
    ut_env = _toolkit()
    p = ut_env.base_project(kind, dest)
    install(p)
    return p


# ============================================================================ sample content
def sample_assets(project):
    """Unity's own humanoid sample content, shipped offline inside the Timeline package cache
    (Samples~/GameplaySequenceDemo): DefaultMale.fbx (Humanoid-ready skeleton, mesh, textures) and
    mocap clips (Stance, Nav-Accelerations with Walk/Jog/Sprint/turns, JumpDown, Victory...).
    Returns absolute paths or raises FileNotFoundError (package not resolved yet: run one job first)."""
    project = os.path.abspath(project)
    hits = glob.glob(os.path.join(project, "Library", "PackageCache", "com.unity.timeline@*", "Samples~", "GameplaySequenceDemo"))
    if not hits:
        raise FileNotFoundError("Timeline package samples not found in Library/PackageCache (open the project once)")
    base = hits[0]
    anim = os.path.join(base, "Animation")
    return {
        "root": base,
        "character": os.path.join(base, "Character", "Models", "DefaultMale.fbx"),
        "textures": sorted(glob.glob(os.path.join(base, "Character", "Textures", "DefaultMale_Albedo*.png"))),
        "clips": {os.path.splitext(os.path.basename(p))[0]: p for p in sorted(glob.glob(os.path.join(anim, "*.fbx")))},
    }


# ============================================================================ import rules
# Root-motion settings by clip role. Sources: 6.3 Manual "How Root Motion works" (bake XZ on idles,
# bake Y unless the clip changes height and then Based Upon Feet, bake rotation only when start and end
# orientation match), Ketra Games mNxEetKzc04 [00:02:31] [00:04:47] (idle bakes all three, Based Upon
# Original; walk/run bake rotation and Y, XZ drives the character, Loop Time + Loop Pose).
# ModelImporterClipAnimation property names; loopPose is the inspector's "Loop Pose".
ROLE_FLAGS = {
    # idle: all three axes baked, so the clip never moves or turns its GameObject: a baked axis has a zero delta
    # WHATEVER Based Upon says (6.3 Manual), and drift only comes from an axis left unbaked (XZ on idles).
    # Based Upon picks the reference the baked pose keeps: Original keeps the file's authored facing and position
    # (Ketra Games bakes Mixamo idles with Original on all three axes, mNxEetKzc04 [00:02:31]); Body Orientation
    # and Center of Mass re-centre the pose on the body, the choice for segments cut from long mocap takes
    # (measured 2026-09-24 over 30 s: Body Orientation and Original both drifted 0 m and 0 deg; with Original the
    # Turns_StartStop segment faced 88 deg away and stood 2.43 m off its GameObject; XZ left unbaked drifted
    # 0.246 m. Procedures P5b).
    "idle": {"loopTime": True, "loopPose": True, "lockRootRotation": True, "keepOriginalOrientation": False,
             "lockRootHeightY": True, "keepOriginalPositionY": True, "lockRootPositionXZ": True,
             "keepOriginalPositionXZ": False},
    "locomotion": {"loopTime": True, "loopPose": True, "lockRootRotation": True, "keepOriginalOrientation": True,
                   "lockRootHeightY": True, "keepOriginalPositionY": True, "lockRootPositionXZ": False},
    # turning cycles: the root rotation IS the motion, so rotation is not baked [added: follows the Manual rule]
    "turn": {"loopTime": True, "loopPose": True, "lockRootRotation": False, "lockRootHeightY": True,
             "keepOriginalPositionY": True, "lockRootPositionXZ": False},
    # strafes: Body Orientation fails for sideways motion (Manual); Original keeps the authored facing
    "strafe": {"loopTime": True, "loopPose": True, "lockRootRotation": True, "keepOriginalOrientation": True,
               "lockRootHeightY": True, "keepOriginalPositionY": True, "lockRootPositionXZ": False},
    # height-changing clips: Y not baked, Based Upon Feet, so blends do not float (Manual)
    "jump": {"loopTime": False, "loopPose": False, "lockRootRotation": True, "keepOriginalOrientation": True,
             "lockRootHeightY": False, "keepOriginalPositionY": False, "heightFromFeet": True,
             "lockRootPositionXZ": False},
    "oneshot": {"loopTime": False, "loopPose": False, "lockRootRotation": True, "keepOriginalOrientation": True,
                "lockRootHeightY": True, "keepOriginalPositionY": True, "lockRootPositionXZ": False},
}

ROLE_PATTERNS = [
    [r"(?i)idle|stance", "idle"],
    [r"(?i)jump|fall|land", "jump"],
    [r"(?i)strafe", "strafe"],
    [r"(?i)turn", "turn"],
    [r"(?i)walk|jog|run|sprint|locomotion", "locomotion"],
]


def default_rules(character, files=None, animation_type="Human", translation_dof=False):
    """AnimImportRules.json content for AnimImportPostprocessor. files: per-file overrides, e.g.
    {"Nav-Accelerations": {"clips": [{"name": "Walk", "first": 31, "last": 67, "role": "locomotion"}]}}."""
    return {
        "version": 1,
        "enabled": True,
        "character": character,
        "animation_type": animation_type,
        "translation_dof": translation_dof,
        "rename_single_clip": True,
        "role_flags": ROLE_FLAGS,
        "role_patterns": ROLE_PATTERNS,
        "files": files or {},
    }


# Clip ranges of Unity's Nav-Accelerations take (from its shipped .meta), used by the live tests.
SAMPLE_FILE_RULES = {
    "Nav-Accelerations": {"clips": [
        {"name": "Walk", "first": 31, "last": 67, "role": "locomotion"},   # frames 0-30: T-pose calibration
        {"name": "Jog", "first": 126, "last": 149, "role": "locomotion"},
        {"name": "Sprint", "first": 598.3, "last": 616, "role": "locomotion"},
        {"name": "TurnLeft", "first": 222, "last": 275, "role": "turn"},
        {"name": "TurnRight", "first": 455, "last": 518, "role": "turn"},
    ]},
    # a 3 s standing segment found by AnimSampler.ClipProfile (hips speed < 0.15 m/s, arms down): 22.8-25.8 s.
    # IdleOriginal and IdleXZFree are the same frames with one setting changed, for the drift test (P5b):
    # Based Upon Original on rotation and XZ, and XZ left unbaked (a deliberate mistake, flagged by the audit).
    "Turns_StartStop-Wk": {"clips": [
        {"name": "Idle", "first": 690, "last": 768, "role": "idle"},
        {"name": "IdleOriginal", "first": 690, "last": 768, "role": "idle",
         "flags": {"keepOriginalOrientation": True, "keepOriginalPositionXZ": True}},
        {"name": "IdleXZFree", "first": 690, "last": 768, "role": "idle", "flags": {"lockRootPositionXZ": False}},
    ]},
    "Stance": {"role": "idle"},   # one frame (0.033 s even with lastFrame 150): Unity's T-pose reference, not an idle
    "JumpDown-Sprt_St": {"role": "jump"},
    # Avatar Mask at import (fingers and hand IK goals off): the 6.3 Manual's Humanoid cost cut
    "Victory-anim1": {"role": "oneshot", "flags": {"mask": "Assets/AnimLab/Masks/NoFingersHandIK.mask"}},
}

# Masks ImportDrop builds before the clips import (args "masks"); AvatarMaskBodyPart names.
SAMPLE_IMPORT_MASKS = [{"path": "Assets/AnimLab/Masks/NoFingersHandIK.mask",
                        "humanoid_off": ["LeftFingers", "RightFingers", "LeftHandIK", "RightHandIK"]}]

# Mixamo download settings (the website has no API: a human or a computer-use agent clicks them).
# Root motion (the player): In Place OFF so the clip carries the displacement, Character Arm Space raised so the
# arms clear the body (Ketra Games mNxEetKzc04 [00:02:31] to [00:03:38]). Script-driven trees: In Place ON
# (iHeartGameDev _J8RPIaO2Lc [00:01:24]). Both: FBX for Unity, 30 fps, keyframe reduction none, Without Skin for
# every clip after the first, downloaded ON THE SAME Mixamo character so the bone names match
# (BEZHVYk6Fa4 [00:12:54]). Every take arrives named "mixamo.com": roles come from file names or rules.
MIXAMO_DOWNLOAD = {
    "root_motion": {"format": "FBX for Unity", "fps": 30, "keyframe_reduction": "none", "in_place": False,
                    "character_arm_space": "raised until the hands clear the hips", "skin": "Without Skin (clips)"},
    "in_place": {"format": "FBX for Unity", "fps": 30, "keyframe_reduction": "none", "in_place": True,
                 "skin": "Without Skin (clips)"},
    "character": {"format": "FBX for Unity", "pose": "T-pose", "skin": "With Skin"},
}


# ============================================================================ offline checks
def _angle(v):
    return math.degrees(math.atan2(v[1], v[0]))


def blend_tree_checks(tree, param_ranges=None, eps=0.05):
    """Static checks of a blend tree spec {"type": "SimpleDirectional2D"|"FreeformDirectional2D"|
    "FreeformCartesian2D"|"Simple1D"|"Direct", "children": [{"name", "pos": [x, y] | threshold}]}.
    Mirrors the warnings Unity prints in the inspector (iHeartGameDev _J8RPIaO2Lc [frame 00:05:06],
    [frame 00:05:51]) so an agent catches them without the Animator window. Returns findings."""
    out = []
    t = tree.get("type", "")
    kids = tree.get("children", [])
    if t.endswith("2D"):
        pts = [(k.get("name"), tuple(k["pos"])) for k in kids]
        for i in range(len(pts)):
            for j in range(i + 1, len(pts)):
                (na, a), (nb, b) = pts[i], pts[j]
                if math.hypot(a[0] - b[0], a[1] - b[1]) < eps:
                    out.append({"severity": "warn", "code": "tree.positions_too_close", "path": "%s/%s" % (na, nb),
                                "message": "Two or more of the positions are too close to each other"})
        if t == "SimpleDirectional2D":
            dirs = [(n, p) for n, p in pts if math.hypot(*p) > eps]
            for i in range(len(dirs)):
                for j in range(i + 1, len(dirs)):
                    (na, a), (nb, b) = dirs[i], dirs[j]
                    d = abs((_angle(a) - _angle(b) + 180) % 360 - 180)
                    if d < 1:
                        out.append({"severity": "error", "code": "tree.simple_directional_same_direction", "path": "%s/%s" % (na, nb),
                                    "message": "Simple Directional keeps one motion per direction: use Freeform Directional for walk and run on one axis"})
                    elif abs(d - 180) < 1:
                        out.append({"severity": "error", "code": "tree.simple_directional_180", "path": "%s/%s" % (na, nb),
                                    "message": "Simple Directional blend should have motions with directions less than 180 degrees apart"})
        if t in ("FreeformDirectional2D", "SimpleDirectional2D") and not any(math.hypot(*p) <= eps for _, p in pts):
            out.append({"severity": "info", "code": "tree.no_origin_motion", "path": tree.get("name", ""),
                        "message": "no motion at the origin: parameters near zero blend the nearest directions (fine when Idle is its own state)"})
    if param_ranges and kids:
        # parameters must stay inside the children's extents: graph coordinates are gameplay units
        xs = [k["pos"][0] if isinstance(k.get("pos"), (list, tuple)) else k.get("threshold", 0) for k in kids]
        for name, (lo, hi) in param_ranges.items():
            if hi > max(xs) + eps or lo < min(xs) - eps:
                out.append({"severity": "warn", "code": "tree.param_outside_children", "path": name,
                            "message": "runtime range %s..%s exceeds the children (%s..%s): the edge pose holds while speed keeps rising" % (lo, hi, min(xs), max(xs))})
    return out


def layer_order_checks(layers):
    """layers: [{"name", "blending": "Override"|"Additive", "mask": bool, "weight": float}] in controller
    order (index 0 = base). Rules from iHeartGameDev W0eRZGS6dhQ: lower in the list wins [00:05:04];
    additive accumulation stops at the first Override [00:09:46]; an Override layer without a mask
    replaces the whole body [00:05:33]."""
    out = []
    for i, L in enumerate(layers):
        if i == 0:
            continue
        if L.get("blending") == "Override" and not L.get("mask"):
            out.append({"severity": "warn", "code": "layer.override_without_mask", "path": L["name"],
                        "message": "Override layer with no Avatar Mask replaces the whole body at weight > 0"})
        if L.get("blending") == "Override":
            below = [x["name"] for x in layers[1:i] if x.get("blending") == "Additive"]
            if below and not L.get("mask"):
                out.append({"severity": "warn", "code": "layer.override_cancels_additive", "path": L["name"],
                            "message": "unmasked Override above additive layers %s cancels them" % below})
    return out


def one_shot_blend(length, fraction=0.1, lo=0.1):
    """git-amend fQzKJO-0dS8 [00:07:58] [00:08:28]: blend = clamp(10% of the clip, 0.1 s, half the clip);
    the blend out starts at length - blend. Returns (blend_seconds, blend_out_start)."""
    b = min(max(fraction * length, lo), 0.5 * length)
    return b, length - b


def second_order_constants(f, zeta, r):
    """t3ssel8r KPoeNZZ6H4s [00:04:26]: k1 = zeta/(pi f), k2 = 1/(2 pi f)^2, k3 = r zeta/(2 pi f); stable
    with semi-implicit Euler only while T < sqrt(4 k2 + k1^2) - k1 [00:12:29]."""
    k1 = zeta / (math.pi * f)
    k2 = 1.0 / ((2 * math.pi * f) ** 2)
    k3 = r * zeta / (2 * math.pi * f)
    t_crit = math.sqrt(4 * k2 + k1 * k1) - k1
    return {"k1": k1, "k2": k2, "k3": k3, "t_critical": t_crit, "max_stable_fps": 1.0 / t_crit}


def simulate_second_order(f, zeta, r, dt_seq, x_seq, clamp=True):
    """Semi-implicit Euler of y + k1 y' + k2 y'' = x + k3 x' (1D). clamp=True raises k2 to the stable
    bound per step (k2 >= max(T^2/2 + T k1/2, T k1), the common implementation of [00:13:03])."""
    c = second_order_constants(f, zeta, r)
    k1, k2, k3 = c["k1"], c["k2"], c["k3"]
    y, yd, xp = x_seq[0], 0.0, x_seq[0]
    out = []
    for T, x in zip(dt_seq, x_seq):
        xd = (x - xp) / T
        xp = x
        k2s = max(k2, T * T / 2 + T * k1 / 2, T * k1) if clamp else k2
        y = y + T * yd
        yd = yd + T * (x + k3 * xd - y - k1 * yd) / k2s
        out.append(y)
    return out


def state_driven_checks(instructions):
    """instructions: [{"state", "camera", "wait", "min"}]. Unity CM3.1 (XTVzs4B1d7I [00:18:04];
    doc State-Driven): Min > 0 prevents thrash when states flicker; a state shorter than Wait never
    activates its camera."""
    out = []
    for ins in instructions:
        if ins.get("min", 0) <= 0:
            out.append({"severity": "warn", "code": "cm.state_driven_min_zero", "path": ins["state"],
                        "message": "Min 0: flickering animation states thrash the camera (use about 1 s)"})
    return out


def foot_slide(samples, contact_height=0.03):
    """samples: [{"t", "left": [x, y, z], "right": [x, y, z]}] world contact points (the lower of the foot
    and toes bones) at a fixed step (AnimSampler.LocomotionMetrics). A step counts as planted for a foot
    when its contact point is within contact_height of that foot's lowest height (5th percentile).
    Returns per-foot and overall p50 / p90 horizontal speed of planted contacts in m/s: near zero means
    planted feet [added metric; compare runs of the same clip, e.g. root motion vs a script speed]."""
    out, allv = {}, []
    for side in ("left", "right"):
        ys = sorted(s[side][1] for s in samples)
        floor = ys[int(0.05 * (len(ys) - 1))] if ys else 0.0
        vs = []
        for a, b in zip(samples, samples[1:]):
            dt = b["t"] - a["t"]
            if dt > 0 and (a[side][1] + b[side][1]) / 2 - floor < contact_height:
                vs.append(math.hypot(b[side][0] - a[side][0], b[side][2] - a[side][2]) / dt)
        vs.sort()
        allv += vs
        out[side] = {"planted_steps": len(vs), "p50": vs[len(vs) // 2] if vs else None,
                     "p90": vs[int(0.9 * (len(vs) - 1))] if vs else None}
    allv.sort()
    out["p50"] = allv[len(allv) // 2] if allv else None
    out["p90"] = allv[int(0.9 * (len(allv) - 1))] if allv else None
    return out


def sample_controller_spec(imports="Assets/AnimLab/Imports", path="Assets/AnimLab/Hero.controller"):
    """The live-test controller: Idle as its own state (Ketra Games mNxEetKzc04 [00:08:54]), a 2D
    Freeform Cartesian locomotion tree on (Speed m/s, TurnRate deg/s) placed from measured root motion
    (iHeartGameDev _J8RPIaO2Lc [00:09:09]: Cartesian for axes that are not directions), a jump reachable
    from Any State, and an upper-body Override layer with an Avatar Mask (W0eRZGS6dhQ [00:05:33])."""
    nav = imports + "/Nav-Accelerations.fbx::"
    return {
        "path": path,
        "parameters": [
            {"name": "Speed", "type": "Float"}, {"name": "TurnRate", "type": "Float"},
            {"name": "IsMoving", "type": "Bool"}, {"name": "Jump", "type": "Trigger"},
        ],
        "masks": [{"path": "Assets/AnimLab/UpperBody.mask",
                   "humanoid_off": ["Root", "LeftLeg", "RightLeg", "LeftFootIK", "RightFootIK"]}],
        "layers": [
            {"name": "Base Layer", "default_state": "Idle",
             "states": [
                 {"name": "Idle", "motion": imports + "/Turns_StartStop-Wk.fbx::Idle", "tag": "idle"},
                 {"name": "Locomotion", "tree": {"type": "FreeformCartesian2D", "param": "Speed", "param_y": "TurnRate",
                                                 "auto": "speed_angular_deg",
                                                 "children": [{"motion": nav + "Walk"}, {"motion": nav + "Jog"},
                                                              {"motion": nav + "TurnLeft"}, {"motion": nav + "TurnRight"}]}},
                 {"name": "JumpDown", "motion": imports + "/JumpDown-Sprt_St.fbx::JumpDown-Sprt_St"},
             ],
             "transitions": [
                 {"from": "Any", "to": "JumpDown", "conditions": [["Jump", "If"]], "duration": 0.1},
                 {"from": "Idle", "to": "Locomotion", "conditions": [["IsMoving", "If"]], "has_exit_time": False, "duration": 0.15},
                 {"from": "Locomotion", "to": "Idle", "conditions": [["IsMoving", "IfNot"]], "has_exit_time": False,
                  "duration": 0.2, "interruption": "Destination"},
                 {"from": "JumpDown", "to": "Idle", "exit_time": 0.9, "duration": 0.25},
             ]},
            {"name": "UpperBody", "weight": 0, "blending": "Override", "mask": "Assets/AnimLab/UpperBody.mask",
             "default_state": "Wave",
             "states": [{"name": "Wave", "motion": imports + "/Victory-anim1.fbx::Victory-anim1"}]},
        ],
        "hash_class": {"path": "Assets/AnimLab/Generated/HeroAnimIds.cs", "class": "HeroAnimIds"},
    }


def interruption_probe_spec(imports="Assets/AnimLab/Imports", path="Assets/AnimLab/Probes/Interrupt.controller",
                            interruption="Source", ordered=True):
    """A four-state controller that reproduces Catherine Proulx's worked example (Unity blog, transition
    interruptions): on state A (Idle) the transitions are, in priority order, A->C (GoC), A->B (GoB, 0.5 s, the one
    that may be interrupted), A->D (GoD). Fire GoB, then GoC or GoD in the middle of A->B (SampleStates events) and
    read which state wins. With Ordered Interruption only transitions ABOVE A->B can cut in; ties go to list order."""
    nav = imports + "/Nav-Accelerations.fbx::"
    return {
        "path": path,
        "parameters": [{"name": n, "type": "Trigger"} for n in ("GoB", "GoC", "GoD")],
        "layers": [{
            "name": "Base Layer", "default_state": "A",
            "states": [{"name": "A", "motion": imports + "/Turns_StartStop-Wk.fbx::Idle"},
                       {"name": "B", "motion": nav + "Walk"}, {"name": "C", "motion": nav + "Jog"},
                       {"name": "D", "motion": nav + "TurnLeft"}],
            "transitions": [
                {"from": "A", "to": "C", "conditions": [["GoC", "If"]], "duration": 0.2},
                {"from": "A", "to": "B", "conditions": [["GoB", "If"]], "duration": 0.5,
                 "interruption": interruption, "ordered_interruption": ordered},
                {"from": "A", "to": "D", "conditions": [["GoD", "If"]], "duration": 0.2},
            ]}],
    }


# ============================================================================ camera probe analysis
def jitter_metrics(vp_series, eps=1e-4):
    """vp_series: the tracked target's viewport position per frame [[x, y], ...] (CameraProbe with series=True).
    A smooth camera moves the target on screen in small steady steps; jitter shows as steps that reverse
    direction frame to frame. Returns step p50 / p95 (viewport units per frame), acceleration p95 (second
    difference) and the fraction of frames whose step reverses sign on either axis. [added metric: the docs
    digest (P7) prescribes the capture of consecutive frames, not a threshold; compare runs, e.g. before and
    after a Brain update-method change.]"""
    pts = [(float(p[0]), float(p[1])) for p in vp_series]
    steps = [(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])]
    mags = sorted(math.hypot(*s) for s in steps)
    acc = sorted(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(steps, steps[1:]))
    flips = sum(1 for a, b in zip(steps, steps[1:])
                if (a[0] * b[0] < 0 and min(abs(a[0]), abs(b[0])) > eps) or (a[1] * b[1] < 0 and min(abs(a[1]), abs(b[1])) > eps))

    def pct(xs, q):
        return xs[int(q * (len(xs) - 1))] if xs else None
    return {"frames": len(pts), "step_p50": pct(mags, 0.5), "step_p95": pct(mags, 0.95), "accel_p95": pct(acc, 0.95),
            "reversal_fraction": flips / max(1, len(steps) - 1)}


def camera_probe_checks(result, min_up_dot=0.95, min_distance_ratio=0.5):
    """Findings from an AnimCinemachine.CameraProbe result. up dot < 0.95: the camera rolled or pitched through
    vertical mid-blend (a flip). Closest approach below half the start/end distance [added threshold]: the blend
    swung through the target. Measured 2026-09-24 on two cameras 10 m apart on opposite sides of the hero: no
    hint 0.5 m and up dot 0.0; CylindricalPosition 5.02 m and 0.995; IgnoreTarget alone 0.5 m and 0.995 (it stops
    the rotation flip, not the swing)."""
    out = []
    rows = result.get("rows") or []
    if result.get("min_up_dot") is not None and result["min_up_dot"] < min_up_dot:
        out.append({"severity": "error", "code": "cm.blend_flip", "value": result["min_up_dot"],
                    "message": "camera up vector dropped to %.2f: it flipped or looked straight down mid-blend" % result["min_up_dot"],
                    "fix": "blend hint on both cameras: CylindricalPosition (or SphericalPosition) to orbit the target; IgnoreTarget only stops the rotation flip"})
    dists = [r.get("target_dist") for r in (rows[:1] + rows[-1:]) if r.get("target_dist")]
    if result.get("min_target_distance") is not None and dists:
        ref = min(dists)
        if ref > 0 and result["min_target_distance"] < min_distance_ratio * ref:
            out.append({"severity": "warn", "code": "cm.swing_through_target", "value": result["min_target_distance"],
                        "message": "camera passed %.2f m from the target (start/end %.2f m): the blend lerped through it" % (result["min_target_distance"], ref),
                        "fix": "CylindricalPosition or SphericalPosition blend hint, or a Cut"})
    if result.get("occluded_frames"):
        out.append({"severity": "warn", "code": "cm.target_occluded", "value": result["occluded_frames"],
                    "message": "target hidden by geometry on %d of %d frames (linecast camera to target)" % (result["occluded_frames"], result.get("frames", 0)),
                    "fix": "Deoccluder (Ignore Tag = player, glass on Transparent Layers) or Third Person Follow avoidance"})
    if result.get("inside_geometry_frames"):
        out.append({"severity": "warn", "code": "cm.camera_inside_geometry", "value": result["inside_geometry_frames"],
                    "message": "camera inside a collider on %d frames" % result["inside_geometry_frames"],
                    "fix": "raise Camera Radius; less collision damping (damping into collisions trades smoothness for clipping)"})
    return out


# ============================================================================ static scan of project C#
_SCAN_RULES = [
    # (code, severity, regex, message, fix)
    ("motion.delta_times_dt", "error", r"deltaPosition\s*\*\s*Time\.(?:deltaTime|fixedDeltaTime)",
     "animator.deltaPosition is already this frame's displacement: multiplying by deltaTime shrinks it",
     "Move(deltaPosition + Vector3.up * ySpeed * Time.deltaTime): scale only the computed vertical speed (mNxEetKzc04 [00:07:59])"),
    ("anim.string_parameter", "info", r"\b\w*[Aa]nim\w*\s*\.\s*(?:SetFloat|SetBool|SetTrigger|SetInteger|ResetTrigger|GetFloat|GetBool|Play|CrossFade|CrossFadeInFixedTime)\(\s*\"",
     "Animator call by string: a renamed parameter or state fails at runtime as \"Hash N does not exist\"",
     "Animator.StringToHash once, or the generated hash class (AnimControllerBuilder hash_class)"),
    ("cm.cm2_api", "error", r"using\s+Cinemachine\s*;|\bCinemachineVirtualCamera\b|\bCinemachineFreeLook\b|GetCinemachineComponent|CinemachineCore\.Instance",
     "Cinemachine 2 API: does not compile against Cinemachine 3", "Unity.Cinemachine, CinemachineCamera plus components (CM3 upgrade guide)"),
    ("input.legacy", "warn", r"\bInput\.(?:GetAxis|GetAxisRaw|GetKey|GetKeyDown|GetKeyUp|GetButton|GetButtonDown)\(",
     "legacy Input Manager call: 6.3 templates enable only the Input System", "read an Input System action"),
]


_CODE_ONLY = {"motion.delta_times_dt", "cm.cm2_api", "input.legacy"}   # matched with strings and comments blanked


def _strip_strings_comments(src):
    """src with the contents of string literals and comments replaced by spaces (same length and line breaks),
    so a rule does not fire on a class name quoted in a message or a comment."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i)); i = j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("".join(ch if ch == "\n" else " " for ch in src[i:j])); i = j
        elif c == '"':
            j = i + 1
            while j < n and src[j] != '"' and src[j] != "\n":
                j += 2 if src[j] == "\\" else 1
            out.append('"' + " " * (min(j, n) - i - 1) + ('"' if j < n else "")); i = j + 1
        else:
            out.append(c); i += 1
    return "".join(out)


def _method_bodies(src, name):
    """Bodies of methods called `name` (brace matched), for the few rules that look inside one method."""
    out = []
    for m in re.finditer(r"\b%s\s*\([^)]*\)\s*\{" % re.escape(name), src):
        i, depth = m.end(), 1
        while i < len(src) and depth:
            depth += {"{": 1, "}": -1}.get(src[i], 0)
            i += 1
        out.append(src[m.end():i - 1])
    return out


def scan_csharp(paths):
    """Static scan of project C# (files or folders) for the animation and camera traps the sources name, in code
    an agent writes or inherits. Returns findings with file and line. Heuristics, not a compiler: read each hit."""
    files = []
    for p in ([paths] if isinstance(paths, str) else paths):
        if os.path.isdir(p):
            for dp, _d, fs in os.walk(p):
                files += [os.path.join(dp, f) for f in fs if f.endswith(".cs")]
        elif p.endswith(".cs"):
            files.append(p)
    out = []

    def add(code, sev, path, src, pos, msg, fix):
        out.append({"severity": sev, "code": code, "path": "%s:%d" % (path, src.count("\n", 0, pos) + 1), "message": msg, "fix": fix})

    for path in sorted(files):
        with open(path, encoding="utf-8", errors="replace") as f:
            src = f.read()
        code_src = _strip_strings_comments(src)
        for code, sev, rx, msg, fix in _SCAN_RULES:
            for m in re.finditer(rx, code_src if code in _CODE_ONLY else src):
                add(code, sev, path, src, m.start(), msg, fix)
        editor = "/Editor/" in path.replace("\\", "/")
        if re.search(r":\s*AssetPostprocessor\b", src):
            pre = _method_bodies(src, "OnPreprocessModel") + _method_bodies(src, "OnPreprocessAnimation")
            if pre and not any(re.search(r"assetPath\s*\.\s*(?:StartsWith|Contains|IndexOf|EndsWith)|FindRules|Regex\.IsMatch\(\s*assetPath", b) for b in pre):
                add("import.unscoped_postprocessor", "warn", path, src, src.find("OnPreprocess"),
                    "import callbacks with no assetPath guard: every model in the project gets these settings",
                    "return early unless assetPath is under the character folder (or a rules file scopes it)")
            for b in _method_bodies(src, "OnPreprocessAnimation"):
                m = re.search(r"\.(?:name|takeName)\s*(?:\.\s*(?:Contains|StartsWith|EndsWith|IndexOf|ToLower|ToUpper|Equals)\s*\(|==)", b)
                if m:
                    add("import.role_from_take_name", "warn", path, src, src.find(b) + m.start(),
                        "clip settings chosen from the take name: every Mixamo take is named \"mixamo.com\", so all clips get the same flags",
                        "choose roles from the file name (Path.GetFileNameWithoutExtension(assetPath)) or explicit rules, then rename the clip")
            callbacks = [b for nm in ("OnPreprocessModel", "OnPreprocessAnimation", "OnPostprocessModel", "OnPostprocessAnimation")
                         for b in _method_bodies(code_src, nm)]
            for m in (mm for b in callbacks for mm in re.finditer(r"SaveAndReimport\s*\(|AssetDatabase\.ImportAsset\s*\(", b)):
                add("import.reimport_in_callback", "warn", path, src, code_src.find(m.string) + m.start(),
                    "reimport from an import postprocessor: recursive imports", "set importer fields in the callback; reapply from a job after the import; bump GetVersion() when rules change")
        for b in _method_bodies(src, "OnNotify"):
            if not re.search(r"\bis\s+[A-Z]\w*|\bas\s+[A-Z]\w*|GetType\(\)|switch\s*\(", b):
                add("timeline.notify_no_typecheck", "warn", path, src, src.find(b),
                    "OnNotify without a type check: a receiver gets EVERY marker notification routed to its GameObject",
                    "if (notification is MyMarker m) { ... } (gsEe0_o_934 [frame 00:22:57])")
        if "OnAnimatorMove" in src and any(re.search(r"\.Move\s*\(", b) for b in _method_bodies(src, "Update")) \
                and any(re.search(r"\.Move\s*\(", b) for b in _method_bodies(src, "OnAnimatorMove")):
            add("motion.two_moves", "error", path, src, src.find("OnAnimatorMove"),
                "CharacterController.Move in both Update and OnAnimatorMove: two systems fight over the displacement (jitter)",
                "one Move per frame in OnAnimatorMove: deltaPosition plus the scripted vertical speed (mNxEetKzc04 [00:07:21])")
        if not editor and "Animations.Rigging" in src and ".Build(" not in src:
            for m in re.finditer(r"\.(?:sourceObjects|constrainedObject|target)\s*=(?!=)", src):
                add("rig.runtime_rebind", "warn", path, src, m.start(),
                    "constraint data rebound at runtime: rig data is job data, the change is ignored until RigBuilder.Build (costly)",
                    "keep one target per constraint and move it (Htl7ysv10Qs [00:13:41])")
    return out
