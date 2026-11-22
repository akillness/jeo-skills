"""
ue_anim.py: toolkit of the scenario-unreal-animation skill (UE 5.8, macOS Apple Silicon).

Two layers in one file:

1. OFFLINE layer (system python3, stdlib only). Decisions and checks on plain data that the
   in-editor layer extracts (or that a test builds): transfer method from two hierarchies,
   biped retarget chain plan, chain map and op stack rules, skeletal import audit, animation
   content audit, clip classification, root motion and chest-over-root checks, speed parity,
   foot contact metrics, montage blend-out check, locomotion architecture decision, motion
   matching coverage (foot pairs) and database plan, project ini plan and writer (with backup), LOD,
   budget allocator, ML Deformer, MetaHuman, cloth and mocap filter checks; v0.2 adds mannequin bone
   map, Pose Search schema bone check, Pin Bones plan for IK bones, retarget log check, capsule match
   (clips authored against the movement model), root motion mode check (game-thread cost of BOTH
   extraction modes), Offset Root Bone modes and procedural node order, import defaults plan.
   Tested by tests/code/unreal-animation/test_anim_offline.py (passed offline, see SKILL.md).

2. IN-EDITOR layer (Editor Python inside UnrealEditor 5.8, `import unreal`).
   Probe, facts extraction (skeletal mesh, clips), character and animation import
   (Interchange first, legacy FbxImportUI fallback), root motion flags, curve stripping,
   IK Rig and IK Retargeter creation, batch retarget, Pose Search duplication and tagging,
   AnimBP flags and compile scan, montage blend-out, budget console, MetaHuman build,
   Sequencer bake, Control Rig creation, review sequence.
   STATUS: NOT YET RUN IN UNREAL (engine not installed on 2026-09-24). Names marked [verify]
   are resolved at run time by trying candidates; misses are logged in MISSES and
   job_00_anim_probe.py records the real names.

Shared toolkit (<skills>/scenario-unreal-expert/scripts, written by the lead agent): ue_run.run_python and
ue_run.result for headless jobs, ue_review.screenshot / render_still / image_checks for
captures, ue_stat for stat and trace parsing, ue_audit for generic asset rules, ue_env for the
engine, project and plugin edits. This module does not reimplement them.

Issue format everywhere: {"severity": "error"|"warn"|"info", "code": str, "message": str,
"source": str}. verdict(issues) summarizes a list.

No em dashes in this file (project rule).
"""
from __future__ import annotations

import json
import math
import os
import re
import shutil
import time
from pathlib import Path
from typing import List

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24; includes the refactor after the U5 blind grade)

# =============================================================================================
# 1. OFFLINE LAYER: constants (each with its source)
# =============================================================================================

# Mannequin IK helper bones that gameplay AnimBPs and Pin Bones ops expect (digest checklist [added]).
MANNEQUIN_IK_BONES = ("ik_foot_root", "ik_foot_l", "ik_foot_r", "ik_hand_root", "ik_hand_gun",
                      "ik_hand_l", "ik_hand_r")

# Maya helper curves Lake strips before import (N_suMyUuork [00:04:41]); the other blend* names
# are the same family of constraint blend attributes [added].
MAYA_HELPER_CURVE_RE = re.compile(r"^blend(Orient|Parent|Point|Aim|Scale)\d*$|blendOrient|blendParent",
                                  re.IGNORECASE)
# Face and twist or deformation joints Lake removes from body clips (N_suMyUuork [00:05:15]);
# the name patterns themselves are [added] heuristics.
TWIST_RE = re.compile(r"twist|roll(?!ing)|_corr|corrective|helper|_def$|bendy", re.IGNORECASE)
FACE_RE = re.compile(r"(^|[_:\.])(face|facial|jaw|eye|eyelid|lid|lip|brow|cheek|nose|tongue|teeth|"
                     r"mouth|chin|ear|forehead|nasolabial|FACIAL_)", re.IGNORECASE)

# Default ops added by "Add Default Ops" in the 5.8 IK Retargeter (retargeting doc).
RETARGET_DEFAULT_OPS = ("Pelvis Motion", "FK Chains", "Run IK Rig", "Root Motion", "Remap Curves")
RETARGET_SINGLE_INSTANCE_OPS = ("Scale Source", "Retarget Pose")
# Top-level ops whose per-op LOD threshold matters at runtime ([added] list). Blend to Source, Offset
# Goals, Scale Goals, Floor Constraint, Speed Plant and Stride Warp are SUB-ops of Run IK Rig in 5.8
# (retargeting doc, Sub-operations List): their cost is skipped through the Run IK Rig threshold.
RETARGET_COSTLY_OPS = ("Run IK Rig", "Filter Bones", "Stretch Chains")
RETARGET_IK_SUB_OPS = ("Blend to Source", "Offset Goals", "Scale Goals", "Floor Constraint", "Speed Plant",
                       "Stride Warp", "Relative IK Retarget", "Body Intersect Goals")

# Bone each mannequin IK helper bone follows, for the retargeter Pin Bones op ([added]: mannequin
# convention; the doc example pins ik_hand_weapon to hand_r). Gameplay IK (GASP leg IK, weapon IK)
# reads these bones, so they must keep following the retargeted limbs (IK Rig doc, Pin Bones).
MANNEQUIN_IK_FOLLOW = {"ik_foot_root": "root", "ik_foot_l": "foot_l", "ik_foot_r": "foot_r",
                       "ik_hand_root": "root", "ik_hand_gun": "hand_r", "ik_hand_l": "hand_l", "ik_hand_r": "hand_r"}

# Bones Pose Search reads by name on the mannequin: the default schema Pose channel (motion matching
# doc: foot_l, foot_r) and GASP's Pose History (feet, thighs, pelvis and a spine bone, GASP
# mhVp_cC9MLc [00:19:29], tNw9lD2PW3U [00:09:15]; which spine bone is [verify], so it is not listed).
DEFAULT_POSE_CHANNEL_BONES = ("foot_l", "foot_r")
GASP_POSE_HISTORY_BONES = ("foot_l", "foot_r", "thigh_l", "thigh_r", "pelvis")

# Offset Root Bone modes per movement state (GASP mhVp_cC9MLc [01:51:44]-[01:55:09]; motion matching doc,
# GASP functions): translation Interpolate moving on ground, Release when stopped, falling or in a montage;
# rotation Accumulate (turn in place, rotational starts), Release in montages. Radius about 30 cm.
OFFSET_ROOT_BONE_MODES = {
    "moving_ground": {"translation": "Interpolate", "rotation": "Accumulate"},
    "stopped": {"translation": "Release", "rotation": "Accumulate"},
    "falling": {"translation": "Release", "rotation": "Accumulate"},
    "montage": {"translation": "Release", "rotation": "Release"},
}
OFFSET_ROOT_RADIUS_CM = 30.0
STEERING_FACING_AHEAD_S = 0.5   # desired facing sampled 0.5 s ahead on the trajectory (tNw9lD2PW3U [00:29:50])
CAPSULE_STOP_FRAMES = 5         # GASP capsule stop, body overshoots and settles after (mhVp_cC9MLc [00:27:38])

# Retarget chains a 5.8 biped template produces (release notes: Leg ends at the ankle, Foot covers
# ball and toe). Names follow the IK_Mannequin convention [verify against the shipped IK Rig].
BIPED_REQUIRED_CHAINS = ("Spine", "Neck", "Head", "LeftClavicle", "RightClavicle", "LeftArm", "RightArm",
                         "LeftLeg", "RightLeg", "LeftFoot", "RightFoot")

# GASP movement speeds in cm/s (Fortnite capture): walk about 2, strafe 3.5, run 5 m/s
# (mhVp_cC9MLc [01:27:17]).
GASP_SPEEDS_CM_S = {"walk": 200.0, "strafe": 350.0, "run": 500.0}

# Budget allocator per ViewDistanceQuality (AnimBP doc, Budget Allocator: DefaultScalability.ini).
BUDGET_MS_BY_VIEW_DISTANCE = {0: 1.0, 1: 1.5, 2: 2.0, 3: 2.5}

# FBIK values for foot IK on a mannequin-like skeleton (Control Rig doc, Bone Settings and
# Node Reference) and the 5.8 auto-setup defaults (release notes).
FBIK_MANNEQUIN = {
    "root_bone": "pelvis",
    "pelvis_rotation_stiffness": 0.8, "pelvis_position_stiffness": 0.8,
    "knee_preferred_angle": {"axis": "Z", "degrees": 45.0},
    "ankle_limit_degrees": (-70.0, 70.0),
    "root_behavior": "Pin to Input",           # low-distance partial-body setups (doc)
    "start_solve_from_input_pose": True,
    "mass_multiplier_range": (0.0, 5.0),
    "auto_setup_sub_iterations": 10, "auto_setup_goal_chain_depth": 2,
    "source": "Control Rig doc (FBIK Bone Settings, Node Reference); 5.8 release notes (auto setup)",
}

# ML Deformer data rules (ML Deformer doc, Troubleshooting; OmMi6E0EkQw).
ML_MIN_FRAMES, ML_GOOD_FRAMES = 3000, 7500
ML_MORPHS_TOTAL = (64, 256)
ML_LOCAL_MORPHS_PER_BONE = (4, 12)

# MetaHuman platform table (MetaHuman doc, Platform Support).
METAHUMAN_PLATFORMS = {
    "pc": {"strands": True, "best_lod": 0, "max_texture": 8192},
    "mac": {"strands": False, "best_lod": 0, "max_texture": 8192},
    "mobile": {"strands": False, "best_lod": 3, "max_texture": 2048},
    "console": {"strands": True, "best_lod": 0, "max_texture": 8192},  # [added] PC-like; DeVoe starts LOD 2 on PS5-class
}

# Minimal motion matching set, DeVoe FLDXtAV7qsw slide 00:11:14 and the database asset list at
# [00:11:31]. He counts 13; the on-screen list shows these 12 items.
MM_MIN_NON_STRAFING = (
    ("idle_loop", {"move": "idle", "phase": "loop"}),
    ("run_loop_f", {"move": "run", "phase": "loop", "dir": "F"}),
    ("run_start_l", {"move": "run", "phase": "start", "foot": "L"}),
    ("run_start_r", {"move": "run", "phase": "start", "foot": "R"}),
    ("run_stop_l", {"move": "run", "phase": "stop", "foot": "L"}),
    ("run_stop_r", {"move": "run", "phase": "stop", "foot": "R"}),
    ("run_arc_l", {"move": "run", "phase": "arc", "side": "L"}),
    ("run_arc_r", {"move": "run", "phase": "arc", "side": "R"}),
    ("reface_090_l", {"move": "run", "phase": "reface", "angle": 90, "foot": "L"}),
    ("reface_090_r", {"move": "run", "phase": "reface", "angle": 90, "foot": "R"}),
    ("reface_180_l", {"move": "run", "phase": "reface", "angle": 180, "foot": "L"}),
    ("reface_180_r", {"move": "run", "phase": "reface", "angle": 180, "foot": "R"}),
)

SEV_ORDER = {"error": 0, "warn": 1, "info": 2}


def _issue(sev, code, msg, source=""):
    return {"severity": sev, "code": code, "message": msg, "source": source}


def verdict(issues):
    """Summarize a list of issues: ok when no error. Returns counts and the sorted list."""
    issues = [i for i in (issues or []) if i]
    issues.sort(key=lambda i: (SEV_ORDER.get(i.get("severity"), 3), i.get("code", "")))
    n = {s: sum(1 for i in issues if i.get("severity") == s) for s in ("error", "warn", "info")}
    return {"ok": n["error"] == 0, "errors": n["error"], "warnings": n["warn"], "infos": n["info"],
            "issues": issues}


# =============================================================================================
# 2. OFFLINE LAYER: hierarchy helpers
# =============================================================================================

def short_name(bone):
    """Strip a DCC namespace (mixamorig:Hips -> Hips) and path separators."""
    b = str(bone)
    for sep in (":", "|", "/"):
        if sep in b:
            b = b.rsplit(sep, 1)[1]
    return b


_SIDE_PATTERNS = (
    (re.compile(r"(^|[_\.\s])(l|lf|lft)$", re.I), "L"), (re.compile(r"(^|[_\.\s])(r|rt|rgt)$", re.I), "R"),
    (re.compile(r"^(l|lf)[_\.]", re.I), "L"), (re.compile(r"^(r|rt)[_\.]", re.I), "R"),
    (re.compile(r"left", re.I), "L"), (re.compile(r"right", re.I), "R"),
    (re.compile(r"[_\.](l|L)[_\.]"), "L"), (re.compile(r"[_\.](r|R)[_\.]"), "R"),
)


def side_of(bone):
    """'L', 'R' or '' from common naming (foot_l, L_ankle_jnt, LeftFoot, Foot.L)."""
    n = short_name(bone)
    core = re.sub(r"[_\.](jnt|joint|bnd|bind|skin|jj)$", "", n, flags=re.I)
    for pat, side in _SIDE_PATTERNS:
        if pat.search(core):
            return side
    return ""


def children_map(parents):
    ch = {}
    for b, p in parents.items():
        ch.setdefault(p, []).append(b)
    return ch


def ancestors(parents, bone):
    out, seen = [], set()
    p = parents.get(bone)
    while p is not None and p not in seen:
        out.append(p)
        seen.add(p)
        p = parents.get(p)
    return out


def chain_between(parents, start, end):
    """Bones from start to end following parents (end must descend from start), else None."""
    path = [end]
    cur = end
    seen = set()
    while cur != start:
        cur = parents.get(cur)
        if cur is None or cur in seen:
            return None
        seen.add(cur)
        path.append(cur)
    return list(reversed(path))


def roots_of(bones, parents):
    return [b for b in bones if parents.get(b) in (None, "", "None")]


# =============================================================================================
# 3. OFFLINE LAYER: transfer method (Greg Richardson's ladder, -8CQNaODNNA [00:01:06]-[00:06:04])
# =============================================================================================

def transfer_method(source, target, copy_pose_threshold=0.9):
    """Decide how motion should reach the target before building any retargeter.

    source / target: {"skeleton": asset path (optional), "bones": [...], "parents": {bone: parent}}.
    Ladder (Richardson): same Skeleton asset -> translation retargeting modes on the Skeleton;
    target contains the source hierarchy with the same parents -> compatible skeletons (no nodes),
    Copy Pose From Mesh or Leader Pose at runtime; high name overlap -> Copy Pose From Mesh with the
    caveat that unmatched bones stay at reference pose and translation retargeting is ignored;
    otherwise IK Rig + IK Retargeter. copy_pose_threshold is an [added] default.
    """
    sb, tb = list(source.get("bones", [])), list(target.get("bones", []))
    sp, tp = dict(source.get("parents", {})), dict(target.get("parents", {}))
    tset = set(tb)
    shared = [b for b in sb if b in tset]
    frac = len(shared) / float(len(sb)) if sb else 0.0
    missing = [b for b in sb if b not in tset]
    extra = [b for b in tb if b not in set(sb)]
    parent_mismatch = [b for b in shared if sp.get(b) != tp.get(b)]
    out = {"shared_fraction": round(frac, 4), "missing_in_target": missing[:50],
           "extra_in_target": extra[:50], "parent_mismatches": parent_mismatch[:50],
           "source": "Richardson -8CQNaODNNA [00:01:06]-[00:06:04]"}
    if source.get("skeleton") and source.get("skeleton") == target.get("skeleton"):
        out.update(method="same_skeleton",
                   reason="one Skeleton asset: set translation retargeting modes (Skeleton, Animation, "
                          "Animation Scaled) and the retarget source, no duplicated animation")
        return out
    if sb and not missing and not parent_mismatch:
        out.update(method="compatible_skeleton",
                   reason="target contains the whole source hierarchy with the same parents: add it to "
                          "Compatible Skeletons (clips play with no nodes), Copy Pose From Mesh or Leader "
                          "Pose at runtime; extra target bones stay procedural or post-process")
        return out
    if frac >= copy_pose_threshold and len(parent_mismatch) <= max(1, int(0.02 * len(shared))):
        out.update(method="copy_pose_from_mesh",
                   reason="%.0f%% of source bones match by name: Copy Pose From Mesh works if the missing "
                          "bones may stay at reference pose; it ignores translation retargeting. Use an IK "
                          "Retargeter if proportions differ or contact matters" % (100 * frac))
        return out
    out.update(method="ik_retargeter",
               reason="different hierarchies (%.0f%% name overlap): IK Rig on both sides plus an IK "
                      "Retargeter" % (100 * frac))
    return out


# =============================================================================================
# 4. OFFLINE LAYER: biped retarget chain plan (manual fallback when the auto template fails)
# =============================================================================================

_KW = {
    "pelvis": re.compile(r"pelvis|^hips?$|hips|^cog$|bip\d*$", re.I),
    "spine": re.compile(r"spine|chest|torso|back", re.I),
    "neck": re.compile(r"neck", re.I),
    "head": re.compile(r"^head$|head(?!_?(end|top|tip|nub))", re.I),
    "clavicle": re.compile(r"clavicle|collar|shoulder|scapula", re.I),
    "upperarm": re.compile(r"upper_?arm|uparm|humerus|(^|[_\.])arm(?!.*(fore|lower|low))|leftarm$|rightarm$", re.I),
    "lowerarm": re.compile(r"lower_?arm|forearm|lowarm|elbow|radius", re.I),
    "hand": re.compile(r"hand(?!.*(thumb|index|middle|ring|pinky|finger))|wrist", re.I),
    "thigh": re.compile(r"thigh|upleg|upper_?leg|femur|(^|[_\.])hip", re.I),
    "calf": re.compile(r"calf|shin|knee|lower_?leg|lowleg|(^|[_\.])leg(?!.*up)|leftleg$|rightleg$", re.I),
    "foot": re.compile(r"foot(?!.*(root|ik))|ankle", re.I),
    "ball": re.compile(r"ball|toebase|toe_?base|(^|[_\.])toes?(?!.*end)", re.I),
}
_FINGERS = ("thumb", "index", "middle", "ring", "pinky")


def _is_helper(b):
    n = short_name(b).lower()
    return bool(TWIST_RE.search(n)) or n.startswith("ik_") or "ik_" in n or n.endswith(("_end", "end", "nub", "tip"))


def _find(bones, key, side=None, exclude=()):
    out = []
    for b in bones:
        n = short_name(b)
        if b in exclude or _is_helper(b):
            continue
        if _KW[key].search(n) and (side is None or side_of(b) == side):
            out.append(b)
    return out


def _depth(parents, b):
    return len(ancestors(parents, b))


def biped_chain_plan(bones, parents):
    """Heuristic IK Rig chain plan for a biped from bone names and parents.

    Uses the 5.8 template layout (release notes): LeftLeg thigh to ankle, LeftFoot ball to toe;
    IK goals stay on the leg chains at the ankle. Chain names follow IK_Mannequin [verify].
    Returns {"pelvis", "chains": [{name, start, end, goal}], "unresolved": [...]}. It is a
    fallback for custom names (Maya L_hip_jnt, Mixamo LeftUpLeg) when the auto template fails;
    check the result with chain_map_check and in the IK Rig viewport.
    """
    bones = [b for b in bones]
    center = [b for b in bones if side_of(b) == ""]
    unresolved = []
    pel = sorted(_find(center, "pelvis"), key=lambda b: _depth(parents, b))
    pelvis = pel[0] if pel else None
    if pelvis is None:
        unresolved.append("pelvis")
    chains = []

    def add(name, start, end, goal=None):
        if start and end and chain_between(parents, start, end):
            chains.append({"name": name, "start": start, "end": end, "goal": goal})
        else:
            unresolved.append(name)

    spines = sorted(_find(center, "spine"), key=lambda b: _depth(parents, b))
    spines = [s for s in spines if pelvis is None or pelvis in ancestors(parents, s)]
    necks = sorted(_find(center, "neck"), key=lambda b: _depth(parents, b))
    heads = sorted(_find(center, "head"), key=lambda b: _depth(parents, b))
    if spines:
        add("Spine", spines[0], spines[-1])
    else:
        unresolved.append("Spine")
    if necks:
        add("Neck", necks[0], necks[-1])
    else:
        unresolved.append("Neck")
    if heads:
        add("Head", heads[0], heads[0])
    else:
        unresolved.append("Head")
    for side, word in (("L", "Left"), ("R", "Right")):
        cl = sorted(_find(bones, "clavicle", side), key=lambda b: _depth(parents, b))
        ua = sorted(_find(bones, "upperarm", side, exclude=cl), key=lambda b: _depth(parents, b))
        hd = sorted(_find(bones, "hand", side), key=lambda b: _depth(parents, b))
        th = sorted(_find(bones, "thigh", side), key=lambda b: _depth(parents, b))
        ft = sorted(_find(bones, "foot", side), key=lambda b: _depth(parents, b))
        bl = sorted(_find(bones, "ball", side, exclude=ft), key=lambda b: _depth(parents, b))
        if cl:
            add(word + "Clavicle", cl[0], cl[0])
        else:
            unresolved.append(word + "Clavicle")
        arm_start = next((u for u in ua if not cl or cl[0] in ancestors(parents, u)), ua[0] if ua else None)
        hand = next((h for h in hd if arm_start and arm_start in ancestors(parents, h)), None)
        add(word + "Arm", arm_start, hand, goal=word + "HandIK" if hand else None)
        thigh = th[0] if th else None
        foot = next((f for f in ft if thigh and thigh in ancestors(parents, f)), None)
        add(word + "Leg", thigh, foot, goal=word + "FootIK" if foot else None)
        ball = next((b for b in bl if foot and foot in ancestors(parents, b)), None)
        if ball:
            kids = children_map(parents)
            toe = ball
            while True:
                nxt = [c for c in kids.get(toe, []) if not _is_helper(c)]
                if len(nxt) != 1:
                    break
                toe = nxt[0]
            add(word + "Foot", ball, toe)
        else:
            unresolved.append(word + "Foot")
        if hand:
            kids = children_map(parents)
            for f in _FINGERS:
                starts = [c for c in bones if f in short_name(c).lower() and side_of(c) == side
                          and hand in ancestors(parents, c) and not _is_helper(c)]
                if not starts:
                    continue
                starts.sort(key=lambda b: _depth(parents, b))
                s = starts[0]
                e = s
                while True:
                    nxt = [c for c in kids.get(e, []) if f in short_name(c).lower() and not _is_helper(c)]
                    if not nxt:
                        break
                    e = nxt[0]
                add(word + f.capitalize(), s, e)
    return {"pelvis": pelvis, "chains": chains, "unresolved": unresolved,
            "source": "5.8 release notes (biped templates); IK Rig doc (chains start to end); [added] name heuristics"}


def chain_map_check(target_chains, source_chains=None, mapping=None, need_contact=True,
                    required=BIPED_REQUIRED_CHAINS):
    """Rules for an IK Rig chain set and a retargeter chain map (retargeting doc; digest checklist).

    target_chains: [{name, start, end, goal}] or names. mapping: {target_chain: source_chain or None}.
    """
    iss = []
    names = [c["name"] if isinstance(c, dict) else c for c in (target_chains or [])]
    byname = {(c["name"] if isinstance(c, dict) else c): c for c in (target_chains or [])}
    for r in required or ():
        if r not in names:
            sev = "warn" if r in ("LeftFoot", "RightFoot", "LeftClavicle", "RightClavicle") else "error"
            iss.append(_issue(sev, "C01", "target IK Rig has no %s chain" % r, "retargeting doc; 5.8 templates"))
    dups = sorted(set(n for n in names if names.count(n) > 1))
    if dups:
        iss.append(_issue("error", "C02", "duplicate chain names %s" % dups, "IK Rig doc"))
    if need_contact:
        for leg in ("LeftLeg", "RightLeg"):
            c = byname.get(leg)
            if isinstance(c, dict) and not c.get("goal"):
                iss.append(_issue("error", "C03", "%s has no IK goal: Blend to Source, Floor Constraint and "
                                  "Stride Warp need it" % leg, "retargeting doc, Chain Creation"))
    if mapping is not None:
        src = set(source_chains or [])
        for t in names:
            s = mapping.get(t)
            if s in (None, "", "None"):
                sev = "warn" if re.search(r"Thumb|Index|Middle|Ring|Pinky", t) else "error"
                iss.append(_issue(sev, "C04", "target chain %s mapped to None" % t, "digest checklist"))
            elif src and s not in src:
                iss.append(_issue("error", "C05", "target chain %s maps to unknown source chain %s" % (t, s), ""))
    return verdict(iss)


def mannequin_bone_map(bones, parents):
    """Map mannequin bone names to a custom skeleton's bones from its biped chain plan.

    Used to remap everything that names mannequin bones after a retarget: duplicated Pose Search schema
    channels and Pose History bones (motion matching doc, 'Skeleton not the mannequin'), Pin Bones
    targets, chest-over-root checks (spine_05 on the mannequin, DeVoe FLDXtAV7qsw [00:10:12]).
    Works for Maya (L_hip_jnt), Mixamo (LeftUpLeg), Blender (thigh.L) names through biped_chain_plan.
    Returns {"map": {mannequin_bone: target_bone}, "unresolved": [...]}. [added] heuristics: read it."""
    plan = biped_chain_plan(bones, parents)
    ch = {c["name"]: c for c in plan["chains"]}
    m, unresolved = {}, []
    roots = roots_of(list(bones), parents)
    if roots:
        m["root"] = roots[0]
    if plan.get("pelvis"):
        m["pelvis"] = plan["pelvis"]
    if "Spine" in ch:
        m["spine_01"], m["spine_05"] = ch["Spine"]["start"], ch["Spine"]["end"]
    if "Neck" in ch:
        m["neck_01"] = ch["Neck"]["start"]
    if "Head" in ch:
        m["head"] = ch["Head"]["start"]

    def middle(start, end):
        path = chain_between(parents, start, end) or []
        return path[1] if len(path) >= 3 else None

    for side, word in (("l", "Left"), ("r", "Right")):
        if word + "Clavicle" in ch:
            m["clavicle_" + side] = ch[word + "Clavicle"]["start"]
        arm = ch.get(word + "Arm")
        if arm:
            m["upperarm_" + side], m["hand_" + side] = arm["start"], arm["end"]
            mid = middle(arm["start"], arm["end"])
            if mid:
                m["lowerarm_" + side] = mid
        leg = ch.get(word + "Leg")
        if leg:
            m["thigh_" + side], m["foot_" + side] = leg["start"], leg["end"]
            mid = middle(leg["start"], leg["end"])
            if mid:
                m["calf_" + side] = mid
        if word + "Foot" in ch:
            m["ball_" + side] = ch[word + "Foot"]["start"]
    wanted = ("root", "pelvis", "spine_01", "spine_05", "neck_01", "head") + tuple(
        "%s_%s" % (b, s) for s in "lr" for b in ("clavicle", "upperarm", "lowerarm", "hand", "thigh", "calf", "foot", "ball"))
    unresolved = [w for w in wanted if w not in m]
    return {"map": m, "unresolved": unresolved,
            "source": "biped_chain_plan; motion matching doc (Mistakes and fixes); [added] mapping"}


def ik_bone_pin_plan(target_bones, bone_map=None, needed=MANNEQUIN_IK_BONES):
    """Pin Bones pairs that keep mannequin IK helper bones following the retargeted limbs.

    Gameplay IK that reads ik_foot_l/r (GASP leg IK) or ik_hand_gun (weapon IK) breaks after a retarget if
    those bones stay at reference pose (IK Rig doc, Pin Bones; rigging digest 7). The retargeter can only pin
    bones that exist on the target: missing ones are added in the DCC (scenario-maya-rigging, scenario-blender-rigging) or the
    5.8 Skeletal Editor first. bone_map: mannequin -> target names (mannequin_bone_map). Pairs are [added]
    from the mannequin convention; check each in the viewport."""
    names = set(short_name(b) for b in target_bones)
    bmap = dict((bone_map or {}).get("map", bone_map or {}))
    pins, missing = [], []
    for ik in needed:
        follow = MANNEQUIN_IK_FOLLOW.get(ik)
        if ik not in names:
            missing.append(ik)
            continue
        tgt = bmap.get(follow, follow)
        pins.append({"bone_to_pin": ik, "follow": tgt, "space": "global (copy position and rotation)",
                     "ok": tgt in names})
    return {"pins": pins, "missing_on_target": missing,
            "note": "add missing IK bones in the DCC or the Skeletal Editor before pinning" if missing else "",
            "source": "IK Rig doc (Pin Bones); rigging digest 7; [added] mannequin follow map"}


# =============================================================================================
# 5. OFFLINE LAYER: retarget op stack rules (retargeting doc; Richardson [00:24:13]-[00:34:56])
# =============================================================================================

def op_stack_check(ops, proportions_differ=False, runtime=False, auto_generated=False,
                   batch_with_overrides=False, target_ik_bones=None, profile_ops_us=None):
    """ops: [{"type": "Pelvis Motion", "name": opt, "enabled": bool, "settings": {...},
    "sub_ops": [{"type": "Blend to Source", "enabled": bool, "chains": [...]}], "lod_threshold": int}]
    in stack order (top first). target_ik_bones: mannequin IK bones present on the target that gameplay
    reads (then a Pin Bones op is expected). profile_ops_us: {op: microseconds} from Profile Ops, expected
    for any retargeter that runs at runtime (retargeting doc, Asset Settings)."""
    iss = []
    types = [o.get("type") for o in ops]
    seq = []   # top-level ops and Run IK Rig sub-ops in evaluation order
    for o in ops:
        seq.append(o.get("type"))
        seq.extend(s.get("type") for s in (o.get("sub_ops") or []))
    for t in RETARGET_SINGLE_INSTANCE_OPS:
        if types.count(t) > 1:
            iss.append(_issue("error", "R01", "%d %s ops; only one is allowed" % (types.count(t), t), "retargeting doc"))
    if "Retarget Pose" in types and types.index("Retarget Pose") != 0:
        iss.append(_issue("error", "R02", "Retarget Pose op must be first in the stack", "retargeting doc, Retarget Pose"))
    if "Scale Source" in types:
        want = 1 if types and types[0] == "Retarget Pose" else 0
        if types.index("Scale Source") != want:
            iss.append(_issue("warn", "R03", "Scale Source works best at the top of the stack (after a Retarget "
                              "Pose op if any) and scales the Blend to Source goals", "retargeting doc; Richardson [00:29:14]"))
    for t in RETARGET_DEFAULT_OPS:
        if t not in types:
            sev = "error" if t in ("FK Chains", "Run IK Rig") else "warn"
            iss.append(_issue(sev, "R04", "missing default op %s (Add Default Ops)" % t, "retargeting doc, Operations List"))
    ik = [o for o in ops if o.get("type") == "Run IK Rig"]
    if ik and not all(o.get("enabled", True) for o in ik):
        msg = "Run IK Rig disabled"
        if auto_generated:
            msg += ": auto-retarget exports have IK disabled, enable it yourself"
        iss.append(_issue("error", "R05", msg, "Richardson [00:21:26]"))
    if proportions_differ and ik:
        subs = [s for o in ik for s in (o.get("sub_ops") or [])]
        bts = [s for s in subs if s.get("type") == "Blend to Source" and s.get("enabled", True)]
        if not bts:
            iss.append(_issue("error", "R06", "no Blend to Source sub-op on Run IK Rig: feet sink into the floor on "
                              "different proportions", "Richardson [00:16:29]"))
        else:
            chains = set(c for s in bts for c in (s.get("chains") or ["LeftLeg", "RightLeg"]))
            if not {"LeftLeg", "RightLeg"} <= chains:
                iss.append(_issue("warn", "R07", "Blend to Source not on both leg chains", "Richardson [00:16:29]"))
        if not any(s.get("type") == "Floor Constraint" and s.get("enabled", True) for s in subs):
            iss.append(_issue("info", "R08", "consider the 5.8 Floor Constraint sub-op (foot and toe definition) "
                              "and the Pelvis Motion floor constraint for shorter characters", "5.8 retargeting doc"))
        for o in ops:
            if o.get("type") == "Stride Warp" or any(s.get("type") == "Stride Warp" for s in (o.get("sub_ops") or [])):
                sw = [s for s in (o.get("sub_ops") or []) if s.get("type") == "Stride Warp"] or [o]
                for s in sw:
                    if any("Arm" in c for c in (s.get("chains") or [])):
                        iss.append(_issue("warn", "R09", "Stride Warp on arm chains; restrict it to legs",
                                          "Richardson [00:17:02]"))
    if "Relative IK Retarget" in seq and "Body Intersect Goals" in seq:
        if seq.index("Relative IK Retarget") > seq.index("Body Intersect Goals"):
            iss.append(_issue("error", "R10", "Relative IK Retarget must come before Body Intersect Goals or it is "
                              "overwritten", "retargeting doc"))
    fk_idx = [i for i, t in enumerate(types) if t == "FK Chains"]
    for post in ("Pin Bones", "Root Motion"):
        if post in types and fk_idx and types.index(post) < fk_idx[0]:
            iss.append(_issue("warn", "R11", "%s runs before FK Chains; post ops belong after FK and IK" % post,
                              "Richardson [00:17:36]"))
    for o in ops:
        if o.get("type") == "FK Chains":
            mode = (o.get("settings") or {}).get("translation_mode")
            if mode not in (None, "None"):
                iss.append(_issue("info", "R12", "FK translation mode %s; None is best in most cases" % mode,
                                  "retargeting doc, FK Chain Retarget"))
        if o.get("type") == "Root Motion":
            src = (o.get("settings") or {}).get("root_motion_source")
            if not src:
                iss.append(_issue("warn", "R13", "Root Motion op without an explicit source (Copy From Source Root "
                                  "for mannequin locomotion, Generate From Target Pelvis for mocap)", "retargeting doc"))
    if runtime:
        for o in ops:
            if o.get("type") in RETARGET_COSTLY_OPS and o.get("lod_threshold") in (None, -1):
                iss.append(_issue("warn", "R14", "runtime retargeter: set an LOD threshold on %s (sub-ops such as "
                                  "Speed Plant or Floor Constraint are skipped through it)" % o.get("type"),
                                  "5.7 release notes; retargeting doc, Retargeting Stack Framework"))
        if profile_ops_us is None:
            iss.append(_issue("warn", "R17", "runtime retargeter without Profile Ops timings: enable Profile Ops "
                              "(Asset Settings) and record microseconds per op on the target",
                              "retargeting doc, Asset Settings"))
    if batch_with_overrides and auto_generated:
        iss.append(_issue("error", "R15", "batch retarget with override sets needs an existing (hand-built) "
                          "retargeter, not an auto-generated one", "retargeting doc, Export Overrides"))
    if target_ik_bones and "Pin Bones" not in types:
        iss.append(_issue("warn", "R16", "target has IK helper bones %s that gameplay IK reads, but no Pin Bones op: "
                          "they stay at reference pose after retarget (ik_bone_pin_plan)" % list(target_ik_bones)[:7],
                          "IK Rig doc, Pin Bones; rigging digest 7"))
    return verdict(iss)


def retarget_log_check(lines):
    """Scan Retarget Output Log (or editor log) lines for retarget warnings and errors. The Output Log must be
    clean after swapping preview meshes; incompatibilities print there (retargeting doc, Asset Settings).
    Category names in the saved log are [verify]; the panel is Window > Retarget Output Log."""
    iss = []
    pat_topic = re.compile(r"IKRig|IK Rig|Retarget", re.I)
    pat_sev = re.compile(r"\b(Warning|Error)\b", re.I)
    hits = [str(l).strip() for l in (lines or []) if pat_topic.search(str(l)) and pat_sev.search(str(l))]
    for h in hits[:50]:
        sev = "error" if re.search(r"\bError\b", h, re.I) else "warn"
        iss.append(_issue(sev, "O01", h[:300], "retargeting doc, Asset Settings (Retarget Output Log)"))
    out = verdict(iss)
    out["lines_flagged"] = len(hits)
    return out


# =============================================================================================
# 6. OFFLINE LAYER: skeletal import audit
# =============================================================================================

def import_audit(facts, bone_budget=None, expects_ik_bones=False, hero=False, root_tol_cm=0.01):
    """facts (from skeletal_mesh_facts or a test): bones, parents, weighted_bones (optional),
    max_influences (per LOD list or int), unlimited_influences (project setting, optional),
    high_precision_weights, morph_target_count, lod_count, root_location, root_rotation,
    height_cm, physics_asset, skeleton.
    Sources: Biava XYMad1EutcA [00:02:30]-[00:05:09] (influences, unused bones), Maya contract
    (scenario-maya-rigging game_skeleton_check), DeVoe tTgMafRAM7A [00:28:28] (about 12 for non-hero)."""
    iss = []
    bones = list(facts.get("bones") or [])
    parents = dict(facts.get("parents") or {})
    info = {"bone_count": len(bones)}
    roots = roots_of(bones, parents) if parents else []
    if parents and len(roots) != 1:
        iss.append(_issue("error", "I01", "%d root bones %s; the skeletal mesh pivot is its one root" % (len(roots), roots[:5]),
                          "FBX skeletal pipeline, Pivot Point"))
    names = [short_name(b) for b in bones]
    if any(":" in str(b) for b in bones):
        iss.append(_issue("error", "I02", "namespaces in bone names", "scenario-maya-rigging game_skeleton_check"))
    dups = sorted(set(n for n in names if names.count(n) > 1))
    if dups:
        iss.append(_issue("error", "I03", "duplicate bone names %s" % dups[:10], ""))
    loc = facts.get("root_location")
    if loc is not None and math.sqrt(sum(float(v) ** 2 for v in loc)) > root_tol_cm:
        iss.append(_issue("warn", "I04", "root not at the origin %s" % (list(loc),), "scenario-maya-rigging contract"))
    rot = facts.get("root_rotation")
    if rot is not None and any(abs(float(v)) > 0.01 for v in rot):
        iss.append(_issue("info", "I05", "root rotated %s: check Convert Scene / Force Front X Axis" % (list(rot),),
                          "import options, Miscellaneous"))
    if bone_budget and len(bones) > bone_budget:
        iss.append(_issue("warn", "I06", "%d bones over the budget of %d" % (len(bones), bone_budget), ""))
    weighted = facts.get("weighted_bones")
    if weighted is not None and parents:
        wset = set(weighted)
        needed = set(wset)
        for b in wset:
            needed.update(ancestors(parents, b))
        keep = set(MANNEQUIN_IK_BONES) | set(roots)
        unused = [b for b in bones if b not in needed and short_name(b) not in keep and b not in keep]
        info["unused_bones"] = unused
        if unused:
            iss.append(_issue("warn", "I07", "%d bones carry no skin weights and parent none that do (%s...): "
                              "remove them (5.8 Bone Count Reduction keeps parents up to root) or create them "
                              "in the Control Rig Construction Event" % (len(unused), unused[:6]),
                              "Biava [00:04:38]-[00:05:09]"))
    mi = facts.get("max_influences")
    if mi is not None:
        per = list(mi) if isinstance(mi, (list, tuple)) else [mi]
        info["max_influences"] = per
        if per and per[0] > 8 and not facts.get("unlimited_influences"):
            iss.append(_issue("error", "I08", "LOD0 has vertices with %d influences but Unreal keeps 8 by default: "
                              "render-only skinning artifacts. Enable unlimited bone influences (project threshold) "
                              "and high precision weights, or cap in the DCC" % per[0], "Biava [00:02:30]-[00:03:34]"))
        if per and per[0] > 12 and not hero:
            iss.append(_issue("warn", "I09", "non-hero character with %d influences; about 12 is the non-hero cap "
                              "(render cost, mesh chunking)" % per[0], "DeVoe tTgMafRAM7A [00:28:28]"))
        for a, b in zip(per, per[1:]):
            if b > a:
                iss.append(_issue("warn", "I10", "max influences increase with LOD %s" % per, "Lake [00:11:44]"))
                break
    if facts.get("morph_target_count", 0) >= 800 and not hero:
        iss.append(_issue("warn", "I11", "%d morph targets: fine for linear content, a cost in games"
                          % facts["morph_target_count"], "Biava [00:06:43]"))
    h = facts.get("height_cm")
    if h is not None and (h < 10 or h > 1000):
        iss.append(_issue("error", "I12", "height %.1f cm: likely a unit error (check Convert Scene Unit, Maya "
                          "working units, Blender Apply Unit)" % h, "[added]"))
    if expects_ik_bones:
        missing = [b for b in MANNEQUIN_IK_BONES if b not in names]
        if missing:
            iss.append(_issue("warn", "I13", "gameplay AnimBP expects mannequin IK bones, missing %s: add them in "
                              "the DCC or pin them with the retargeter Pin Bones op" % missing, "digest checklist [added]"))
    if facts.get("lod_count") is not None and facts["lod_count"] <= 1:
        iss.append(_issue("info", "I14", "single LOD: generate LODs with a shared LOD Settings asset", "Lake [00:08:27]"))
    if facts.get("physics_asset") in (None, "", "None") and "physics_asset" in facts:
        iss.append(_issue("info", "I15", "no Physics Asset (bounds, ragdoll, cloth collision need one)", "import options"))
    out = verdict(iss)
    out["info"] = info
    return out


# =============================================================================================
# 7. OFFLINE LAYER: clip classification and animation content audit
# =============================================================================================

_MOVES = ("idle", "walk", "jog", "run", "sprint", "crouch", "jump", "fall", "land", "turn", "traversal",
          "vault", "mantle", "hurdle")


def classify_clip(name):
    """Parse a locomotion clip name into move, phase, direction, foot, angle, side.

    Understands GASP-style (M_Neutral_Run_Start_F_Lfoot, M_Neutral_Run_Reface_Start_F_L_090),
    mannequin-style (MM_Run_Fwd, MF_Walk_Bwd_Stop) and plain names (Walk_Stop_LeftFoot).
    Heuristic [added]; always read the result."""
    raw = short_name(name)
    n = raw.lower()
    toks = [t for t in re.split(r"[_\-\s\.]+", n) if t]
    d = {"name": raw, "move": None, "phase": None, "dir": None, "foot": None, "angle": None, "side": None,
         "crouch": "crouch" in n}
    for m in _MOVES:
        if m in toks or (m in n and m not in ("run", "turn", "fall", "land")):
            if m == "crouch" and any(x in toks for x in ("walk", "run", "idle", "jog")):
                continue
            d["move"] = m
            break
    if d["move"] is None:
        for m in ("run", "walk", "idle", "turn", "fall", "land"):
            if m in n:
                d["move"] = m
                break
    if "stand" in toks and "idle" in toks:
        d["move"] = "idle"
    phase = None
    for p, keys in (("reface", ("reface", "refacing")), ("start", ("start", "starts")), ("stop", ("stop", "stops")),
                    ("pivot", ("pivot", "pivots")), ("arc", ("arc",)), ("loop", ("loop", "cycle")),
                    ("tip", ("tip",)), ("turn", ("turn", "tip"))):
        if any(k in toks for k in keys):
            phase = p
            break
    if phase == "turn" and d["move"] != "turn":
        d["move"] = d["move"] or "turn"
    if phase is None and d["move"] in ("walk", "jog", "run", "sprint", "idle", "crouch"):
        phase = "loop"
    d["phase"] = phase
    for t in toks:
        if t in ("f", "fwd", "forward"):
            d["dir"] = "F"
        elif t in ("b", "bwd", "back", "backward"):
            d["dir"] = "B"
        elif t in ("ll", "strafel", "strafeleft"):
            d["dir"] = "L"
        elif t in ("rr", "strafer", "straferight"):
            d["dir"] = "R"
    for t in toks:
        if t in ("lfoot", "leftfoot", "lf", "footl") or re.fullmatch(r"l(eft)?foot", t):
            d["foot"] = "L"
        elif t in ("rfoot", "rightfoot", "rf", "footr") or re.fullmatch(r"r(ight)?foot", t):
            d["foot"] = "R"
    if d["foot"] is None and phase in ("reface", "start", "stop"):
        m = re.search(r"_(l|r)_(0?45|0?90|135|180)", n)
        if m:
            d["foot"] = m.group(1).upper()
    ang = re.search(r"(?<!\d)(0?45|0?90|135|180)(?!\d)", n)
    if ang:
        d["angle"] = int(ang.group(1))
    if phase == "arc" or d["move"] == "turn":
        for t in toks:
            if t in ("l", "left"):
                d["side"] = "L"
            elif t in ("r", "right"):
                d["side"] = "R"
    # Lone L / R: direction on loops, and on starts or stops that already name the foot (Run_Start_L_Lfoot);
    # foot on refacing starts (F_L_090); side on arcs and turns (handled above) [added convention].
    lone = [t for t in toks if t in ("l", "r", "left", "right")]
    if lone and d["dir"] is None and d["move"] in ("walk", "jog", "run", "sprint", "crouch") and phase != "arc":
        if phase == "loop" or (phase in ("start", "stop", "pivot") and d["foot"] is not None):
            d["dir"] = "L" if lone[0] in ("l", "left") else "R"
    loco = ("walk", "jog", "run", "sprint", "crouch")
    d["locomotion"] = d["move"] in loco or (d["move"] is None and phase in ("start", "stop", "pivot", "arc", "reface"))
    d["moving"] = d["locomotion"] and phase is not None and d["move"] != "idle"
    return d


def anim_content_audit(clips, skeleton=None, fps=30.0, locomotion_names=None):
    """Audit a set of clips (from anim_clip_facts or a test).

    clip: {"name", "skeleton", "tracks": [...], "curves": {name: {"all_zero": bool}} or [names],
    "frames", "fps", "root_motion": bool, "compression": str, "body": True}.
    Flags (Lake N_suMyUuork [00:04:09]-[00:07:52]; docs): track-count outliers against the set's
    mode, face or twist tracks on body clips, Maya helper curves, all-zero curves, frame rate,
    skeleton mismatch, locomotion clips without root motion (motion matching doc: locomotion
    databases require Enable Root Motion). Returns verdict plus per-clip summaries and a split of
    fixes: in engine (curves, flags) vs at the source (bone tracks, per Lake)."""
    iss = []
    counts = [len(c.get("tracks") or []) for c in clips]
    mode = None
    if counts:
        freq = {}
        for n in counts:
            freq[n] = freq.get(n, 0) + 1
        mode = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    loco = set(locomotion_names or [])
    per = []
    fix_engine, fix_source = [], []
    for c in clips:
        name = c.get("name", "?")
        ci = []
        tr = list(c.get("tracks") or [])
        if mode is not None and len(tr) != mode and len(clips) >= 3:
            ci.append(_issue("warn", "A01", "%s: %d bone tracks vs %d on most clips of the set" % (name, len(tr), mode),
                             "Lake [00:05:15]-[00:06:18]"))
        if c.get("body", True):
            face = [t for t in tr if FACE_RE.search(short_name(t))]
            twist = [t for t in tr if TWIST_RE.search(short_name(t))]
            if face:
                ci.append(_issue("warn", "A02", "%s: %d face tracks on a body clip (%s...)" % (name, len(face), face[:3]),
                                 "Lake [00:05:15]"))
                fix_source.append(name)
            if twist:
                ci.append(_issue("info", "A03", "%s: %d twist or deformation tracks (%s...): runtime-driven joints "
                                 "should not be animated" % (name, len(twist), twist[:3]), "Lake [00:07:21]"))
                fix_source.append(name)
        curves = c.get("curves") or {}
        if isinstance(curves, (list, tuple)):
            curves = {k: {} for k in curves}
        helpers = [k for k in curves if MAYA_HELPER_CURVE_RE.search(k)]
        zeros = [k for k, v in curves.items() if isinstance(v, dict) and v.get("all_zero")]
        if helpers:
            ci.append(_issue("warn", "A04", "%s: Maya helper curves %s" % (name, helpers[:5]), "Lake [00:04:41]"))
            fix_engine.append(name)
        if zeros:
            ci.append(_issue("warn", "A05", "%s: %d all-zero curves (Do not import curves with 0 values)" % (name, len(zeros)),
                             "import options; Lake [00:06:50]"))
            fix_engine.append(name)
        f = c.get("fps")
        if f and fps and abs(float(f) - float(fps)) > 0.01:
            ci.append(_issue("info", "A06", "%s: %.2f fps vs project %.2f" % (name, float(f), float(fps)), "import options"))
        if skeleton and c.get("skeleton") and c["skeleton"] != skeleton:
            ci.append(_issue("error", "A07", "%s: skeleton %s, expected %s (animation imported without the target "
                             "skeleton?)" % (name, c["skeleton"], skeleton), "FBX animation pipeline"))
        cls = classify_clip(name)
        is_loco = name in loco or cls["locomotion"]
        if is_loco and c.get("root_motion") is False:
            ci.append(_issue("error", "A08", "%s: locomotion clip without Enable Root Motion" % name,
                             "motion matching doc; GASP team [01:30:00]"))
            fix_engine.append(name)
        comp = c.get("compression")
        if comp is not None and comp in ("", "None"):
            ci.append(_issue("info", "A09", "%s: no bone compression settings asset (ACL default expected)" % name,
                             "compression doc"))
        iss.extend(ci)
        per.append({"name": name, "tracks": len(tr), "curves": len(curves), "issues": len(ci)})
    out = verdict(iss)
    out.update(track_count_mode=mode, clips=per, fix_in_engine=sorted(set(fix_engine)),
               fix_at_source=sorted(set(fix_source)))
    return out


# =============================================================================================
# 8. OFFLINE LAYER: root motion, chest over root, speed parity
# =============================================================================================

def _xy(p):
    return (float(p[0]), float(p[1]))


def _dist2(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _median(v):
    s = sorted(v)
    if not s:
        return 0.0
    m = len(s) // 2
    return s[m] if len(s) % 2 else 0.5 * (s[m - 1] + s[m])


def root_motion_check(frames, fps, name=None, kind=None, enabled=None, still_tol_cm=1.0, snap_ratio=8.0):
    """frames: root bone positions per frame (x, y, z in cm, component space).

    kind: 'moving', 'in_place' or None (then classify_clip(name) decides).
    Flags: moving clip with no displacement (root motion missing: mocap moves the hips only; use the
    retargeter Root Motion op Generate From Target Pelvis or fix in the DCC), in-place clip that drifts,
    a snap (one step far above the median step), Z motion (ignored while Walking or Falling, root
    motion doc), root motion flag off on a moving clip. Thresholds are [added] defaults."""
    iss = []
    pts = [tuple(map(float, p)) for p in frames or []]
    n = len(pts)
    if n < 2:
        return dict(verdict([_issue("error", "M00", "fewer than 2 root samples", "")]), displacement_cm=0.0)
    steps = [_dist2(_xy(pts[i]), _xy(pts[i + 1])) for i in range(n - 1)]
    disp = _dist2(_xy(pts[0]), _xy(pts[-1]))
    dur = (n - 1) / float(fps)
    speed = disp / dur if dur > 0 else 0.0
    path = sum(steps)
    med = _median(steps)
    if kind is None and name:
        c = classify_clip(name)
        kind = "moving" if c["moving"] and c["phase"] in ("loop", "arc") else ("in_place" if c["move"] == "idle" else None)
    if kind == "moving" and path < still_tol_cm:
        iss.append(_issue("error", "M01", "%s: moving clip with no root displacement (%.2f cm): root motion missing "
                          "on the root bone" % (name or "clip", path), "retargeting doc Root Motion op; root motion doc"))
    if kind == "in_place" and disp > still_tol_cm:
        iss.append(_issue("warn", "M02", "%s: in-place clip drifts %.2f cm" % (name or "clip", disp), "[added]"))
    if med > 0 and max(steps) > snap_ratio * med and max(steps) > still_tol_cm:
        i = steps.index(max(steps))
        iss.append(_issue("warn", "M03", "%s: root jumps %.1f cm between frames %d and %d (median step %.2f)"
                          % (name or "clip", max(steps), i, i + 1, med), "[added]"))
    z = [p[2] for p in pts]
    if max(z) - min(z) > still_tol_cm and kind == "moving":
        iss.append(_issue("info", "M04", "%s: root Z moves %.1f cm; Walking and Falling ignore root motion Z"
                          % (name or "clip", max(z) - min(z)), "root motion doc, Results"))
    if enabled is False and kind == "moving":
        iss.append(_issue("error", "M05", "%s: Enable Root Motion is off on a moving clip" % (name or "clip"),
                          "motion matching doc"))
    out = verdict(iss)
    out.update(displacement_cm=round(disp, 3), path_cm=round(path, 3), mean_speed_cm_s=round(speed, 3),
               duration_s=round(dur, 4), kind=kind)
    return out


def chest_over_root(root_frames, chest_frames, tol_cm=30.0):
    """Horizontal distance between the chest (spine_05 on the mannequin) and the root per frame.

    DeVoe: keep spine_05 above the root (FLDXtAV7qsw [00:10:12]); Tony locks the chest to the capsule
    within tolerance (mhVp_cC9MLc [00:26:29]). Default tol = the about 30 cm offset root bone radius
    GASP uses (mhVp_cC9MLc [01:52:15]); a larger gap cannot be absorbed [added inference]."""
    d = [_dist2(_xy(r), _xy(c)) for r, c in zip(root_frames, chest_frames)]
    if not d:
        return {"ok": False, "error": "no samples"}
    mx = max(d)
    return {"ok": mx <= tol_cm, "max_cm": round(mx, 3), "mean_cm": round(sum(d) / len(d), 3),
            "worst_frame": d.index(mx), "tol_cm": tol_cm,
            "source": "DeVoe FLDXtAV7qsw [00:10:12]; GASP [00:26:29], [01:52:15]"}


def _speeds(frames, fps):
    pts = [tuple(map(float, p)) for p in frames]
    return [_dist2(_xy(pts[i]), _xy(pts[i + 1])) * float(fps) for i in range(len(pts) - 1)]


def stop_frames(frames, fps, stop_speed_cm_s=5.0):
    """Frames a trajectory takes to stop: from the last frame at or above 90% of its peak speed to the first
    frame below stop_speed after it. None when it never stops. Helper for capsule_match [added]."""
    sp = _speeds(frames, fps)
    if not sp or max(sp) <= stop_speed_cm_s:
        return None
    peak = max(sp)
    last_fast = max(i for i, s in enumerate(sp) if s >= 0.9 * peak)
    for j in range(last_fast + 1, len(sp)):
        if sp[j] < stop_speed_cm_s:
            return {"start": last_fast, "stopped": j, "frames": j - last_fast}
    return None


def capsule_match(capsule_frames, root_frames, fps, chest_frames=None, root_tol_cm=2.0, chest_tol_cm=30.0,
                  stop_speed_cm_s=5.0, name=None):
    """Clip authored against the exported movement model (capsule trajectory), per frame.

    Practice (GASP team, Tony, mhVp_cC9MLc [00:24:25]-[00:28:43]; DeVoe FLDXtAV7qsw [00:06:27]-[00:08:40]):
    tune the movement model first, export the capsule path (5.6+ Rewind Debugger Trajectories export, else
    Take Recorder), animate in the DCC against it "as mechanical as possible": the root follows the capsule
    frame-exact, the CHEST (not the hips) stays within tolerance so weight shifts survive, stops end when the
    capsule stops (GASP: 5 frames) while the body overshoots and settles within tolerance.
    Inputs in cm, same space and frame rate. Tolerances are [added] defaults (chest 30 cm = offset root radius).
    Flags: V01 root off the capsule, V02 chest outside tolerance, V03 root stops later than the capsule,
    V04 capsule stop longer than GASP's 5 frames (info: tune the model if superhuman stops are wanted)."""
    iss = []
    tag = name or "clip"
    n = min(len(capsule_frames), len(root_frames))
    if n < 3:
        return dict(verdict([_issue("error", "V00", "%s: fewer than 3 frames" % tag, "")]))
    cap, root = capsule_frames[:n], root_frames[:n]
    rd = [_dist2(_xy(a), _xy(b)) for a, b in zip(cap, root)]
    out = {"root_max_cm": round(max(rd), 3), "root_worst_frame": rd.index(max(rd))}
    if max(rd) > root_tol_cm:
        iss.append(_issue("error", "V01", "%s: root leaves the capsule path by %.1f cm at frame %d: animate the root "
                          "against the exported trajectory" % (tag, max(rd), rd.index(max(rd))),
                          "GASP mhVp_cC9MLc [00:25:30]"))
    if chest_frames:
        cd = [_dist2(_xy(a), _xy(b)) for a, b in zip(cap, chest_frames[:n])]
        out.update(chest_max_cm=round(max(cd), 3), chest_worst_frame=cd.index(max(cd)))
        if max(cd) > chest_tol_cm:
            iss.append(_issue("error", "V02", "%s: chest %.1f cm from the capsule at frame %d: lock the chest (not the "
                              "hips) within tolerance" % (tag, max(cd), cd.index(max(cd))), "GASP mhVp_cC9MLc [00:26:29]"))
    cs, rs = stop_frames(cap, fps, stop_speed_cm_s), stop_frames(root, fps, stop_speed_cm_s)
    out.update(capsule_stop=cs, root_stop=rs)
    if cs and rs and rs["stopped"] > cs["stopped"] + 1:
        iss.append(_issue("warn", "V03", "%s: root stops at frame %d, capsule at %d: the capsule-relative root must stop "
                          "with the capsule; the body overshoots instead" % (tag, rs["stopped"], cs["stopped"]),
                          "GASP mhVp_cC9MLc [00:27:38]-[00:28:43]"))
    if cs and cs["frames"] > CAPSULE_STOP_FRAMES:
        iss.append(_issue("info", "V04", "%s: capsule takes %d frames to stop (GASP: %d); tune braking in the movement "
                          "model before animating if snappy stops are wanted" % (tag, cs["frames"], CAPSULE_STOP_FRAMES),
                          "GASP mhVp_cC9MLc [00:27:38]; DeVoe [00:07:01]"))
    res = verdict(iss)
    res.update(out)
    return res


def speed_parity(model_speeds, clip_speeds, tol=0.05):
    """Compare movement model speeds with clip root speeds per gait (cm/s).

    model_speeds: {"walk": 200, "run": 500}; clip_speeds: {"run": [480, 470], ...} or single values.
    Weights cannot fix a mismatch (motion matching doc: model 5 m/s vs data 4 m/s pins selection to
    the fastest poses); fix the data, add clips at the right speed, or split databases. Adding an
    intermediate speed means redoing pivots and transitions (GASP [01:27:17]). tol is [added]."""
    iss, rows = [], []
    for gait, target in model_speeds.items():
        vals = clip_speeds.get(gait)
        if vals is None:
            iss.append(_issue("warn", "S01", "no clips measured for gait %s" % gait, ""))
            continue
        vals = list(vals) if isinstance(vals, (list, tuple)) else [vals]
        mean = sum(vals) / float(len(vals))
        rel = (mean - target) / float(target) if target else 0.0
        rows.append({"gait": gait, "model": target, "data_mean": round(mean, 2), "relative": round(rel, 4)})
        if abs(rel) > tol:
            iss.append(_issue("error", "S02", "%s: data %.0f cm/s vs model %.0f cm/s (%+.0f%%): weights will not fix "
                              "this; retime clips or change the model" % (gait, mean, target, 100 * rel),
                              "motion matching doc, Channel Weights"))
    out = verdict(iss)
    out["rows"] = rows
    return out


# =============================================================================================
# 9. OFFLINE LAYER: foot contact
# =============================================================================================

def foot_contact_metrics(frames, fps, contact_z=None, height_tol_cm=2.0, speed_tol_cm_s=15.0,
                         floor_z=0.0, penetration_tol_cm=1.0):
    """frames: foot bone positions per frame (x, y, z cm, component space; root motion extracted or not).

    A frame is planted when z <= contact_z + height_tol and horizontal speed < speed_tol. contact_z
    defaults to the clip's lowest foot height (the ankle height when planted). Reports plant segments,
    slide (horizontal travel while planted), frames below floor_z + contact reference minus
    penetration_tol (sinking), and the mean planted height. Thresholds are [added] defaults (digest:
    1 to 2 cm); tune per project."""
    pts = [tuple(map(float, p)) for p in frames or []]
    n = len(pts)
    if n < 3:
        return {"ok": False, "error": "fewer than 3 samples"}
    zs = [p[2] for p in pts]
    cz = min(zs) if contact_z is None else float(contact_z)
    sp = [0.0] * n
    for i in range(n):
        a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        dt = (min(n - 1, i + 1) - max(0, i - 1)) / float(fps)
        sp[i] = _dist2(_xy(a), _xy(b)) / dt if dt > 0 else 0.0
    planted = [zs[i] <= cz + height_tol_cm and sp[i] < speed_tol_cm_s for i in range(n)]
    segs, i = [], 0
    while i < n:
        if planted[i]:
            j = i
            while j + 1 < n and planted[j + 1]:
                j += 1
            travel = sum(_dist2(_xy(pts[k]), _xy(pts[k + 1])) for k in range(i, j))
            segs.append({"start": i, "end": j, "frames": j - i + 1, "slide_cm": round(travel, 3),
                         "mean_z": round(sum(zs[i:j + 1]) / (j - i + 1), 3)})
            i = j + 1
        else:
            i += 1
    below = [k for k in range(n) if zs[k] < floor_z + (cz if contact_z is not None else 0.0) - penetration_tol_cm] \
        if contact_z is not None else []
    max_slide = max([s["slide_cm"] for s in segs] or [0.0])
    pz = [s["mean_z"] for s in segs]
    return {"ok": max_slide <= height_tol_cm and not below, "plants": segs, "plant_count": len(segs),
            "max_slide_cm": max_slide, "planted_height_cm": round(sum(pz) / len(pz), 3) if pz else None,
            "contact_z": round(cz, 3), "frames_below_floor": below[:50],
            "thresholds": {"height_tol_cm": height_tol_cm, "speed_tol_cm_s": speed_tol_cm_s}, "source": "[added]"}


def compare_contact(source_metrics, target_metrics, height_ratio, tol_cm=2.0, name=None):
    """Target planted foot height vs source planted height scaled by the target/source height ratio.

    Lower = sinking (Blend to Source missing, Richardson [00:16:29]); higher = floating (floor
    constraint or retarget pose). Also compares plant counts and slide. tol is [added]."""
    iss = []
    sh, th = source_metrics.get("planted_height_cm"), target_metrics.get("planted_height_cm")
    tag = name or "clip"
    if sh is None or th is None:
        iss.append(_issue("warn", "F00", "%s: no planted frames found on one side" % tag, ""))
    else:
        expect = sh * float(height_ratio)
        delta = th - expect
        if delta < -tol_cm:
            iss.append(_issue("error", "F01", "%s: feet sink %.1f cm below the scaled source; enable Blend to Source on "
                              "leg IK" % (tag, -delta), "Richardson [00:16:29]"))
        elif delta > tol_cm:
            iss.append(_issue("error", "F02", "%s: feet float %.1f cm above the scaled source; check the retarget pose "
                              "(Snap Character to Ground) and the Floor Constraint" % (tag, delta), "retargeting doc"))
    if source_metrics.get("plant_count") != target_metrics.get("plant_count"):
        iss.append(_issue("warn", "F03", "%s: %s plants on source vs %s on target" % (
            tag, source_metrics.get("plant_count"), target_metrics.get("plant_count")), "[added]"))
    ts = target_metrics.get("max_slide_cm", 0.0) or 0.0
    ss = source_metrics.get("max_slide_cm", 0.0) or 0.0
    if ts > max(tol_cm, ss * float(height_ratio) + tol_cm):
        iss.append(_issue("warn", "F04", "%s: target slides %.1f cm while planted (source %.1f)" % (tag, ts, ss),
                          "[added]"))
    return verdict(iss)


# =============================================================================================
# 10. OFFLINE LAYER: montages
# =============================================================================================

def montage_blend_out_check(montage, root_frames, fps, speed_tol_cm_s=1.0):
    """montage: {"name", "length_s", "blend_out_time", "blend_out_trigger_time", "enable_root_motion"}.

    With Blend Out Trigger Time -1 the blend-out completes at the montage end, so it starts
    blend_out_time before the end; with 0 it starts at the end (GASP mhVp_cC9MLc [02:07:33]). If the
    root still moves inside the blend window, locomotion sees 'moving' and plays a few walk-loop
    frames (GASP [02:03:01]-[02:08:44]). speed_tol is [added]."""
    iss = []
    name = montage.get("name", "montage")
    L = float(montage.get("length_s", 0.0))
    bo = float(montage.get("blend_out_time", 0.25))
    trig = float(montage.get("blend_out_trigger_time", -1.0))
    pts = [tuple(map(float, p)) for p in root_frames or []]
    n = len(pts)
    if trig < 0:
        w0, w1 = max(0.0, L - bo), L
    else:
        w0, w1 = max(0.0, L - trig), L
    i0 = int(math.floor(w0 * fps))
    i1 = min(n - 1, int(math.ceil(w1 * fps)))
    speed = 0.0
    if n >= 2 and i1 > i0:
        path = sum(_dist2(_xy(pts[k]), _xy(pts[k + 1])) for k in range(max(0, i0), i1))
        speed = path / ((i1 - max(0, i0)) / float(fps))
    moving_total = n >= 2 and _dist2(_xy(pts[0]), _xy(pts[-1])) > 1.0
    if moving_total and montage.get("enable_root_motion") is False:
        iss.append(_issue("error", "T01", "%s: root moves but Enable Root Motion is off" % name, "root motion doc"))
    if speed > speed_tol_cm_s:
        iss.append(_issue("warn", "T02", "%s: root moves %.1f cm/s inside the blend-out window %.2f to %.2f s (trigger %s): "
                          "set Blend Out Trigger Time 0 or end root motion earlier" % (name, speed, w0, w1, trig),
                          "GASP team mhVp_cC9MLc [02:03:01]-[02:08:44]"))
    out = verdict(iss)
    out.update(window_s=(round(w0, 3), round(w1, 3)), window_speed_cm_s=round(speed, 3))
    return out


_RM_MODES = {"norootmotionextraction": "NO_ROOT_MOTION_EXTRACTION", "ignorerootmotion": "IGNORE_ROOT_MOTION",
             "rootmotionfromeverything": "ROOT_MOTION_FROM_EVERYTHING",
             "rootmotionfrommontagesonly": "ROOT_MOTION_FROM_MONTAGES_ONLY"}
ROOT_MOTION_GAME_THREAD_MODES = ("ROOT_MOTION_FROM_EVERYTHING", "ROOT_MOTION_FROM_MONTAGES_ONLY")


def root_motion_mode_check(current_mode=None, multiplayer=True, montage_root_motion=True, root_motion_driven=False):
    """AnimBP Root Motion Mode: which one, and what it costs.

    Cost (root motion doc verbatim: "When either Root Motion from everything or Root Motion from Montages is
    enabled, the Animation Graph is updated on the Game Thread"; Lake N_suMyUuork [00:13:18]; animation
    digest 10): BOTH Everything and Montages Only put the AnimGraph update on the game thread. Montages Only
    is chosen for capsule-driven locomotion (networking, server does not run animation, CMC handles root
    motion poorly: GASP mhVp_cC9MLc [00:23:53]), NOT to keep the graph on worker threads; budget that
    game-thread cost. Characters that never play root-motion montages can use No Root Motion Extraction,
    which the doc wording leaves on worker threads [inference, verify with an Insights trace]. Whether the
    engine limits the game-thread update to frames where a root-motion montage plays is [verify].
    Returns verdict plus "plan": {"mode", "graph_on_game_thread", "reason"}."""
    iss = []
    if root_motion_driven and not multiplayer:
        want, why = "ROOT_MOTION_FROM_EVERYTHING", ("root-motion-driven single-player hero (planted refacing turns, "
                                                    "Jose tNw9lD2PW3U [00:33:25]); the root motion attribute path "
                                                    "and Mover settings are [verify]")
    elif montage_root_motion:
        want, why = "ROOT_MOTION_FROM_MONTAGES_ONLY", ("capsule-driven locomotion with root motion in montages "
                                                       "(networking, CMC limits: GASP [00:23:53])")
    else:
        want, why = "NO_ROOT_MOTION_EXTRACTION", "no root-motion montages: nothing to extract [inference, verify]"
    plan = {"mode": want, "graph_on_game_thread": want in ROOT_MOTION_GAME_THREAD_MODES, "reason": why}
    cur = None
    if current_mode:
        key = re.sub(r"[^a-z]", "", str(current_mode).lower().split(".")[-1])
        cur = _RM_MODES.get(key, str(current_mode).upper())
    if cur == "ROOT_MOTION_FROM_EVERYTHING" and multiplayer:
        iss.append(_issue("error", "Q01", "Root Motion from Everything on a multiplayer character: keep locomotion "
                          "capsule driven, root motion from montages only", "GASP mhVp_cC9MLc [00:23:53]; MM54 [00:33:57]"))
    if cur in ROOT_MOTION_GAME_THREAD_MODES:
        iss.append(_issue("info", "Q02", "%s updates the AnimGraph on the game thread (Montages Only too): budget it and "
                          "measure the game thread in Insights" % cur, "root motion doc; Lake [00:13:18]"))
        if not montage_root_motion and not root_motion_driven:
            iss.append(_issue("warn", "Q03", "%s without any root-motion montage: No Root Motion Extraction avoids the "
                              "game-thread update [inference from the doc wording, verify]" % cur, "root motion doc"))
    if cur and cur != want and not iss:
        iss.append(_issue("info", "Q04", "mode %s, plan says %s (%s)" % (cur, want, why), ""))
    out = verdict(iss)
    out["plan"] = plan
    return out


# =============================================================================================
# 11. OFFLINE LAYER: locomotion decision, coverage and database plan
# =============================================================================================

def decide_locomotion(locomotion_clips, mocap=False, stylized_hand_keyed=False, responsive_transitions=True,
                      needs_per_state_control=False, multiplayer=False, gasp_set_available=False,
                      single_player_hero=False):
    """Motion matching vs state machine vs hybrid, from the digest's disagreement table.

    Motion matching: large mocap or GASP set, responsive starts, stops, pivots, turn-ins, capsule
    model. State machine plus distance matching and warping (Lyra): small hand-keyed or stylized set,
    explicit per-state control, weapon-driven overrides. Hybrid is legitimate (motion matching on
    transitions, Sequence Player 'use pose search', linked layers around either). Performance is not
    the decider (GASP [01:24:26]). Small sets work: 13 clips (DeVoe) if procedural nodes are used; a small
    set alone is not a reason for a state machine ("a misnomer that you need all coverage", GASP [01:21:06]).
    Capsule vs root-motion-driven (decide early, DeVoe [00:07:33]): multiplayer stays capsule driven; a
    single-player hero may run on root motion through the root motion attribute (Jose [00:33:25]-[00:34:29]);
    Mover 5.8 adds ChaosMover trajectory prediction for motion matching, still heading out of Experimental."""
    reasons = []
    mm = 0
    if gasp_set_available:
        mm += 2
        reasons.append("GASP locomotion set available (500+ clips, retargetable)")
    if locomotion_clips >= 60:
        mm += 2
        reasons.append("%d locomotion clips: enough for split databases" % locomotion_clips)
    elif locomotion_clips >= 12:
        mm += 1
        reasons.append("%d clips: at or above DeVoe's minimal set (13 non-strafing, 26 strafing)" % locomotion_clips)
    else:
        mm -= 2
        reasons.append("%d clips: below DeVoe's minimal set" % locomotion_clips)
    if mocap:
        mm += 1
        reasons.append("mocap data")
    if responsive_transitions:
        mm += 1
        reasons.append("responsive starts, stops, pivots wanted")
    if stylized_hand_keyed and locomotion_clips < 26:
        mm -= 1
        reasons.append("small stylized hand-keyed set favors explicit states (Lyra)")
    if needs_per_state_control:
        mm -= 2
        reasons.append("designer wants explicit per-state control (Caleb: 'total control' of state machines)")
    choice = "motion_matching" if mm >= 3 else ("state_machine" if mm <= 0 else "hybrid")
    if multiplayer:
        root = ("capsule driven, root motion only in montages (networking, server does not run animation, CMC "
                "does not replicate input acceleration for trajectories: GASP [00:23:53], [01:36:57])")
    elif single_player_hero:
        root = ("evaluate root-motion-driven locomotion through the root motion attribute: perfectly planted refacing "
                "turns (Jose [00:33:25]-[00:34:29]); on Mover, 5.8 ChaosMover adds trajectory prediction for motion "
                "matching (still heading out of Experimental); keep a capsule-driven fallback [verify 5.8 maturity]")
    else:
        root = ("capsule driven by default (GASP); switch to root-motion-driven only for a single-player hero that "
                "needs planted turns [verify 5.8 maturity]")
    notes = {"motion_matching": "migrate GASP ABP_SandboxCharacter and CHT_PoseSearchDatabases, split databases per "
                                "state, Chooser on cached enums, interrupt only on core state change",
             "state_machine": "duplicate Lyra AnimBP_Mannequin_Base and item layers: distance matching for starts, "
                              "stops, lands; stride and orientation warping on cycles",
             "hybrid": "state machine for control with motion matching on transitions (entry frame of stops, "
                       "angle of starts) or Sequence Player 'use pose search'"}[choice]
    return {"choice": choice, "score": mm, "reasons": reasons, "root_motion": root, "how": notes,
            "source": "animation digest disagreement table; GASP mhVp_cC9MLc [01:20:30], [01:24:26]; DeVoe FLDXtAV7qsw"}


def _match_req(req, c):
    for k, v in req.items():
        if k == "move":
            if v == "run" and c.get("move") not in ("run", "jog"):
                return False
            if v != "run" and c.get("move") != v:
                return False
        elif k == "dir":
            if (c.get("dir") or "F") != v:
                return False
        elif c.get(k) != v:
            return False
    return True


def motion_matching_coverage(clip_names, strafing=False, states=(), mirrored=False):
    """Check a clip list against DeVoe's minimal set (FLDXtAV7qsw slides 00:11:14, 00:12:44, 00:14:20).

    Non-strafing: idle loop, run loop, starts and stops on each foot, small arcs both sides, refacing
    starts 90 and 180 on each foot. Strafing adds B, L, R loops with starts and stops on each foot.
    states (walk, crouch, sprint) repeat loop, starts and stops [added structure]; jumps and turn in
    place are listed as reminders. mirrored=True accepts one foot when a mirror data table exists on
    the schema (GASP [00:59:22])."""
    cls = [classify_clip(n) for n in clip_names]
    reqs = list(MM_MIN_NON_STRAFING)
    if strafing:
        for d in ("B", "L", "R"):
            reqs.append(("run_loop_%s" % d.lower(), {"move": "run", "phase": "loop", "dir": d}))
            for ph in ("start", "stop"):
                for f in ("L", "R"):
                    reqs.append(("run_%s_%s_%s" % (ph, d.lower(), f.lower()), {"move": "run", "phase": ph, "dir": d, "foot": f}))
    for s in states:
        mv = "crouch" if s == "crouch" else s
        reqs.append(("%s_loop" % s, {"move": mv, "phase": "loop"}))
        for ph in ("start", "stop"):
            for f in ("L", "R"):
                reqs.append(("%s_%s_%s" % (s, ph, f.lower()), {"move": mv, "phase": ph, "foot": f}))
    found, missing = {}, []
    for key, req in reqs:
        hits = [c["name"] for c in cls if _match_req(req, c)]
        if not hits and mirrored and "foot" in req:
            alt = dict(req, foot="R" if req["foot"] == "L" else "L")
            hits = [c["name"] + " (mirror)" for c in cls if _match_req(alt, c)]
        if hits:
            found[key] = hits
        else:
            missing.append(key)
    # Every start, stop and refacing start needs its other-foot variant (DeVoe [00:11:31]-[00:12:02]: digital
    # input picks the start matching the foot phase), whatever gait, direction or angle; a mirror data table
    # for the TARGET skeleton halves the authoring (GASP [00:59:22]).
    pairs_missing = []
    if not mirrored:
        have = set((c["move"], c["phase"], c["dir"] or "F", c["angle"], c["foot"], c["crouch"]) for c in cls)
        for c in cls:
            if c["phase"] in ("start", "stop", "reface") and c["foot"] in ("L", "R"):
                other = "R" if c["foot"] == "L" else "L"
                if (c["move"], c["phase"], c["dir"] or "F", c["angle"], other, c["crouch"]) not in have:
                    pairs_missing.append("%s: no %s-foot variant" % (c["name"], other))
    unknown = [c["name"] for c in cls if c["move"] is None]
    return {"ok": not missing and not pairs_missing, "required": len(reqs), "found": found, "missing": missing,
            "foot_pairs_missing": pairs_missing, "unclassified": unknown, "clip_count": len(clip_names),
            "reminders": ["jump start, fall loop, land", "turn in place 90 and 180 both sides"] if states else [],
            "capture": "no dance cards: short shapes (hourglass, box, prism, diamond) covering 45, 90 and 135 degree "
                       "permutations, both feet; mocap for style, retime within reason (GASP [02:11:20], [01:30:27])",
            "source": "DeVoe FLDXtAV7qsw [00:11:14]-[00:14:44] (he counts 13 and 26; the checklist follows the "
                      "on-screen asset list)"}


def database_plan(clip_names, chooser_columns=False, prefix="PSD"):
    """Split clips into Pose Search databases per movement state (GASP mhVp_cC9MLc [00:29:43]-[00:36:42]).

    Groups: idles, stops (entry speed above 10 cm/s, under idle in the Chooser), starts and pivots
    (under moving with IsStarting / IsPivoting), loops and arcs, jumps and falls, lands, turn in place,
    per gait and stance. Stops get their own schema with trajectory weighted higher (GASP [00:30:50]).
    Databases searched through Chooser columns default to Brute Force in 5.8 (KD tree fails with
    external filtering). Every database requires Enable Root Motion on its clips."""
    groups = {}
    for n in clip_names:
        c = classify_clip(n)
        gait = c["move"] if c["move"] in ("walk", "jog", "run", "sprint") else None
        stance = "Crouch" if c["crouch"] else ""
        if re.search(r"from_?traversal|(traversal|vault|mantle|hurdle)\w*?_?tail", short_name(n), re.I):
            key, row = "FromTraversal", "JustTraversed (tails of traversal clips; the montage blends out early)"
        elif c["move"] == "idle" and c["phase"] in (None, "loop"):
            key, row = "Idle", "idle"
        elif c["move"] == "turn" or c["phase"] in ("turn", "tip"):
            key, row = "TurnInPlace", "idle, turning"
        elif c["move"] in ("jump", "fall"):
            key, row = "Jumps", "in air"
        elif c["move"] == "land":
            key, row = "Lands", "just landed"
        elif c["move"] in ("traversal", "vault", "mantle", "hurdle"):
            key, row = "Traversal", "montage candidates (callable Motion Match), not the locomotion node"
        elif c["phase"] == "stop":
            key, row = "Stops", "idle, entry speed > 10 cm/s"
        elif c["phase"] in ("start", "reface"):
            key, row = "Starts", "moving, IsStarting"
        elif c["phase"] == "pivot":
            key, row = "Pivots", "moving, IsPivoting"
        else:
            key, row = "Loops", "moving"
        g = (gait or "").capitalize()
        dbn = "%s_%s%s%s" % (prefix, stance, g, key) if key not in ("Jumps", "Lands", "Traversal") else "%s_%s%s" % (prefix, stance, key)
        e = groups.setdefault(dbn, {"name": dbn, "clips": [], "chooser_row": ("crouching, " if stance else "") +
                                    ("gait %s, " % gait if gait else "") + row,
                                    "schema": "stops (trajectory weighted higher)" if key == "Stops" else "default",
                                    "search_mode": "BruteForce" if chooser_columns else "PCAKDTree or BruteForce by timing",
                                    "root_motion_required": key != "Traversal"})
        e["clips"].append(n)
    return {"databases": sorted(groups.values(), key=lambda d: d["name"]),
            "rules": ["interrupt only when a core state (movement mode, gait) changed this frame",
                      "disable bad clips in the database instead of deleting them (GASP [01:13:16])",
                      "Should Filter Notifies on the Motion Matching node, Notify Recency Time Out 0.2 s",
                      "repetition guards on the node: Pose Jump Threshold Time, Pose Reselect History; Search "
                      "Throttle Time and continuing pose bias to search less (motion matching doc)",
                      "traversal: Chooser narrows by action, speed, height, depth; a callable Motion Match picks asset, "
                      "start time, play rate among Branch In frames; montage plus Motion Warping; the tail returns "
                      "through a locomotion database enabled on JustTraversed (GASP [00:53:23], [02:16:18]-[02:21:56])"],
            "source": "GASP mhVp_cC9MLc [00:29:43]-[01:18:49]; 5.8 release notes (Brute Force for Chooser columns)"}


def schema_bone_check(referenced, target_bones, bone_map=None, schema_skeleton=None, target_skeleton=None,
                      mirror_table_skeleton=None):
    """Bones named by duplicated Pose Search schemas, Pose History and custom channels must exist on the
    target skeleton. Duplicated GASP schemas silently keep mannequin names: the default Pose channel names
    foot_l and foot_r, GASP's Pose History samples feet, thighs, spine and pelvis (motion matching doc,
    'Skeleton not the mannequin'; tNw9lD2PW3U [00:09:15]); traversal channels read an attach bone that must
    be on every frame (GASP [01:42:02]).

    referenced: [bones] or {"PSS_Default Pose channel": [bones], "Pose History": [bones], ...}.
    bone_map: mannequin_bone_map(...) result or {mannequin: target}; used to suggest the remap.
    Flags P01 missing bone (with suggestion), P02 schema skeleton is not the target, P03 mirror data table
    built for another skeleton (mirroring needs the target's bone pairs [added inference])."""
    iss = []
    tset = set(short_name(b) for b in target_bones)
    bmap = dict((bone_map or {}).get("map", bone_map or {}))
    groups = referenced if isinstance(referenced, dict) else {"schema": list(referenced)}
    remap, unmapped = {}, []
    for where, bones in groups.items():
        for b in bones or []:
            if short_name(b) in tset:
                continue
            sug = bmap.get(short_name(b))
            if sug and short_name(sug) in tset:
                remap[b] = sug
                iss.append(_issue("error", "P01", "%s: bone %s not on the target skeleton; remap to %s" % (where, b, sug),
                                  "motion matching doc, Mistakes and fixes"))
            else:
                unmapped.append(b)
                iss.append(_issue("error", "P01", "%s: bone %s not on the target skeleton and no mapping found" % (where, b),
                                  "motion matching doc, Mistakes and fixes"))
    if schema_skeleton and target_skeleton and schema_skeleton != target_skeleton:
        iss.append(_issue("error", "P02", "schema skeleton %s, target %s: set the duplicated schema to the target "
                          "skeleton" % (schema_skeleton, target_skeleton), "motion matching doc, Schema"))
    if mirror_table_skeleton and target_skeleton and mirror_table_skeleton != target_skeleton:
        iss.append(_issue("warn", "P03", "mirror data table built for %s: rebuild it for %s before mirroring"
                          % (mirror_table_skeleton, target_skeleton), "GASP [00:59:22]; [added inference]"))
    out = verdict(iss)
    out.update(remap=remap, unmapped=sorted(set(unmapped)))
    return out


def offset_root_bone_modes(state):
    """Offset Root Bone translation and rotation modes for a movement state ('moving_ground', 'stopped',
    'falling', 'montage'), plus the GASP limits (radius about 30 cm, clips into walls: smaller radius near
    walls or collision-aware trajectory; translation half-life fast when stopped so stops end at the capsule
    centre, smoother when moving). GASP mhVp_cC9MLc [01:51:44]-[01:55:09]; tNw9lD2PW3U [00:32:07]; motion
    matching doc (GASP functions, Offset Root Bone known issues)."""
    if state not in OFFSET_ROOT_BONE_MODES:
        raise ValueError("state must be one of %s" % sorted(OFFSET_ROOT_BONE_MODES))
    d = dict(OFFSET_ROOT_BONE_MODES[state])
    d.update(radius_cm=OFFSET_ROOT_RADIUS_CM,
             translation_half_life="fast (stop ends at capsule centre)" if state == "stopped" else "smoother",
             limits="no collision checks: reduce the radius near walls or bend the trajectory around them; releasing "
                    "during montages plus motion warping can move the character unexpectedly")
    return d


def procedural_order_check(nodes, steering_states=None):
    """Order and placement of procedural nodes, from input pose to output, as read from the AnimGraph.

    nodes: ["Motion Matching", "Offset Root Bone", ...] or dicts {"name", "blend_stack": [names]} where a
    Motion Matching node carries the nodes of its internal blend stack (double-click the node).
    Rules: Steering feeds Offset Root Bone, so it evaluates first, else keyboard input thrashes selection
    (DeVoe FLDXtAV7qsw [00:30:31]-[00:31:40]); Orientation Warping per animation inside the blend stack, not on
    the blended result (Jose tNw9lD2PW3U [00:27:34]-[00:29:50], disable it by clip curves on pivot corners);
    steering only while moving or in air, else idles slide (motion matching doc, GASP Enable Steering).
    Desired facing: trajectory 0.5 s ahead (Jose [00:29:50])."""
    iss = []
    flat = []
    for i, n in enumerate(nodes or []):
        if isinstance(n, dict):
            flat.append((i, n.get("name", ""), False))
            for s in n.get("blend_stack") or []:
                flat.append((i, s, True))
        else:
            flat.append((i, str(n), False))

    def pos(word):
        hits = [(i, inbs) for i, name, inbs in flat if word in name.lower()]
        return hits[0] if hits else None
    st, orb, ow = pos("steering"), pos("offset root"), pos("orientation warp")
    if st and orb and st[0] > orb[0]:
        iss.append(_issue("error", "G01", "Steering evaluates after Offset Root Bone: put steering first (it feeds the "
                          "root offset), else keyboard input thrashes motion matching", "DeVoe FLDXtAV7qsw [00:31:40]"))
    if ow and not ow[1]:
        iss.append(_issue("warn", "G02", "Orientation Warping on the blended pose: warp per animation inside the Motion "
                          "Matching blend stack", "Jose tNw9lD2PW3U [00:27:34]"))
    if steering_states and any(s in ("idle", "stopped") for s in steering_states):
        iss.append(_issue("warn", "G03", "steering enabled while idle: idles get steered and slide; enable it only when "
                          "moving or in air", "motion matching doc, GASP Enable Steering"))
    if st is None and orb is not None:
        iss.append(_issue("info", "G04", "no Steering node: sparse sets and digital input usually need it",
                          "DeVoe FLDXtAV7qsw [00:30:31]"))
    return verdict(iss)


# =============================================================================================
# 12. OFFLINE LAYER: project ini plan and writer (with backup, never deletes)
# =============================================================================================

def anim_ini_plan(budget_ms_by_level=None, tick_when_rendered=True, multithreaded=True, fast_path=True):
    """Config lines for the animation performance defaults.

    DefaultEngine.ini: [/Script/Engine.SkeletalMeshComponent] VisibilityBasedAnimTickOption=
    OnlyTickPoseWhenRendered (Lake N_suMyUuork [00:21:13], section [verify]; applies to Skeletal
    Mesh Components, not placed Skeletal Mesh Actors), [/Script/Engine.Engine]
    bAllowMultiThreadedAnimationUpdate and bOptimizeAnimBlueprintMemberVariableAccess (AnimBP doc,
    keys [verify]). DefaultScalability.ini: a.Budget.BudgetMs per ViewDistanceQuality (AnimBP doc).
    Restart the editor after writing (config is read at startup)."""
    plan = {"DefaultEngine.ini": [], "DefaultScalability.ini": []}
    if tick_when_rendered:
        plan["DefaultEngine.ini"].append(("/Script/Engine.SkeletalMeshComponent", "VisibilityBasedAnimTickOption",
                                          "OnlyTickPoseWhenRendered"))
    if multithreaded:
        plan["DefaultEngine.ini"].append(("/Script/Engine.Engine", "bAllowMultiThreadedAnimationUpdate", "True"))
    if fast_path:
        plan["DefaultEngine.ini"].append(("/Script/Engine.Engine", "bOptimizeAnimBlueprintMemberVariableAccess", "True"))
    levels = BUDGET_MS_BY_VIEW_DISTANCE if budget_ms_by_level is None else budget_ms_by_level
    for lvl in sorted(levels):
        plan["DefaultScalability.ini"].append(("ViewDistanceQuality@%d" % int(lvl), "a.Budget.BudgetMs",
                                               "%.1f" % float(levels[lvl])))
    return plan


def import_defaults_plan(sample_rate=None, delete_existing_curves=True):
    """Project-wide import defaults for gameplay clips, so dialog imports by people get them too (Lake
    N_suMyUuork [00:06:50]: change the defaults in config, not per asset; import options doc: Do not import
    curves with 0 values for gameplay animation; a fixed sample rate, 30 Hz default or the project rate).

    Legacy FBX importer: Lake edits the engine's BaseEditorPerProjectUserSettings.ini, FBX anim sequence
    import data section; the project-level file and the section and key spellings below are [verify].
    Interchange: the same options live on the project's copy of the default assets pipeline, referenced by
    the Import Content stack in Project Settings > Engine > Interchange (procedures P1; GUI or Python [verify]).
    Returns a plan for apply_ini_plan (backup first, restart)."""
    sec = "/Script/UnrealEd.FbxAnimSequenceImportData"
    rows = [(sec, "bDoNotImportCurveWithZero", "True")]
    if delete_existing_curves:
        rows.append((sec, "bDeleteExistingCustomAttributeCurves", "True"))
    if sample_rate is None:
        rows.append((sec, "bUseDefaultSampleRate", "True"))
    else:
        rows.append((sec, "bUseDefaultSampleRate", "False"))
        rows.append((sec, "CustomSampleRate", str(int(sample_rate))))
    return {"DefaultEditorPerProjectUserSettings.ini": rows}


def ini_set(text, section, key, value):
    """Return text with `key=value` set in [section] (plain assignments only; +Key/-Key array lines are
    left alone). Creates the section at the end if absent. Pure function."""
    lines = text.splitlines()
    out, in_sec, done, sec_found = [], False, False, False
    hdr = "[%s]" % section
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            if in_sec and not done:
                while out and out[-1].strip() == "":
                    out.pop()
                out.append("%s=%s" % (key, value))
                out.append("")
                done = True
            in_sec = (s == hdr)
            sec_found = sec_found or in_sec
            out.append(line)
            continue
        if in_sec and not done:
            m = re.match(r"^\s*([A-Za-z0-9_.]+)\s*=", line)
            if m and m.group(1) == key:
                out.append("%s=%s" % (key, value))
                done = True
                continue
        out.append(line)
    if not done:
        if in_sec:
            while out and out[-1].strip() == "":
                out.pop()
            out.append("%s=%s" % (key, value))
        else:
            if out and out[-1].strip() != "":
                out.append("")
            out.append(hdr)
            out.append("%s=%s" % (key, value))
    return "\n".join(out) + "\n"


def ini_get(text, section, key):
    in_sec, val = False, None
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            in_sec = s == "[%s]" % section
            continue
        if in_sec:
            m = re.match(r"^\s*([A-Za-z0-9_.]+)\s*=\s*(.*)$", line)
            if m and m.group(1) == key:
                val = m.group(2).strip()
    return val


def apply_ini_plan(config_dir, plan, backup_dir=None, dry_run=False):
    """Write a plan from anim_ini_plan into <project>/Config, copying each file first to
    backup_dir (default <config_dir>/../Saved/AgentBackups) as <file>.<stamp>.bak. Never deletes.
    Returns {"changed": {file: [(section, key, old, new)]}, "backups": [...]}."""
    changed, backups = {}, []
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup_dir = backup_dir or os.path.join(os.path.dirname(os.path.abspath(config_dir)), "Saved", "AgentBackups")
    for fname, entries in plan.items():
        path = os.path.join(config_dir, fname)
        text = Path(path).read_text(encoding="utf-8") if os.path.exists(path) else ""
        new = text
        rows = []
        for sec, key, val in entries:
            old = ini_get(new, sec, key)
            if old != str(val):
                new = ini_set(new, sec, key, val)
                rows.append((sec, key, old, str(val)))
        if rows:
            changed[fname] = rows
            if not dry_run:
                if os.path.exists(path):
                    os.makedirs(backup_dir, exist_ok=True)
                    b = os.path.join(backup_dir, "%s.%s.bak" % (fname, stamp))
                    k = 1
                    while os.path.exists(b):
                        b = os.path.join(backup_dir, "%s.%s-%d.bak" % (fname, stamp, k))
                        k += 1
                    shutil.copy2(path, b)
                    backups.append(b)
                os.makedirs(config_dir, exist_ok=True)
                tmp = path + ".agent-tmp"
                with open(tmp, "w", encoding="utf-8") as fh:
                    fh.write(new)
                os.replace(tmp, path)
    return {"changed": changed, "backups": backups, "dry_run": dry_run,
            "note": "restart the editor: config is read at startup"}


# =============================================================================================
# 13. OFFLINE LAYER: LODs, budget allocator, URO
# =============================================================================================

def lod_settings_check(lods, shared_settings_asset=None):
    """lods: [{"screen_size", "hysteresis", "max_bone_influences", "bones_removed", "remap_morph_targets"}]
    from LOD0. Lake N_suMyUuork [00:09:00]-[00:11:44]: one LOD Settings data asset for all meshes,
    hysteresis against flicker, bone lists from LOD1 (remove listed early, keep listed late),
    influences 8, 4, 1, Remap Morph Targets off on far LODs."""
    iss = []
    if shared_settings_asset is False:
        iss.append(_issue("warn", "L01", "no shared LOD Settings data asset (Generate Asset, assign to every mesh)",
                          "Lake [00:09:00]"))
    for i, l in enumerate(lods):
        if i > 0 and not l.get("hysteresis"):
            iss.append(_issue("warn", "L02", "LOD%d hysteresis 0: flicker at a static camera" % i, "Lake [00:10:38]"))
        if i > 0 and lods[i - 1].get("screen_size") is not None and l.get("screen_size") is not None \
                and l["screen_size"] >= lods[i - 1]["screen_size"]:
            iss.append(_issue("error", "L03", "LOD%d screen size %.3f not below LOD%d" % (i, l["screen_size"], i - 1), ""))
        if i > 0 and (l.get("max_bone_influences") or 0) > (lods[i - 1].get("max_bone_influences") or 99):
            iss.append(_issue("warn", "L04", "LOD%d max influences increase" % i, "Lake [00:11:44]"))
        if i > 0 and l.get("remap_morph_targets"):
            iss.append(_issue("info", "L05", "LOD%d remaps morph targets; turn off unless needed" % i, "Lake [00:11:44]"))
    if len(lods) > 1 and not any((l.get("bones_removed") or 0) > 0 for l in lods[1:]):
        iss.append(_issue("warn", "L06", "no bone reduction on any LOD (face joints from LOD1, core skeleton later)",
                          "Lake [00:11:11]"))
    if lods and (lods[-1].get("max_bone_influences") or 8) > 4 and len(lods) >= 3:
        iss.append(_issue("info", "L07", "last LOD keeps %s influences (Lake: 1 on the farthest)" % lods[-1].get("max_bone_influences"),
                          "Lake [00:11:44]"))
    return verdict(iss)


def allocator_config_check(cfg):
    """cfg: {"plugin_enabled", "component_class", "auto_calculate_significance", "auto_register",
    "enable_animation_budget_node", "cvar_enabled", "uro_enabled", "budget_ms"}. AnimBP doc, Budget
    Allocator: both the Enable Animation Budget node and a.Budget.Enabled must be on; registering a
    component disables its URO; never configure both on one component."""
    iss = []
    if not cfg.get("plugin_enabled"):
        iss.append(_issue("error", "B01", "Animation Budget Allocator plugin not enabled", "AnimBP doc"))
    if cfg.get("component_class") not in ("SkeletalMeshComponentBudgeted",):
        iss.append(_issue("error", "B02", "mesh component class is %s, not SkeletalMeshComponentBudgeted" % cfg.get("component_class"),
                          "AnimBP doc"))
    for k, msg in (("auto_calculate_significance", "Auto Calculate Significance off"),
                   ("auto_register", "Auto Register with Budget Allocator off")):
        if not cfg.get(k):
            iss.append(_issue("warn", "B03", msg, "AnimBP doc"))
    if not (cfg.get("enable_animation_budget_node") and cfg.get("cvar_enabled")):
        iss.append(_issue("error", "B04", "both the Enable Animation Budget node and a.Budget.Enabled must be on, or the "
                          "allocator does nothing", "AnimBP doc, Set Up"))
    if cfg.get("uro_enabled"):
        iss.append(_issue("warn", "B05", "URO also configured: the allocator disables URO on registered components; "
                          "choose one", "AnimBP doc, IAnimationBudgetAllocator.h"))
    b = cfg.get("budget_ms")
    if b is not None and float(b) <= 0.1:
        iss.append(_issue("error", "B06", "a.Budget.BudgetMs must be above 0.1", "AnimBP doc cvar table"))
    return verdict(iss)


# =============================================================================================
# 14. OFFLINE LAYER: ML Deformer, MetaHuman, cloth, mocap filter, stepped keys, FBIK
# =============================================================================================

def ml_deformer_data_check(d):
    """d: {"anim_frames", "anim_fps", "cache_frames", "cache_fps", "mesh_verts", "cache_verts",
    "rom_bounds": {bone: {axis: [min, max]}}, "shipped_bounds": same, "inputs": [bones], "mode":
    "local"|"global", "morphs_total"}. ML Deformer doc (Troubleshooting); Fragapane and Stoneham
    OmMi6E0EkQw (ROM extremes [00:51:40]-[00:53:35], inputs [00:46:15])."""
    iss = []
    for a, b, what in (("anim_frames", "cache_frames", "frame count"), ("anim_fps", "cache_fps", "frame rate")):
        if d.get(a) is not None and d.get(b) is not None and float(d[a]) != float(d[b]):
            iss.append(_issue("error", "D01", "ROM animation and geometry cache differ in %s (%s vs %s)" % (what, d[a], d[b]),
                              "ML Deformer doc"))
    if d.get("cache_verts") and d.get("mesh_verts") and d["cache_verts"] > d["mesh_verts"]:
        iss.append(_issue("error", "D02", "geometry cache has more vertices than the skeletal mesh", "ML Deformer doc"))
    fr = d.get("anim_frames")
    if fr is not None:
        if fr < ML_MIN_FRAMES:
            iss.append(_issue("error", "D03", "%d training frames; at least %d for an average character" % (fr, ML_MIN_FRAMES),
                              "ML Deformer doc, Troubleshooting"))
        elif fr < ML_GOOD_FRAMES:
            iss.append(_issue("info", "D04", "%d frames; %d or more for good results" % (fr, ML_GOOD_FRAMES), "ML Deformer doc"))
    rom, ship = d.get("rom_bounds") or {}, d.get("shipped_bounds") or {}
    for bone, axes in ship.items():
        for ax, (lo, hi) in axes.items():
            r = (rom.get(bone) or {}).get(ax)
            if r is None:
                iss.append(_issue("error", "D05", "ROM has no range for %s %s" % (bone, ax), "OmMi6E0EkQw [00:52:34]"))
            elif lo < r[0] or hi > r[1]:
                iss.append(_issue("error", "D06", "shipped animation reaches %s %s [%.0f, %.0f] outside the ROM [%.0f, %.0f]: "
                                  "models extrapolate badly (collapse)" % (bone, ax, lo, hi, r[0], r[1]),
                                  "OmMi6E0EkQw [00:51:40]-[00:53:35]"))
    helpers = [b for b in (d.get("inputs") or []) if TWIST_RE.search(short_name(b))]
    if helpers:
        iss.append(_issue("warn", "D07", "twist or helper bones in network inputs %s: remove them" % helpers[:6],
                          "OmMi6E0EkQw [00:46:15]; ML Deformer doc"))
    mt = d.get("morphs_total")
    if mt is not None and not (ML_MORPHS_TOTAL[0] <= mt <= ML_MORPHS_TOTAL[1]):
        iss.append(_issue("warn", "D08", "%d morph targets total; 64 to 256 for GPU performance" % mt, "ML Deformer doc"))
    return verdict(iss)


def metahuman_tier_check(cfg):
    """cfg: {"platform", "pipeline_type": "cine"|"optimized", "quality", "use": "hero"|"squad"|"crowd",
    "forced_lod", "min_lod", "facial_animation_lod_threshold", "hair": "strands"|"cards", "dna_lods",
    "face_mesh_lods", "custom_materials_parameter_caching", "unlimited_influences", "pre_rendered"}.
    Sources: DeVoe tTgMafRAM7A; MetaHuman doc (platform table, LODSync, MetaHuman component)."""
    iss = []
    plat = (cfg.get("platform") or "pc").lower()
    game = not cfg.get("pre_rendered")
    if game and (cfg.get("pipeline_type") or "").lower().startswith("cine"):
        iss.append(_issue("error", "H01", "cinematic MetaHuman in a game build (about 800 MB cooked vs about 60 MB "
                          "Optimized High): assemble with the Optimized pipeline", "DeVoe [00:15:16]"))
    spec = METAHUMAN_PLATFORMS.get(plat)
    if spec and not spec["strands"] and (cfg.get("hair") or "").lower() == "strands":
        iss.append(_issue("error", "H02", "%s renders cards only: groom Min LOD to cards or "
                          "r.HairStrands.UseCardsInsteadOfStrands 1" % plat, "MetaHuman doc, Platform Support"))
    if cfg.get("use") == "crowd" and cfg.get("forced_lod") in (0, 1):
        iss.append(_issue("error", "H03", "Forced LOD %s on a crowd hurts performance; leave -1 or force a low LOD"
                          % cfg["forced_lod"], "MetaHuman doc, LODSync"))
    if cfg.get("dna_lods") is not None and cfg.get("face_mesh_lods") is not None and cfg["dna_lods"] != cfg["face_mesh_lods"]:
        iss.append(_issue("error", "H04", "DNA LOD count %s differs from face mesh LOD count %s (must match 1:1 in 5.8; "
                          "decouple with LODSync Custom LOD Mapping)" % (cfg["dna_lods"], cfg["face_mesh_lods"]),
                          "MetaHuman doc, SkeletalMesh LODs"))
    if cfg.get("custom_materials_parameter_caching") is False:
        iss.append(_issue("error", "H05", "custom MetaHuman materials without Enable Material Parameter Caching: "
                          "game-thread hitch", "DeVoe [00:30:51]"))
    if cfg.get("use") == "crowd" and cfg.get("facial_animation_lod_threshold", 2) not in (None, 0):
        iss.append(_issue("info", "H06", "crowds: no face animation, leader pose, fewer face bones; 5.8 MetaHuman Crowd "
                          "is Experimental", "DeVoe [00:25:50]; 5.8 release notes"))
    if cfg.get("use") != "hero" and cfg.get("unlimited_influences"):
        iss.append(_issue("info", "H07", "non-hero with unlimited influences: consider about 12 and check face skinning",
                          "DeVoe [00:28:28]-[00:29:34]"))
    if game and plat in ("console",) and cfg.get("min_lod", 0) == 0 and cfg.get("use") != "hero":
        iss.append(_issue("info", "H08", "audition LODs at the game camera starting from LOD 2 on PS5-class titles",
                          "DeVoe [00:23:34]"))
    return verdict(iss)


def cloth_config_check(cfg):
    """cfg: {"use": "game"|"cinematic", "workflow": "panel"|"legacy", "sim_tris", "render_tris", "substeps",
    "backstops": [{"region", "distance_cm", "radius_cm"}], "tethers_geodesic", "self_collision":
    "sphere"|"point_face"|None, "kinematic_collider_all_lods", "solver": "PBD"|"XPBD"}.
    Epic China TA, wq0lY7vhF5w: panel cloth, coarse separate sim mesh, backstop radius grows with
    distance, geodesic tethers, sphere self-collision and PBD for games, kinematic collider near only."""
    iss = []
    if cfg.get("workflow") == "legacy":
        iss.append(_issue("info", "K01", "legacy section cloth cannot make parts interact; panel cloth (production "
                          "ready in 5.8) is the recommended path", "wq0lY7vhF5w [00:01:42]"))
    st, rt = cfg.get("sim_tris"), cfg.get("render_tris")
    if st and rt and st >= rt:
        iss.append(_issue("warn", "K02", "sim mesh (%d tris) not coarser than render mesh (%d)" % (st, rt), "wq0lY7vhF5w [00:05:17]"))
    for b in cfg.get("backstops") or []:
        if b.get("distance_cm", 0) > 0 and b.get("radius_cm", 0) < b.get("distance_cm", 0):
            iss.append(_issue("warn", "K03", "%s: backstop radius %.1f below distance %.1f; vertices slip around it"
                              % (b.get("region", "?"), b.get("radius_cm", 0), b.get("distance_cm", 0)),
                              "wq0lY7vhF5w [00:22:19]"))
    if cfg.get("tethers_geodesic") is False:
        iss.append(_issue("warn", "K04", "tethers not geodesic: sleeves tether to the torso", "wq0lY7vhF5w [00:24:31]"))
    if cfg.get("use") == "game":
        if cfg.get("self_collision") == "point_face":
            iss.append(_issue("warn", "K05", "point-face self collision in a game; sphere self collision is the game path",
                              "wq0lY7vhF5w [00:29:46]"))
        if cfg.get("kinematic_collider_all_lods"):
            iss.append(_issue("warn", "K06", "kinematic collider on all LODs; nearby characters only, simplified body",
                              "wq0lY7vhF5w [00:28:33]-[00:29:41]"))
        if (cfg.get("substeps") or 1) > 2 and not cfg.get("backstops"):
            iss.append(_issue("info", "K07", "more substeps instead of backstops: backstop held clip-free cloth at 1 or 2 "
                              "substeps", "wq0lY7vhF5w [00:23:29]"))
    return verdict(iss)


def filter_bones_check(settings, frame_rate):
    """One Euro Filter Bones op (retargeting doc): Responsiveness 0.3 to 0.8; Velocity Cutoff 15 to 30 Hz
    to start, lower toward 20 if breathing or pumping shows, below frame_rate / 2."""
    iss = []
    r = settings.get("responsiveness")
    vc = settings.get("velocity_cutoff_hz")
    if r is not None and not (0.3 <= r <= 0.8):
        iss.append(_issue("warn", "E01", "Responsiveness %.2f outside 0.3 to 0.8" % r, "retargeting doc, Filter Bones"))
    if vc is not None:
        if vc >= frame_rate / 2.0:
            iss.append(_issue("error", "E02", "Velocity Cutoff %.1f Hz not below frame_rate/2 = %.1f" % (vc, frame_rate / 2.0),
                              "retargeting doc"))
        elif not (15.0 <= vc <= 30.0):
            iss.append(_issue("info", "E03", "Velocity Cutoff %.1f Hz outside the 15 to 30 Hz starting range" % vc,
                              "retargeting doc"))
    return verdict(iss)


def stepped_check(values, step, eps=1e-6):
    """True when a sampled channel changes only on multiples of `step` frames (Sir Wade's stepped timing,
    Cc1YgOxdNI8 [00:07:40]). values: per-frame numbers or tuples."""
    def diff(a, b):
        if isinstance(a, (list, tuple)):
            return max(abs(float(x) - float(y)) for x, y in zip(a, b))
        return abs(float(a) - float(b))
    bad = [i for i in range(1, len(values)) if diff(values[i], values[i - 1]) > eps and i % int(step) != 0]
    return {"ok": not bad, "off_step_changes": bad[:50], "step": int(step)}


def fbik_foot_defaults(mannequin_like=True):
    """FBIK settings for runtime foot IK (Control Rig doc). Knee preferred angle and ankle limits are for
    mannequin-like joint orientation; re-derive the axis for other skeletons."""
    d = dict(FBIK_MANNEQUIN)
    if not mannequin_like:
        d["knee_preferred_angle"] = {"axis": "[verify on this skeleton]", "degrees": 45.0}
    d["chain_depth_note"] = "chain depth localizes a goal's effect (Richardson [00:15:55])"
    d["exclude_not_lock"] = "exclude bones rather than making them fully stiff (Control Rig doc)"
    return d


# =============================================================================================
# 15. IN-EDITOR LAYER (NOT YET RUN IN UNREAL)
# =============================================================================================

MISSES: List[str] = []


def _u():
    import unreal  # noqa: F401
    return unreal


def _has(obj, name):
    try:
        return hasattr(obj, name)
    except Exception:
        return False


def _first_attr(obj, names):
    for n in names:
        if obj is not None and _has(obj, n):
            return n, getattr(obj, n)
    MISSES.append("%s: none of %s" % (getattr(obj, "__name__", type(obj).__name__), list(names)))
    return None, None


def _call(obj, names, *a, **k):
    """Call the first method of `names` that exists on obj; raise AttributeError with all tried names."""
    n, f = _first_attr(obj, names)
    if f is None:
        raise AttributeError("none of %s on %s [verify with job_00_anim_probe]" % (list(names), obj))
    return f(*a, **k)


def _get(obj, names, default=None):
    for n in ([names] if isinstance(names, str) else names):
        try:
            return obj.get_editor_property(n)
        except Exception:
            try:
                v = getattr(obj, n)
                return v() if callable(v) and n.startswith("get_") else v
            except Exception:
                continue
    return default


def _set(obj, names, value):
    last = None
    for n in ([names] if isinstance(names, str) else names):
        try:
            obj.set_editor_property(n, value)
            return n
        except Exception as exc:  # noqa: BLE001
            last = exc
    MISSES.append("set %s on %s: %s" % (names, type(obj).__name__, last))
    return None


def _enum(enum_name, member_candidates):
    u = _u()
    e = getattr(u, enum_name, None)
    if e is None:
        raise AttributeError("unreal.%s missing [verify]" % enum_name)
    for m in member_candidates:
        if _has(e, m):
            return getattr(e, m)
    raise AttributeError("unreal.%s has none of %s [verify]" % (enum_name, list(member_candidates)))


def load(path_or_obj):
    if not isinstance(path_or_obj, str):
        return path_or_obj
    u = _u()
    obj = u.load_asset(path_or_obj)
    if obj is None:
        raise RuntimeError("asset not found: %s" % path_or_obj)
    return obj


def _asset_tools():
    return _u().AssetToolsHelpers.get_asset_tools()


def _eas():
    u = _u()
    return u.get_editor_subsystem(u.EditorAssetSubsystem)


def _create_asset(path, cls_name, factory_names):
    """Create an asset at /Game/.../Name with the first factory class that exists [verify factories]."""
    u = _u()
    folder, name = path.rsplit("/", 1)
    cls = getattr(u, cls_name, None)
    if cls is None:
        raise AttributeError("unreal.%s missing (plugin enabled?)" % cls_name)
    fac = None
    for fn in factory_names:
        if _has(u, fn):
            fac = getattr(u, fn)()
            break
    if fac is None:
        raise AttributeError("no factory among %s [verify]" % list(factory_names))
    try:
        obj = _asset_tools().create_asset(name, folder, cls, fac, overwrite_existing=False)  # 5.8 flag
    except TypeError:
        obj = _asset_tools().create_asset(name, folder, cls, fac)
    if obj is None:
        raise RuntimeError("create_asset returned None for %s (exists already?)" % path)
    return obj


def save(obj_or_path):
    eas = _eas()
    if isinstance(obj_or_path, str):
        return eas.save_asset(obj_or_path, only_if_is_dirty=False)
    return eas.save_loaded_asset(obj_or_path, only_if_is_dirty=False)


# Names the skill marks [verify]; probe() reports which exist.
PROBE = {
    "IKRigDefinition": [], "IKRigController": ["get_controller", "set_skeletal_mesh", "apply_auto_generated_retarget_definition",
                                               "apply_auto_fbik", "set_pelvis", "set_retarget_root", "get_pelvis",
                                               "get_retarget_root", "add_retarget_chain", "get_retarget_chains",
                                               "add_new_goal", "add_solver", "connect_goal_to_solver", "set_root_bone"],
    "IKRetargeter": [], "IKRetargeterController": ["get_controller", "set_ik_rig", "set_preview_mesh", "add_default_ops",
                                                   "auto_map_chains", "create_retarget_pose", "auto_align_all_bones",
                                                   "snap_character_to_ground", "set_current_retarget_pose",
                                                   "get_num_retarget_ops", "get_retarget_op_at_index", "add_retarget_op",
                                                   "move_retarget_op_in_stack", "set_retarget_op_enabled",
                                                   "get_retarget_op_enabled", "duplicate_retarget_override_set"],
    "IKRetargetBatchOperation": ["run_batch_retarget", "duplicate_and_retarget"],
    "IKRetargetBatchOperationInputs": [],
    "IKRigDefinitionFactory": [], "IKRetargetFactory": [], "IKRetargeterFactory": [],
    "AnimationLibrary": ["get_num_frames", "get_frame_rate", "get_sequence_length", "get_animation_track_names",
                         "get_animation_curve_names", "get_float_keys", "remove_curve", "does_curve_exist",
                         "add_animation_notify_state_event", "add_animation_notify_track", "is_root_motion_enabled",
                         "set_root_motion_enabled", "find_bone_path_to_root", "get_bone_pose_for_frame"],
    "AnimPoseExtensions": ["get_anim_pose_at_frame", "get_anim_pose_at_time", "get_bone_pose", "get_bone_names",
                           "get_ref_pose", "get_ref_bone_pose"],
    "AnimPoseEvaluationOptions": [], "AnimPoseSpaces": [], "RawCurveTrackTypes": [],
    "PoseSearchDatabase": [], "PoseSearchSchema": [], "PoseSearchDatabaseFactory": [], "PoseSearchSchemaFactory": [],
    "PoseSearchMode": [], "PoseSearchDatabaseSequence": [], "PoseSearchDatabaseAnimationAsset": [],
    "AnimNotifyState_PoseSearchBlockTransition": [], "AnimNotifyState_PoseSearchExcludeFromDatabase": [],
    "AnimNotifyState_PoseSearchOverrideContinuingPoseCostBias": [], "AnimNotifyState_PoseSearchOverrideBaseCostBias": [],
    "AnimNotifyState_PoseSearchBranchIn": [],
    "SkeletalMeshEditorSubsystem": ["get_lod_count", "regenerate_lod", "get_num_verts"],
    "SkeletonModifier": ["set_skeletal_mesh", "get_all_bone_names", "get_parent_name", "commit_skeleton_to_skeletal_mesh"],
    "SkinWeightModifier": ["set_skeletal_mesh", "get_num_vertices", "get_vertex_weights"],
    "SkeletalMeshLODSettings": [], "SkeletalMeshComponentBudgeted": [],
    "InterchangeManager": ["get_interchange_manager_scripted", "create_source_data", "import_asset"],
    "InterchangeGenericAssetsPipeline": [], "ImportAssetParameters": [],
    "FbxImportUI": [], "FBXImportType": [], "FbxAnimSequenceImportData": [],
    "ControlRigBlueprintFactory": ["create_new_control_rig_asset", "create_control_rig_from_skeletal_mesh_or_skeleton"],
    "ControlRigSequencerLibrary": ["find_or_create_control_rig_track", "bake_to_control_rig",
                                   "load_anim_sequence_into_control_rig_section", "collapse_control_rig_anim_layers"],
    "SequencerTools": ["export_anim_sequence", "get_anim_sequence_link_from_level_sequence"],
    "ConstraintsScriptingLibrary": [], "AnimSeqExportOption": [],
    "MetaHumanCharacterEditorSubsystem": ["try_add_object_to_edit", "build_meta_human", "remove_object_to_edit"],
    "BlueprintEditorLibrary": ["compile_blueprint", "add_member_variable", "create_blueprint_asset_with_parent"],
    # 5.8: "For editing Blueprint graphs use the new BlueprintGraphEditor" (5.8 release notes, Blueprint). Whether
    # it reaches AnimGraph nodes (Motion Matching, Offset Root Bone, Steering) is unknown: the probe lists it.
    "BlueprintGraphEditor": [], "AnimationBlueprintLibrary": [],
    "TakeRecorderBlueprintLibrary": [], "MirrorDataTable": [],
    "PoseSearchFeatureChannel_Pose": [], "PoseSearchFeatureChannel_Position": [],
    "PoseSearchFeatureChannel_Trajectory": [], "PoseSearchFeatureChannel_Group": [],
    "AnimationModifierLibrary": [],
    "RootMotionMode": [], "VisibilityBasedAnimTickOption": [], "RetargetSourceOrTarget": [], "AutoMapChainType": [],
}


def probe():
    """Which [verify] classes, methods and enum members exist on this engine. Run first."""
    u = _u()
    rep = {"engine": str(getattr(u.SystemLibrary, "get_engine_version", lambda: "?")()), "classes": {}, "enums": {}}
    for cls, methods in PROBE.items():
        obj = getattr(u, cls, None)
        if obj is None:
            rep["classes"][cls] = None
            continue
        names = [n for n in dir(obj) if not n.startswith("_")]
        rep["classes"][cls] = {"present": True, "wanted": {m: (m in names) for m in methods},
                               "all": names[:400]}
    for e in ("RootMotionMode", "VisibilityBasedAnimTickOption", "RetargetSourceOrTarget", "AutoMapChainType",
              "AnimPoseSpaces", "PoseSearchMode", "RawCurveTrackTypes", "RootMotionRootLock", "FBXImportType",
              "MetaHumanDefaultPipelineType", "MetaHumanQualityLevel"):
        obj = getattr(u, e, None)
        rep["enums"][e] = [n for n in dir(obj) if n.isupper()] if obj is not None else None
    return rep


# ----------------------------------------------------------------------------- facts

def _bone_names_and_parents(mesh):
    """Bone names and parents of a skeletal mesh by the first route that works [verify]:
    SkeletonModifier (5.4+), else AnimPose reference pose names (parents unknown)."""
    u = _u()
    if _has(u, "SkeletonModifier"):
        try:
            sm = u.SkeletonModifier()
            sm.set_skeletal_mesh(mesh)
            names = [str(n) for n in sm.get_all_bone_names()]
            parents = {}
            for n in names:
                p = str(sm.get_parent_name(n))
                parents[n] = None if p in ("None", "") else p
            return names, parents, "SkeletonModifier"
        except Exception as exc:  # noqa: BLE001
            MISSES.append("SkeletonModifier route failed: %s" % exc)
    skel = _get(mesh, ["skeleton"])
    pose = _call(u.AnimPoseExtensions, ["get_ref_pose"], skel)
    names = [str(n) for n in _call(u.AnimPoseExtensions, ["get_bone_names"], pose)]
    return names, {}, "AnimPoseExtensions (no parents)"


def skeletal_mesh_facts(mesh_or_path):
    """Facts for import_audit and transfer_method. Influences per vertex need SkinWeightModifier
    [verify]; when absent, max_influences is None and the check falls back to the GUI (Skeletal Mesh
    editor vertex inspection, Biava [00:02:30])."""
    u = _u()
    mesh = load(mesh_or_path)
    names, parents, route = _bone_names_and_parents(mesh)
    facts = {"path": mesh.get_path_name(), "bones": names, "parents": parents, "parents_route": route}
    skel = _get(mesh, ["skeleton"])
    facts["skeleton"] = skel.get_path_name() if skel else None
    pa = _get(mesh, ["physics_asset"])
    facts["physics_asset"] = pa.get_path_name() if pa else None
    try:
        facts["lod_count"] = int(u.get_editor_subsystem(u.SkeletalMeshEditorSubsystem).get_lod_count(mesh))
    except Exception:
        try:
            facts["lod_count"] = len(_get(mesh, ["lod_info"]) or [])
        except Exception:
            facts["lod_count"] = None
    try:
        facts["morph_target_count"] = len(list(_get(mesh, ["morph_targets"]) or []))
    except Exception:
        facts["morph_target_count"] = None
    try:
        b = mesh.get_bounds() if _has(mesh, "get_bounds") else mesh.get_imported_bounds()
        facts["height_cm"] = float(b.box_extent.z) * 2.0
    except Exception:
        facts["height_cm"] = None
    try:
        pose = u.AnimPoseExtensions.get_ref_pose(skel)
        root = [n for n in names if not parents or parents.get(n) is None][0]
        t = u.AnimPoseExtensions.get_ref_bone_pose(pose, root, u.AnimPoseSpaces.WORLD)
        facts["root_location"] = [t.translation.x, t.translation.y, t.translation.z]
        r = t.rotation.rotator()
        facts["root_rotation"] = [r.roll, r.pitch, r.yaw]
    except Exception as exc:  # noqa: BLE001
        MISSES.append("root ref pose: %s" % exc)
    if _has(u, "SkinWeightModifier"):
        try:
            sw = u.SkinWeightModifier()
            sw.set_skeletal_mesh(mesh)
            weighted, mx = set(), 0
            for v in range(int(sw.get_num_vertices())):
                w = sw.get_vertex_weights(v)
                items = w.items() if hasattr(w, "items") else []
                nz = [str(k) for k, val in items if float(val) > 0.0]
                weighted.update(nz)
                mx = max(mx, len(nz))
            facts["weighted_bones"] = sorted(weighted)
            facts["max_influences"] = [mx]
        except Exception as exc:  # noqa: BLE001
            MISSES.append("SkinWeightModifier route failed: %s" % exc)
    return facts


def anim_clip_facts(seq_or_path, bones=("root", "pelvis", "foot_l", "foot_r", "ball_l", "ball_r", "spine_05"),
                    sample=True, zero_check=True):
    """Facts for anim_content_audit, root_motion_check and foot_contact_metrics. Bone positions are
    component-space ('WORLD' in AnimPose terms) per frame, root motion kept on the root [verify].
    Never sample positions with AnimationLibrary.get_bone_pose_for_frame / _for_time: they return a
    parent-relative (bone-space) transform, so foot heights and slides would be wrong [added, verify]."""
    u = _u()
    seq = load(seq_or_path)
    lib = u.AnimationLibrary
    f = {"name": seq.get_name(), "path": seq.get_path_name()}
    skel = _get(seq, ["skeleton"])
    f["skeleton"] = skel.get_path_name() if skel else None
    f["frames"] = int(_call(lib, ["get_num_frames"], seq))
    try:
        fr = _call(lib, ["get_frame_rate"], seq)
        f["fps"] = float(fr.numerator) / float(fr.denominator) if hasattr(fr, "numerator") else float(fr)
    except Exception:
        length = float(_call(lib, ["get_sequence_length"], seq))
        f["fps"] = (f["frames"] - 1) / length if length > 0 else None
    f["tracks"] = [str(t) for t in _call(lib, ["get_animation_track_names"], seq)]
    curves = {}
    try:
        names = _call(lib, ["get_animation_curve_names"], seq, u.RawCurveTrackTypes.RCT_FLOAT)
        for c in names:
            entry = {}
            if zero_check:
                try:
                    times, values = lib.get_float_keys(seq, c)
                    entry["all_zero"] = all(abs(float(v)) < 1e-6 for v in values)
                except Exception:
                    pass
            curves[str(c)] = entry
    except Exception as exc:  # noqa: BLE001
        MISSES.append("curve names: %s" % exc)
    f["curves"] = curves
    f["root_motion"] = bool(_get(seq, ["enable_root_motion"], False))
    comp = _get(seq, ["bone_compression_settings"])
    f["compression"] = comp.get_name() if comp else "None"
    if sample:
        opts = u.AnimPoseEvaluationOptions()
        _set(opts, ["extract_root_motion"], False)
        samples = {b: [] for b in bones}
        present = None
        for i in range(f["frames"]):
            pose = _call(u.AnimPoseExtensions, ["get_anim_pose_at_frame"], seq, i, opts)
            if present is None:
                present = set(str(n) for n in u.AnimPoseExtensions.get_bone_names(pose))
            for b in bones:
                if b in present:
                    t = u.AnimPoseExtensions.get_bone_pose(pose, b, u.AnimPoseSpaces.WORLD)
                    samples[b].append([t.translation.x, t.translation.y, t.translation.z])
        f["samples"] = {b: v for b, v in samples.items() if v}
    return f


# ----------------------------------------------------------------------------- import

_DEFAULT_PIPELINES = ("/Interchange/Pipelines/DefaultAssetsPipeline", "/Interchange/Pipelines/DefaultFbxAssetsPipeline")


def _pipeline_copy(dest_path, source_candidates=_DEFAULT_PIPELINES):
    """Duplicate Epic's default assets pipeline to dest_path once (editable, saved). [verify paths]"""
    eas = _eas()
    if eas.does_asset_exist(dest_path):
        return load(dest_path)
    for src in source_candidates:
        if eas.does_asset_exist(src):
            obj = eas.duplicate_asset(src, dest_path)
            if obj is not None:
                return obj
    raise RuntimeError("no default Interchange assets pipeline found among %s [verify]" % list(source_candidates))


def _set_path(obj, dotted, value):
    """Set nested pipeline properties such as 'animation_pipeline.import_animations' [verify names]."""
    parts = dotted.split(".")
    cur = obj
    for p in parts[:-1]:
        cur = _get(cur, [p])
        if cur is None:
            MISSES.append("pipeline property %s missing" % dotted)
            return False
    return _set(cur, [parts[-1]], value) is not None


def configure_character_pipeline(pipe, skeleton=None, only_animations=False, sample_rate=None,
                                 create_physics=True, morphs=True, zero_curves_off=True):
    """Interchange generic assets pipeline options for characters (5.8 Interchange import reference names;
    Python paths [verify])."""
    rows = [
        ("common_skeletal_meshes_and_animations_properties.import_only_animations", bool(only_animations)),
        ("mesh_pipeline.import_skeletal_meshes", not only_animations),
        ("mesh_pipeline.import_morph_targets", bool(morphs)),
        ("mesh_pipeline.create_physics_asset", bool(create_physics) and not only_animations),
        ("animation_pipeline.import_animations", True),
        ("animation_pipeline.import_bone_tracks", True),
        ("animation_pipeline.do_not_import_curve_with_zero", bool(zero_curves_off)),
        ("animation_pipeline.delete_existing_custom_attribute_curves", True),
    ]
    if skeleton is not None:
        rows.append(("common_skeletal_meshes_and_animations_properties.skeleton", load(skeleton)))
    if sample_rate is None:
        rows.append(("animation_pipeline.use30hz_to_bake_bone_animation", True))
    else:
        rows.append(("animation_pipeline.use30hz_to_bake_bone_animation", False))
        rows.append(("animation_pipeline.custom_bone_animation_sample_rate", int(sample_rate)))
    done = {path: _set_path(pipe, path, val) for path, val in rows}
    return done


def _legacy_fbx_options(skeleton=None, only_animations=False, sample_rate=None, create_physics=True, morphs=True):
    u = _u()
    o = u.FbxImportUI()
    _set(o, ["import_mesh"], not only_animations)
    _set(o, ["import_as_skeletal"], True)
    _set(o, ["import_animations"], True)
    _set(o, ["import_materials"], False)
    _set(o, ["import_textures"], False)
    _set(o, ["create_physics_asset"], bool(create_physics) and not only_animations)
    _set(o, ["mesh_type_to_import"], _enum("FBXImportType", ["FBXIT_ANIMATION"] if only_animations else ["FBXIT_SKELETAL_MESH"]))
    if skeleton is not None:
        _set(o, ["skeleton"], load(skeleton))
    sk = _get(o, ["skeletal_mesh_import_data"])
    if sk is not None:
        _set(sk, ["import_morph_targets"], bool(morphs))
        _set(sk, ["convert_scene"], True)
    an = _get(o, ["anim_sequence_import_data"])
    if an is not None:
        _set(an, ["import_bone_tracks"], True)
        _set(an, ["do_not_import_curve_with_zero"], True)
        _set(an, ["delete_existing_custom_attribute_curves"], True)
        if sample_rate is None:
            _set(an, ["use_default_sample_rate"], True)
        else:
            _set(an, ["use_default_sample_rate"], False)
            _set(an, ["custom_sample_rate"], int(sample_rate))
    return o


def _import_one(path, dest, pipe=None, legacy_options=None, use_interchange=True):
    u = _u()
    if use_interchange and _has(u, "InterchangeManager") and pipe is not None:
        mgr = u.InterchangeManager.get_interchange_manager_scripted()
        params = u.ImportAssetParameters()
        _set(params, ["is_automated"], True)
        _set(params, ["replace_existing"], True)
        pipes = list(_get(params, ["override_pipelines"]) or [])
        pipes.append(u.SoftObjectPath(pipe.get_path_name()))
        _set(params, ["override_pipelines"], pipes)
        objs = mgr.import_asset(dest, u.InterchangeManager.create_source_data(path), params)
        return [o for o in (objs or []) if o is not None], "interchange"
    task = u.AssetImportTask()
    for name, val in (("filename", path), ("destination_path", dest), ("automated", True),
                      ("replace_existing", True), ("save", True)):
        _set(task, [name], val)
    if legacy_options is not None:
        _set(task, ["options"], legacy_options)
    _asset_tools().import_asset_tasks([task])
    return list(task.get_objects()), "legacy"


def import_character(fbx, dest, skeleton=None, create_physics=True, morphs=True, use_interchange=True,
                     pipeline_path="/Game/_Agent/Pipelines/PL_Character"):
    """Import a skeletal mesh FBX with explicit options (never the dialog's remembered ones).
    skeleton=None creates <Mesh>_Skeleton; pass the shared skeleton to reuse it. NOT YET RUN."""
    pipe = None
    if use_interchange:
        try:
            pipe = _pipeline_copy(pipeline_path)
            configure_character_pipeline(pipe, skeleton=skeleton, create_physics=create_physics, morphs=morphs)
            save(pipe)
        except Exception as exc:  # noqa: BLE001
            MISSES.append("interchange pipeline: %s" % exc)
            pipe = None
    legacy = None if pipe is not None else _legacy_fbx_options(skeleton, False, None, create_physics, morphs)
    objs, route = _import_one(fbx, dest, pipe, legacy, use_interchange and pipe is not None)
    return {"route": route, "objects": [o.get_path_name() for o in objs], "misses": list(MISSES)}


def import_animations(files, dest, skeleton, sample_rate=None, use_interchange=True,
                      pipeline_path="/Game/_Agent/Pipelines/PL_AnimOnly"):
    """Animation-only imports against an existing skeleton (mandatory: FBX animation pipeline). One clip per
    file from Maya. Checks each result's skeleton. NOT YET RUN."""
    skel = load(skeleton)
    pipe = None
    if use_interchange:
        try:
            pipe = _pipeline_copy(pipeline_path)
            configure_character_pipeline(pipe, skeleton=skel, only_animations=True, sample_rate=sample_rate)
            save(pipe)
        except Exception as exc:  # noqa: BLE001
            MISSES.append("interchange pipeline: %s" % exc)
            pipe = None
    legacy = None if pipe is not None else _legacy_fbx_options(skel, True, sample_rate)
    out = []
    for f in files:
        objs, route = _import_one(f, dest, pipe, legacy, use_interchange and pipe is not None)
        for o in objs:
            s = _get(o, ["skeleton"])
            out.append({"file": f, "asset": o.get_path_name(), "route": route,
                        "skeleton_ok": bool(s) and s.get_path_name() == skel.get_path_name()})
    return out


# ----------------------------------------------------------------------------- clip edits

def ensure_root_motion(seqs, enabled=True, root_lock=None):
    """Set Enable Root Motion (and optionally Root Motion Root Lock: REF_POSE, ANIM_FIRST_FRAME, ZERO)."""
    done = []
    for s in seqs:
        seq = load(s)
        _set(seq, ["enable_root_motion"], bool(enabled))
        if root_lock:
            _set(seq, ["root_motion_root_lock"], _enum("RootMotionRootLock", [root_lock]))
        save(seq)
        done.append(seq.get_path_name())
    return done


def strip_curves(seq_or_path, patterns=(MAYA_HELPER_CURVE_RE.pattern,), remove_all_zero=True, dry_run=True):
    """Remove Maya helper curves and all-zero float curves from a clip (Lake). Bone tracks are best
    removed at the source. dry_run lists without editing. Snapshot the clip first (it saves)."""
    u = _u()
    seq = load(seq_or_path)
    lib = u.AnimationLibrary
    pats = [re.compile(p, re.I) for p in patterns]
    remove = []
    for c in lib.get_animation_curve_names(seq, u.RawCurveTrackTypes.RCT_FLOAT):
        c = str(c)
        hit = any(p.search(c) for p in pats)
        if not hit and remove_all_zero:
            try:
                _, values = lib.get_float_keys(seq, c)
                hit = all(abs(float(v)) < 1e-6 for v in values)
            except Exception:
                pass
        if hit:
            remove.append(c)
    if not dry_run:
        for c in remove:
            lib.remove_curve(seq, c, False)
        save(seq)
    return {"clip": seq.get_path_name(), "removed" if not dry_run else "would_remove": remove}


# ----------------------------------------------------------------------------- IK Rig and retargeter

def create_ik_rig(mesh, path, plan=None):
    """IK Rig for a skeletal mesh: auto template and auto FBIK first; plan (from biped_chain_plan) as the
    manual fallback. NOT YET RUN, names [verify]."""
    u = _u()
    mesh = load(mesh)
    rig = _create_asset(path, "IKRigDefinition", ["IKRigDefinitionFactory"])
    c = u.IKRigController.get_controller(rig)
    _call(c, ["set_skeletal_mesh"], mesh)
    report = {"asset": rig.get_path_name(), "auto": False}
    if plan is None:
        try:
            _call(c, ["apply_auto_generated_retarget_definition"])
            _call(c, ["apply_auto_fbik"])
            report["auto"] = True
        except Exception as exc:  # noqa: BLE001
            report["auto_error"] = str(exc)
    if plan is not None or not report["auto"]:
        if plan is None:
            raise RuntimeError("auto template failed; build a plan with biped_chain_plan(bones, parents)")
        if plan.get("pelvis"):
            _call(c, ["set_pelvis", "set_retarget_root"], plan["pelvis"])
        for ch in plan["chains"]:
            _call(c, ["add_retarget_chain"], ch["name"], ch["start"], ch["end"], ch.get("goal") or "")
        report["chains"] = [ch["name"] for ch in plan["chains"]]
    save(rig)
    return report


def ik_rig_facts(rig):
    """Chains (name, start, end, goal) and pelvis for chain_map_check [verify getters]."""
    u = _u()
    rig = load(rig)
    c = u.IKRigController.get_controller(rig)
    chains = []
    for ch in _call(c, ["get_retarget_chains"]):
        chains.append({"name": str(_get(ch, ["chain_name", "name"])), "start": str(_get(ch, ["start_bone"])),
                       "end": str(_get(ch, ["end_bone"])), "goal": str(_get(ch, ["ik_goal_name", "goal"]) or "") or None})
    try:
        pel = str(_call(c, ["get_pelvis", "get_retarget_root"]))
    except Exception:
        pel = None
    return {"pelvis": pel, "chains": chains}


def create_retargeter(path, source_rig, target_rig, source_mesh=None, target_mesh=None, template=None,
                      pose_name="Aligned"):
    """Retargeter from a template (duplicate, swap target rig and mesh: the retargeter adapts by name
    matching, retargeting doc) or from scratch (default ops, exact chain map, new named pose, auto
    align). Op settings the controller cannot reach are set once in the GUI on the template.
    NOT YET RUN, names [verify]."""
    u = _u()
    if template:
        rtg = _eas().duplicate_asset(template, path)
        if rtg is None:
            raise RuntimeError("duplicate failed: %s -> %s" % (template, path))
    else:
        rtg = _create_asset(path, "IKRetargeter", ["IKRetargetFactory", "IKRetargeterFactory"])
    c = u.IKRetargeterController.get_controller(rtg)
    S, T = u.RetargetSourceOrTarget.SOURCE, u.RetargetSourceOrTarget.TARGET
    _call(c, ["set_ik_rig"], S, load(source_rig))
    _call(c, ["set_ik_rig"], T, load(target_rig))
    if source_mesh:
        _call(c, ["set_preview_mesh"], S, load(source_mesh))
    if target_mesh:
        _call(c, ["set_preview_mesh"], T, load(target_mesh))
    steps = {}
    if not template:
        for label, names, args in (("default_ops", ["add_default_ops"], ()),
                                   ("map_chains", ["auto_map_chains"], (u.AutoMapChainType.EXACT, True)),
                                   ("pose", ["create_retarget_pose"], (pose_name, T)),
                                   ("align", ["auto_align_all_bones"], (T,)),
                                   ("ground", ["snap_character_to_ground"], (T,))):
            try:
                _call(c, names, *args)
                steps[label] = True
            except Exception as exc:  # noqa: BLE001
                steps[label] = "failed: %s" % exc
    save(rtg)
    return {"asset": rtg.get_path_name(), "from_template": bool(template), "steps": steps,
            "gui_todo": [] if template else ["op settings: Blend to Source on legs, Scale Source if needed, "
                                             "Root Motion source, Floor Constraint; then save as RTG_Template"]}


def retargeter_facts(rtg):
    """Op stack as op_stack_check input [verify controller getters; fallback reads 'retarget_ops']."""
    u = _u()
    rtg = load(rtg)
    c = u.IKRetargeterController.get_controller(rtg)
    ops = []
    try:
        for i in range(int(_call(c, ["get_num_retarget_ops"]))):
            op = _call(c, ["get_retarget_op_at_index"], i)
            typ = type(op).__name__.replace("IKRetarget", "").replace("Op", "")
            ops.append({"type": re.sub(r"(?<!^)(?=[A-Z])", " ", typ).strip(), "index": i,
                        "enabled": bool(_call(c, ["get_retarget_op_enabled"], i)) if _has(c, "get_retarget_op_enabled") else True})
    except Exception as exc:  # noqa: BLE001
        MISSES.append("retargeter ops: %s" % exc)
    return ops


def batch_retarget(anims, source_mesh, target_mesh, retargeter, suffix="_Retarget", prefix="", folder="",
                   retain_additive=True, override_set=""):
    """Offline batch retarget. 5.8: RunBatchRetarget with FIKRetargetBatchOperationInputs (bRetainAdditiveFlags,
    release notes); fallback: duplicate_and_retarget (pre-5.8 signature). NOT YET RUN, names [verify]."""
    u = _u()
    assets = [load(a) for a in anims]
    op = u.IKRetargetBatchOperation
    if _has(op, "run_batch_retarget") and _has(u, "IKRetargetBatchOperationInputs"):
        inp = u.IKRetargetBatchOperationInputs()
        for names, val in ((["assets_to_retarget", "assets"], assets), (["source_mesh"], load(source_mesh)),
                           (["target_mesh"], load(target_mesh)), (["retargeter", "ik_retarget_asset"], load(retargeter)),
                           (["suffix"], suffix), (["prefix"], prefix), (["folder_path", "output_folder"], folder),
                           (["retain_additive_flags", "b_retain_additive_flags"], bool(retain_additive)),
                           (["override_set_to_apply", "override_set"], override_set)):
            if val not in ("", None):
                _set(inp, names, val)
        res = op.run_batch_retarget(inp)
        route = "run_batch_retarget"
    else:
        res = op.duplicate_and_retarget(assets, load(source_mesh), load(target_mesh), load(retargeter),
                                        "", "", prefix, suffix, True)
        route = "duplicate_and_retarget"
    out = [getattr(a, "get_path_name", lambda: str(a))() for a in (res or [])]
    return {"route": route, "created": out}


# ----------------------------------------------------------------------------- Pose Search

POSE_SEARCH_TAGS = {
    "block_transition_in": ["AnimNotifyState_PoseSearchBlockTransition"],
    "exclude": ["AnimNotifyState_PoseSearchExcludeFromDatabase"],
    "continuing_bias": ["AnimNotifyState_PoseSearchOverrideContinuingPoseCostBias"],
    "base_bias": ["AnimNotifyState_PoseSearchOverrideBaseCostBias"],
    "branch_in": ["AnimNotifyState_PoseSearchBranchIn"],
}


def duplicate_assets(pairs):
    """[(source_path, dest_path)] duplicated with EditorAssetSubsystem (GASP schemas, databases, Chooser)."""
    eas = _eas()
    out = []
    for src, dst in pairs:
        obj = eas.duplicate_asset(src, dst) if not eas.does_asset_exist(dst) else load(dst)
        out.append({"src": src, "dst": dst, "ok": obj is not None})
    return out


def set_database(db, schema=None, clips=None, search_mode=None, continuing_pose_cost_bias=None):
    """Set a Pose Search database's schema, search mode, bias and (if Python reaches it) its assets.
    5.7 renamed AnimationAssets to DatabaseAnimationAssets. Entry structs [verify]; when no route works,
    the report says so and the clips are added in the database editor Asset Browser (GUI)."""
    u = _u()
    db = load(db)
    rep = {"db": db.get_path_name()}
    if schema:
        rep["schema"] = _set(db, ["schema"], load(schema))
    if search_mode:
        rep["search_mode"] = _set(db, ["pose_search_mode"], _enum("PoseSearchMode", [search_mode, search_mode.upper()]))
    if continuing_pose_cost_bias is not None:
        rep["continuing_bias"] = _set(db, ["continuing_pose_cost_bias"], float(continuing_pose_cost_bias))
    if clips:
        entries = []
        struct = getattr(u, "PoseSearchDatabaseAnimationAsset", None) or getattr(u, "PoseSearchDatabaseSequence", None)
        if struct is None:
            rep["clips"] = "no entry struct exposed: add clips in the database editor (GUI)"
        else:
            for c in clips:
                e = struct()
                _set(e, ["animation_asset", "sequence"], load(c))
                entries.append(e)
            rep["clips"] = _set(db, ["database_animation_assets", "animation_assets"], entries) or \
                "property not writable: add clips in the database editor (GUI)"
    save(db)
    return rep


def _bone_name(ref):
    if ref is None:
        return None
    for n in ("bone_name", "name"):
        try:
            v = ref.get_editor_property(n)
            if v is not None and str(v) not in ("", "None"):
                return str(v)
        except Exception:
            continue
    return None


def schema_facts(schema):
    """Skeleton, mirror data table and bone names referenced by a Pose Search schema's channels, as input to
    schema_bone_check. Channels are instanced objects; property names are [verify] candidates ('channels',
    'bone', 'sampled_bones' with 'reference', 'sub_channels', 'skeletons' with 'skeleton' and
    'mirror_data_table'). When nothing is readable, read the channels in the schema editor (GUI).
    NOT YET RUN IN UNREAL."""
    sch = load(schema)
    rep = {"schema": sch.get_path_name(), "skeleton": None, "mirror_table_skeleton": None, "bones": {}}
    roled = _get(sch, ["skeletons"])
    first = list(roled)[0] if roled else None
    skel = _get(first, ["skeleton"]) if first is not None else _get(sch, ["skeleton"])
    rep["skeleton"] = skel.get_path_name() if skel else None
    mdt = _get(first, ["mirror_data_table"]) if first is not None else _get(sch, ["mirror_data_table"])
    if mdt is not None:
        ms = _get(mdt, ["skeleton"])
        rep["mirror_table_skeleton"] = ms.get_path_name() if ms else None

    def walk(ch, label):
        names = []
        b = _bone_name(_get(ch, ["bone"]))
        if b:
            names.append(b)
        for sb in list(_get(ch, ["sampled_bones"]) or []):
            nb = _bone_name(_get(sb, ["reference", "bone"]))
            if nb:
                names.append(nb)
        if names:
            rep["bones"].setdefault(label, []).extend(names)
        for i, sub in enumerate(list(_get(ch, ["sub_channels"]) or [])):
            walk(sub, "%s/%s%d" % (label, type(sub).__name__, i))

    chans = list(_get(sch, ["channels"]) or [])
    for i, ch in enumerate(chans):
        walk(ch, "%s%d" % (type(ch).__name__, i))
    if not chans:
        rep["note"] = "channels not readable from Python: read them in the schema editor"
    return rep


def add_pose_search_tag(seq_or_path, kind, start_s, duration_s, track="PoseSearch"):
    """Add a Pose Search notify state (Block Transition In, Exclude From Database, Override Continuing Pose
    Cost Bias, Override Base Cost Bias, Branch In) on a frame window: late tuning without schema changes
    (Jose tNw9lD2PW3U [00:18:28]). Class names [verify]."""
    u = _u()
    seq = load(seq_or_path)
    cls = None
    for n in POSE_SEARCH_TAGS[kind]:
        cls = getattr(u, n, None)
        if cls is not None:
            break
    if cls is None:
        raise AttributeError("no notify state class for %s [verify]" % kind)
    lib = u.AnimationLibrary
    try:
        lib.add_animation_notify_track(seq, track)
    except Exception:
        pass
    ev = lib.add_animation_notify_state_event(seq, track, float(start_s), float(duration_s), cls)
    save(seq)
    return {"clip": seq.get_path_name(), "kind": kind, "event": str(ev)}


# ----------------------------------------------------------------------------- AnimBP, montages, budget

def animbp_settings(bp_or_path, multithreaded=True, warn_bp_usage=True, root_motion_mode="ROOT_MOTION_FROM_MONTAGES_ONLY"):
    """AnimBP class settings and the anim instance CDO's Root Motion Mode [verify names]."""
    u = _u()
    bp = load(bp_or_path)
    rep = {"bp": bp.get_path_name(),
           "multithreaded": _set(bp, ["use_multi_threaded_animation_update"], bool(multithreaded)),
           "warn_bp_usage": _set(bp, ["warn_about_blueprint_usage"], bool(warn_bp_usage))}
    if root_motion_mode:
        try:
            cdo = u.get_default_object(bp.generated_class())
            rep["root_motion_mode"] = _set(cdo, ["root_motion_mode"], _enum("RootMotionMode", [root_motion_mode]))
        except Exception as exc:  # noqa: BLE001
            rep["root_motion_mode"] = "failed: %s" % exc
    return rep


def compile_and_scan(bp_or_path, log_tail_lines=4000):
    """Compile an AnimBP and scan the newest log for Blueprint usage (fast path) warnings about it.
    Message text [verify]; the Compiler Results panel is the GUI truth."""
    u = _u()
    bp = load(bp_or_path)
    u.BlueprintEditorLibrary.compile_blueprint(bp)
    save(bp)
    hits = []
    try:
        log_dir = u.Paths.project_log_dir()
        logs = sorted((os.path.join(log_dir, f) for f in os.listdir(log_dir) if f.endswith(".log")), key=os.path.getmtime)
        with open(logs[-1], errors="ignore") as fh:
            lines = fh.readlines()[-log_tail_lines:]
        name = bp.get_name()
        for line in lines:
            if name in line and re.search(r"Blueprint (usage|VM)|fast path|not thread safe|thread-safe", line, re.I):
                hits.append(line.strip()[:300])
    except Exception as exc:  # noqa: BLE001
        hits.append("log scan failed: %s" % exc)
    return {"bp": bp.get_path_name(), "warnings": hits, "ok": not hits}


def set_montage_blend_out(montage, trigger_time=0.0):
    m = load(montage)
    n = _set(m, ["blend_out_trigger_time"], float(trigger_time))
    save(m)
    return {"montage": m.get_path_name(), "set": n}


def console(cmd):
    u = _u()
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    u.SystemLibrary.execute_console_command(world, cmd)
    return cmd


def budget_console(budget_ms=None, enabled=True, debug=False):
    """a.Budget.Enabled, a.Budget.BudgetMs, a.Budget.Debug.Enabled (AnimBP doc cvar table)."""
    cmds = ["a.Budget.Enabled %d" % (1 if enabled else 0)]
    if budget_ms is not None:
        cmds.append("a.Budget.BudgetMs %s" % budget_ms)
    cmds.append("a.Budget.Debug.Enabled %d" % (1 if debug else 0))
    return [console(c) for c in cmds]


# ----------------------------------------------------------------------------- MetaHuman, bake, rigs

def metahuman_build(character_path, quality="MEDIUM", pipeline="OPTIMIZED"):
    """Assemble a MetaHuman for games (MetaHuman doc Python, 'Assemble a Character'). Never CINE for games."""
    u = _u()
    sub = u.get_editor_subsystem(u.MetaHumanCharacterEditorSubsystem)
    ch = load(character_path)
    if not sub.try_add_object_to_edit(ch):
        raise RuntimeError("Unable to edit asset, is it already open for edit?")
    try:
        p = u.MetaHumanCharacterEditorBuildParameters()
        p.pipeline_type = getattr(u.MetaHumanDefaultPipelineType, pipeline)
        p.pipeline_quality = getattr(u.MetaHumanQualityLevel, quality)
        sub.build_meta_human(ch, p)
    finally:
        sub.remove_object_to_edit(ch)
    return {"character": character_path, "pipeline": pipeline, "quality": quality}


def bake_to_anim_sequence(level_sequence, binding, dest_path, link=True):
    """Bake a Sequencer binding (live Control Rig, layers) to an AnimSequence; link=True makes a linked
    sequence that re-bakes on edits (Control Rig doc, SequencerTools.export_anim_sequence)."""
    u = _u()
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    seq = load(level_sequence)
    folder, name = dest_path.rsplit("/", 1)
    anim = _asset_tools().create_asset(name, folder, u.AnimSequence, u.AnimSequenceFactory())
    opts = u.AnimSeqExportOption()
    ok = u.SequencerTools.export_anim_sequence(world, seq, anim, opts, binding, bool(link))
    save(anim)
    return {"anim": anim.get_path_name(), "ok": bool(ok), "linked": bool(link)}


def control_rig_from_mesh(mesh):
    """Create a Control Rig from a skeletal mesh (Control Rig doc). Graph logic: replay a script dumped with
    Class Settings > Copy Python Script, or author once by computer use."""
    u = _u()
    try:
        u.load_module("ControlRigDeveloper")
    except Exception:
        pass
    rig = u.ControlRigBlueprintFactory.create_control_rig_from_skeletal_mesh_or_skeleton(selected_object=load(mesh))
    try:
        rig.recompile_vm()
    except Exception:
        pass
    return rig


def review_sequence(mesh, anim, dest_path, fps=30):
    """A Level Sequence with a spawnable skeletal mesh playing `anim`, for contact-frame stills with
    ue_review.render_still(seq, out_dir, frame=f). Cameras are added by the caller [verify API]."""
    u = _u()
    folder, name = dest_path.rsplit("/", 1)
    seq = _asset_tools().create_asset(name, folder, u.LevelSequence, u.LevelSequenceFactoryNew())
    les = u.get_editor_subsystem(u.LevelSequenceEditorSubsystem)
    binding = les.add_spawnable_from_class(seq, u.SkeletalMeshActor)
    tpl = binding.get_object_template() if _has(binding, "get_object_template") else None
    if tpl is not None:
        comp = tpl.skeletal_mesh_component
        if _has(comp, "set_skeletal_mesh_asset"):
            comp.set_skeletal_mesh_asset(load(mesh))
        else:
            comp.set_editor_property("skeletal_mesh", load(mesh))
    track = binding.add_track(u.MovieSceneSkeletalAnimationTrack)
    sec = track.add_section()
    a = load(anim)
    params = sec.get_editor_property("params")
    params.set_editor_property("animation", a)
    sec.set_editor_property("params", params)
    n = int(u.AnimationLibrary.get_num_frames(a))
    seq.set_display_rate(u.FrameRate(int(fps), 1))
    sec.set_range(0, n)
    seq.set_playback_start(0)
    seq.set_playback_end(n)
    save(seq)
    return {"sequence": seq.get_path_name(), "frames": n}


if __name__ == "__main__":
    print(json.dumps({"module": "ue_anim", "version": __version__,
                      "offline": [n for n in sorted(globals()) if not n.startswith("_") and callable(globals()[n])][:80]},
                     indent=1))
