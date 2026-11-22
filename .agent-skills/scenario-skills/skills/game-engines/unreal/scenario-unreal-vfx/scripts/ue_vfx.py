"""
ue_vfx.py: toolkit of the scenario-unreal-vfx skill (UE 5.8, macOS Apple Silicon).

Two layers in one file:

1. OFFLINE layer (system python3, stdlib; numpy + Pillow only for the image metrics).
   Effect Type presets, element classification (Kiraly's table), template contracts,
   caps / pool / flipbook / texture / Niagara system / Geometry Collection / physical
   material verdicts, strain planning, budget checks, and the VFX critique metrics that
   run on captured frames (value bands, blowout, saturation, focal contrast, footprint
   against the gameplay radius, intensity over time, linger, strobing, size classes,
   palette shares, colour-blind contrast) plus rubric scoring.
   v0.2 adds (section 2b and the metrics): Effect Type per system (system_plan), lever per
   thread (lever_check), FX budget guard and oscillation, strobe risk, fixed bounds for travelling
   effects, spawn schedule (build-up stops at the hit, cause order, wind-up sync), duplicate-spawn
   blowout diagnosis, opacity fade and flipbook playback curves, saturation under values, accent at
   the focal point, size classes over time, premultiplied bake, source mesh watertightness and a
   destructible recipe verdict (damage model, removal, crumbling, interior bake, events, settling).
   Tested by tests/code/unreal-vfx/test_vfx_offline.py (passed offline, see the skill).

2. IN-EDITOR layer (Editor Python inside UnrealEditor 5.8, `import unreal`).
   Template duplication, User parameters, system properties, Effect Type creation and
   assignment, asset audits, pooled spawning, deterministic capture series, Geometry
   Collection hardening and strain calls, and an API probe.
   STATUS: NOT YET RUN IN UNREAL (the engine is not installed on 2026-09-24). Names marked
   [verify] are resolved at run time by trying candidates and logging what was missing;
   job_00_vfx_probe.py records the real names.

Shared toolkit (<skills>/scenario-unreal-expert/scripts, written by the lead agent): ue_run.run_python
(modes commandlet, editor, latent) and ue_run.result for jobs, ue_review.screenshot /
wait_screenshot / set_camera / image_checks for captures, ue_stat.parse_jsonl / timer_totals /
trace_frames / budget_check for numbers, ue_audit for generic asset rules. This module does
not reimplement them: capture_ages() calls ue_review, niagara_trace_summary() reads
ue_stat.timer_totals output.

No em dashes in this file (project rule).
"""
from __future__ import annotations

import json
import math
import os
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24; includes the checks from the U7 blind grade, section 2b)

# =============================================================================================
# 1. OFFLINE LAYER: constants
# =============================================================================================

QUALITY_LEVELS = {0: "Low", 1: "Medium", 2: "High", 3: "Epic", 4: "Cinematic"}
# fx.Niagara.QualityLevel 0..4 follows sg.EffectsQuality by default (Kiraly 71c5yv-XeY8 [00:27:17]).

# The 17 modules a stateless (lightweight) emitter supports (UE 5.8 doc, Stateless Emitter Trade-offs).
STATELESS_MODULES = (
    "Acceleration Force", "Add Velocity", "Curl Noise", "Noise Vector Field", "Drag",
    "Gravity Force", "Initialize Particle", "Initial Mesh Orientation", "Rotate Around Point",
    "Scale Color", "Scale Mesh Size", "Scale Mesh Size By Speed", "Scale Sprite Size",
    "Scale Sprite Size By Speed", "Shape Location", "Solve Velocities And Forces",
    "Sprite Rotation Rate", "Sub UV Animation",
    # Kiraly's stateless footsteps stack also shows these spawn and render entries (frame 00:39:43):
    "Spawn Burst Instantaneous", "Sprite Renderer", "Solve Forces and Velocity",
)

# Effect Type presets. Numbers are Kiraly's (71c5yv-XeY8) unless the entry says [added].
EFFECT_TYPE_PRESETS: Dict[str, Dict[str, Any]] = {
    "NET_OneShot": {
        "source": "Kiraly 71c5yv-XeY8 [00:22:26]-[00:23:31], frame 00:23:00",
        "use_for": "fire-and-forget, NOT gameplay critical: footsteps, shell eject, impact puffs, "
                   "embers, wall dust (not muzzle flashes, not player-hit sparks)",
        "update_frequency": "SpawnOnly",
        "cull_reaction": "KillAndClear",
        "significance": "Distance",
        "max_system_instances": 15,
        "max_effect_type_instances": 30,          # "slightly more", he usually doubles it [00:22:58]
        "allow_pre_culling_by_view_frustum": True,
        "max_time_outside_view_frustum": 0.0,
        "max_time_without_render": 0.0,
        "budget_scaling": True,
        "budget_guard": "only with fx.Budget.AdjustedUsageDecayRate set and budget_oscillation clean on a "
                        "stress capture (Kiraly [00:36:50]-[00:37:21])",
        "per_quality_example": {                 # frame 00:27:15
            "High+": {"max_effect_type_instances": 30, "max_system_instances": 15},
            "Medium": {"max_distance": 5000.0, "max_effect_type_instances": 30, "max_system_instances": 15},
            "Low": {"max_distance": 2000.0, "max_effect_type_instances": 20, "max_system_instances": 8},
        },
    },
    "NET_OneShotCritical": {
        "source": "[added] derived from Kiraly: gameplay-critical one-shots are excluded from the "
                  "aggressive type (player-hit sparks, [00:22:58]); reference table row 1 [00:45:57]",
        "use_for": "projectile head, impact flash, damage ring: the player must see them",
        "update_frequency": "SpawnOnly",
        "cull_reaction": "KillAndClear",
        "significance": "Distance",
        "max_system_instances": None,            # from sight lines and max simultaneous casts
        "max_effect_type_instances": None,       # about 2x the system cap
        "allow_culling_for_local_players": False,
        "allow_pre_culling_by_view_frustum": True,
        "max_time_outside_view_frustum": 0.0,
        "max_time_without_render": 0.0,
        "budget_scaling": False,                 # FXB only if an acceptable MVP exists (table note)
    },
    "NET_PersistentCritical": {
        "source": "Kiraly NET_PickupPersistent 71c5yv-XeY8 [00:24:03]-[00:25:07], frame 00:23:57",
        "use_for": "looping gameplay-critical effects: pickups, status effects, AoE fire, smoke grenade",
        "update_frequency": "Continuous",
        "cull_reaction": "Asleep",
        "significance": "Distance",
        "max_system_instances": 5,               # "the map's sight lines never show more than five"
        "max_effect_type_instances": None,
        "allow_pre_culling_by_view_frustum": False,
        "max_time_outside_view_frustum": 1.0,    # delayed cull: no pop and restart of the wind-up
        "max_time_without_render": 1.0,
        "budget_scaling": False,
    },
    "NET_Ambient": {
        "source": "[added] from Kiraly's table row 'persistent, not gameplay critical' "
                  "(ET + FXB + SG + LE) [00:45:57] and his budget curves (frame 00:34:38)",
        "use_for": "hanging dust, falling leaves, bugs, rain, torches far from gameplay",
        "update_frequency": "Medium",            # [added] periodic, not every tick
        "cull_reaction": "Asleep",
        "significance": "Distance",
        "max_system_instances": None,
        "max_effect_type_instances": None,
        "allow_pre_culling_by_view_frustum": True,
        "max_time_outside_view_frustum": 1.0,
        "max_time_without_render": 1.0,
        "budget_scaling": True,
        "budget_curves": {                       # Start (usage, scale) to End (usage, scale), frame 00:34:38
            "max_distance_scale_by_global_budget_use": ((0.5, 1.0), (1.0, 0.0)),
            "max_instance_count_scale_by_global_budget_use": ((0.5, 1.0), (1.0, 0.5)),
            "max_system_instance_count_scale_by_global_budget_use": ((0.5, 1.0), (1.0, 0.0)),
        },
        "warning": "thousands of systems on one type spike the significance refresh (~30 ms, "
                   "Kiraly [00:19:44]): consolidate before relying on significance",
    },
}

# Display label to C++ / Python enum candidates [verify with job_00_vfx_probe.py].
CULL_REACTION_ENUM = {
    "Kill": ("DEACTIVATE",),
    "KillAndClear": ("DEACTIVATE_IMMEDIATE",),
    "Asleep": ("DEACTIVATE_RESUME",),
    "AsleepAndClear": ("DEACTIVATE_IMMEDIATE_RESUME",),
    "Pause": ("PAUSE_RESUME", "PAUSE"),
}
UPDATE_FREQUENCY_ENUM = {
    "SpawnOnly": ("SPAWN_ONLY",),
    "Low": ("LOW",),
    "Medium": ("MEDIUM",),
    "High": ("HIGH",),
    "Continuous": ("CONTINUOUS",),
}
POOL_METHOD_ENUM = {
    "NONE": ("NONE",),
    "AUTO_RELEASE": ("AUTO_RELEASE",),
    "MANUAL_RELEASE": ("MANUAL_RELEASE",),
    "MANUAL_RELEASE_ON_COMPLETE": ("MANUAL_RELEASE_ON_COMPLETE",),
}

# Niagara Data Channel Islands asset values Kiraly showed (frame 00:40:44).
NDC_ISLANDS_EXAMPLE = {
    "data_channel_type": "Niagara Data Channel Islands",
    "channel_variables": {"Location": "Vector", "Normal": "Vector"},
    "keep_previous_frame_data": True,
    "enforce_tick_group_read_write_order": False,
    "final_write_tick_group": "End Physics",
    "islands_mode": "Aligned Static",
    "initial_extents": 1000.0,
    "max_extents": 5000.0,
    "per_element_extents": 250.0,
    "island_pool_size": 4,
}

# Template User parameter contracts [added: a project convention the GUI builder binds once;
# names and types are what the agent verifies with get_all_user_parameters].
TEMPLATE_CONTRACTS: Dict[str, Dict[str, Tuple[str, str]]] = {
    "projectile": {
        "User.CoreColor": ("LinearColor", "near-white warm core, never pure white (rubric C3)"),
        "User.FringeColor": ("LinearColor", "most saturated colour lives in the fringe (C3)"),
        "User.CoreIntensity": ("float", "emissive multiplier; the blowout control (V2)"),
        "User.HeadSize": ("float", "cm; head diameter = 2 x gameplay collision radius (G1)"),
        "User.TrailLifetime": ("float", "s; trail dimmer and shorter than the head's read (V3, T3)"),
        "User.TrailSpawnPerUnit": ("float", "particles per cm of travel"),
        "User.EmberRate": ("float", "per s; the first thing scalability scales down"),
        "User.DarkWispAlpha": ("float", "dark wisps behind the head raise head contrast (Keyser #3)"),
        "User.FlipbookTexture": ("Texture", "8 x 8 grid, same grid for every swap"),
        "User.CoreMaterial": ("MaterialInterface", "Material Instance from scenario-unreal-materials"),
    },
    "impact": {
        "User.Radius": ("float", "cm; THE gameplay damage radius, same number as gameplay (G1)"),
        "User.FlashIntensity": ("float", "peak at the hit frame (T1)"),
        "User.BurstCount": ("int", "few big, more medium, many small (S2)"),
        "User.SmokeLifetime": ("float", "s; gone inside the gameplay window (T3)"),
        "User.SurfaceColor": ("LinearColor", "dust tinted by the surface or wall material"),
        "User.DebrisMesh": ("StaticMesh", "no collision, no shadow, no distance field on the mesh (doc)"),
        "User.ImpactNormal": ("Vector", "orients the burst and the scorch"),
    },
    "ndc_impact_listener": {
        # Payload lives in the Data Channel asset, not in User parameters (NDC doc).
        "NDC.Location": ("Vector", "payload"),
        "NDC.Normal": ("Vector", "payload"),
        "NDC.Radius": ("float", "payload; gameplay radius per hit"),
        "NDC.SurfaceType": ("enum", "physical surface, routes emitters (Xiao Yue destruction [00:10:30])"),
    },
}

# Starting budget targets for ALL Niagara in the busiest fight on the min-spec core count.
# [added] digest synthesis (notes/niagara/_digest_niagara_advanced_optimization_visual.md, U7 section):
# no source gives a per-effect ms budget; calibrate with scenario-unreal-performance.
DEFAULT_FX_BUDGET_MS = {"gt_plus_gtc": 2.0, "rt": 1.5}


# =============================================================================================
# 2. OFFLINE LAYER: planning and verdicts
# =============================================================================================

def _problem(level: str, code: str, msg: str, source: str = "") -> Dict[str, str]:
    return {"level": level, "code": code, "msg": msg, "source": source}


def classify_element(name: str, gameplay_critical: bool, persistent: bool,
                     spawns_per_second: float = 0.0, live_particles: int = 0,
                     modules: Sequence[str] = (), samples_mesh_or_skeleton: bool = False,
                     needs_events_collision_or_ribbon: bool = False,
                     ndc_rate_per_s: float = 5.0, gpu_min_particles: int = 1000) -> Dict[str, Any]:
    """Classify one effect element and pick Effect Type, spawn path, emitter kind and sim target.

    Follows Kiraly's reference table (71c5yv-XeY8 frame 00:45:57): classify by gameplay
    critical or not and one-shot or persistent first, then pick ET, Pool, LE, NDC, FXB, SG.
    Thresholds `ndc_rate_per_s` and `gpu_min_particles` are [added] starting points, to be
    validated with a measurement (procedure V10); the doc notes 1 GPU particle can cost as
    much as 64 and that CPU sims suit small counts; Kiraly's stateless footsteps removed all
    GPU and RT dispatch cost.
    """
    reasons: List[str] = []
    if persistent:
        et = "NET_PersistentCritical" if gameplay_critical else "NET_Ambient"
    else:
        et = "NET_OneShotCritical" if gameplay_critical else "NET_OneShot"
    reasons.append("classified %s, %s (Kiraly table [00:45:57])" % (
        "gameplay critical" if gameplay_critical else "not gameplay critical",
        "persistent" if persistent else "one-shot"))

    if persistent:
        spawn = "placed_or_attached (Manual Release pool if gameplay spawns it; Release to Pool, never Destroy)"
    elif spawns_per_second >= ndc_rate_per_s:
        spawn = "ndc_islands"
        reasons.append("%.1f spawns/s >= %.1f: high-volume, one Data Channel listener per island "
                       "(Kiraly [00:40:50]) [threshold added]" % (spawns_per_second, ndc_rate_per_s))
    else:
        spawn = "pool_auto_release"
        reasons.append("moderate rate: pooled, Auto Release at spawn (Kiraly [00:30:40])")

    unsupported = [m for m in modules if m not in STATELESS_MODULES]
    stateless_ok = (not unsupported and not samples_mesh_or_skeleton
                    and not needs_events_collision_or_ribbon and spawn != "ndc_islands")
    if stateless_ok:
        emitter = "stateless (system state off for the fast path)"
        reasons.append("all modules in the stateless list; turn off system state (Kiraly [00:38:20])")
    else:
        emitter = "stateful"
        why = []
        if unsupported:
            why.append("modules not stateless: %s" % ", ".join(unsupported))
        if samples_mesh_or_skeleton:
            why.append("samples a mesh, skeleton or socket")
        if needs_events_collision_or_ribbon:
            why.append("needs events, collision or ribbons [ribbon support in stateless: verify]")
        if spawn == "ndc_islands":
            why.append("NDC read and spawn need custom modules (NDC and LE exclusive, [00:45:57])")
        reasons.append("stateful because " + "; ".join(why))

    if emitter.startswith("stateless"):
        sim_target = "n/a (stateless: no GPU dispatch)"
    elif live_particles >= gpu_min_particles:
        sim_target = "GPU"
        reasons.append("%d live particles: GPU, but every GPU system pays an RT dispatch even "
                       "unseen (Kiraly [00:05:47]); GPU emitters need fixed bounds [verify]" % live_particles)
    else:
        sim_target = "CPU"
        reasons.append("%d live particles: CPU avoids the per-system RT dispatch (Kiraly [00:39:56]; "
                       "scalability doc GPU vs CPU)" % live_particles)

    if not gameplay_critical:
        reasons.append("FX budget allowed only with fx.Budget.AdjustedUsageDecayRate damping (Kiraly [00:36:50])")
    reasons.append("the Effect Type belongs to the SYSTEM: group elements with system_plan (Kiraly [00:20:16])")
    return {
        "name": name,
        "effect_type": et,
        "spawn": spawn,
        "emitter": emitter,
        "sim_target": sim_target,
        "fx_budget_scaling": (not gameplay_critical),
        "scalability": ("keep the read-critical parts at every quality level; scale only secondary "
                        "emitters" if gameplay_critical else
                        "spawn count scale 0.5 on Low, distance cull, drop at distance"),
        "reasons": reasons,
    }


def plan_table(elements: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """classify_element over a list of kwargs dicts; returns the rows for the plan."""
    return [classify_element(**e) for e in elements]


def caps_verdict(max_system_instances: Optional[int], max_effect_type_instances: Optional[int],
                 max_pool_size: Optional[int] = None, pool_prime_size: int = 0,
                 loaded_mid_play: bool = False) -> List[Dict[str, str]]:
    """Check that instance caps and pooling fit together (Kiraly [00:22:58], [00:33:22], [00:31:46])."""
    out: List[Dict[str, str]] = []
    src = "Kiraly 71c5yv-XeY8"
    if max_system_instances and max_effect_type_instances:
        if max_effect_type_instances < max_system_instances:
            out.append(_problem("error", "ET_CAP_BELOW_SYSTEM_CAP",
                                "Effect Type cap %d is below the per-system cap %d"
                                % (max_effect_type_instances, max_system_instances), src + " [00:22:58]"))
        elif max_effect_type_instances < 1.5 * max_system_instances:
            out.append(_problem("note", "ET_CAP_TIGHT",
                                "Effect Type cap is usually about 2x the per-system cap", src + " [00:22:58]"))
    if max_pool_size is not None and max_system_instances is not None and max_pool_size != max_system_instances:
        out.append(_problem("warn", "POOL_NE_CAP",
                            "pool size %d != system instance limit %d: overflow beyond the pool is not "
                            "pooled and goes to GC; set the limit to the pool size"
                            % (max_pool_size, max_system_instances), src + " [00:33:22]"))
    if pool_prime_size and loaded_mid_play:
        out.append(_problem("warn", "PRIME_HITCH",
                            "pool priming on an asset loaded during play hitches at load",
                            src + " [00:31:46]; NiagaraSystem.pool_prime_size doc"))
    return out


def flipbook_check(width: int, height: int, cols: int, rows: int,
                   sub_uv_end_frame: Optional[int] = None, baker_fps: Optional[float] = None,
                   authoring_fps: float = 30.0) -> Dict[str, Any]:
    """Flipbook tile math (Niagara Flipbook Baker doc: tiles are not rescaled; 8x8 on 1024 = 128 px)."""
    problems: List[Dict[str, str]] = []
    doc = "Flipbook Baker doc, Adjust the Texture Size / Timing"

    def pow2(v: int) -> bool:
        return v > 0 and (v & (v - 1)) == 0
    if not (pow2(width) and pow2(height)):
        problems.append(_problem("error", "NOT_POW2", "texture %dx%d is not power of two" % (width, height), doc))
    if width % cols or height % rows:
        problems.append(_problem("error", "GRID_NOT_DIVIDING",
                                 "grid %dx%d does not divide %dx%d: partial pixels, padding and jitter"
                                 % (cols, rows, width, height), doc))
    frames = cols * rows
    if sub_uv_end_frame is not None and sub_uv_end_frame != frames - 1:
        problems.append(_problem("error", "END_FRAME",
                                 "Sub UV end frame %d should be %d (frames start at 0)" % (sub_uv_end_frame, frames - 1),
                                 "Flipbook Baker doc, Use the Flipbook Texture"))
    if baker_fps is not None and baker_fps < authoring_fps:
        problems.append(_problem("warn", "BAKER_FPS",
                                 "baker %.0f fps below the %.0f fps authoring rate duplicates frames"
                                 % (baker_fps, authoring_fps), doc))
    return {"frames": frames, "tile_w": width / float(cols), "tile_h": height / float(rows),
            "problems": problems, "ok": not [p for p in problems if p["level"] == "error"]}


def texture_verdict(t: Dict[str, Any]) -> List[Dict[str, str]]:
    """Rules for one VFX texture. t keys: path, width, height, srgb, lod_group, compression,
    role ('mask', 'color', 'lut', 'flipbook', 'normal', 'erosion'), cols, rows (flipbooks)."""
    out: List[Dict[str, str]] = []
    role = t.get("role", "color")
    w, h = int(t.get("width", 0)), int(t.get("height", 0))
    if role in ("mask", "erosion") and t.get("srgb", False):
        out.append(_problem("error", "MASK_SRGB",
                            "mask with sRGB on: must be off when channels are used as masks",
                            "5.8 texture doc; Trumpler KaNDezgsg4M [00:37:12]"))
    lod = str(t.get("lod_group", ""))
    if lod and "EFFECTS" not in lod.upper():
        out.append(_problem("warn", "LOD_GROUP", "VFX texture outside TEXTUREGROUP_Effects (%s)" % lod,
                            "device profile doc example [added]"))
    if w and h and ((w & (w - 1)) or (h & (h - 1))):
        out.append(_problem("warn", "NOT_POW2", "%dx%d not power of two" % (w, h), "[added]"))
    if role == "flipbook" and t.get("cols") and t.get("rows"):
        out.extend(flipbook_check(w, h, int(t["cols"]), int(t["rows"]))["problems"])
    if role in ("color", "flipbook") and 0 < max(w, h) < 64:
        out.append(_problem("warn", "SMALL_SOURCE",
                            "source %dx%d: a small sprite becomes a blurry blob near camera; author big, "
                            "cap in engine with Maximum Texture Size" % (w, h),
                            "Trumpler KaNDezgsg4M [00:18:14]-[00:20:05] [64 px threshold added]"))
    need = t.get("needed_size")
    if need and max(w, h) > int(need) and not t.get("max_texture_size"):
        out.append(_problem("note", "NO_SIZE_CAP",
                            "source %dx%d, effect needs %d: keep the big source, cap in engine with Maximum Texture "
                            "Size" % (w, h, int(need)), "Trumpler KaNDezgsg4M [00:18:14]"))
    return out


def niagara_system_verdict(f: Dict[str, Any], element_class: Optional[str] = None) -> List[Dict[str, str]]:
    """Audit one NiagaraSystem's facts (from niagara_facts in the editor, or a JSON dump).

    Keys: path, effect_type, max_pool_size, pool_prime_size, warmup_time, fixed_tick_delta,
    require_current_frame_data, fixed_bounds_enabled, gpu_emitters, emitters, moves (bool),
    loaded_mid_play (bool), spawned_frequently (bool)."""
    out: List[Dict[str, str]] = []
    if not f.get("effect_type"):
        out.append(_problem("error", "NO_EFFECT_TYPE",
                            "no Effect Type: the first fix for existing content (227 to 103 active systems, "
                            "RT 5.07 to 1.51 ms in Kiraly's Lyra test)", "Kiraly 71c5yv-XeY8 [00:20:48]"))
    if (f.get("warmup_time") or 0) > 0:
        out.append(_problem("warn", "WARMUP", "warmup evaluates frames sequentially and hitches",
                            "scalability doc, Warmup"))
    if f.get("fixed_tick_delta"):
        out.append(_problem("warn", "FIXED_TICK", "fixed tick delta forces game-thread ticking; review use only",
                            "NiagaraSystem.fixed_tick_delta_time doc"))
    if f.get("require_current_frame_data") and not f.get("moves", True):
        out.append(_problem("note", "CURRENT_FRAME_DATA",
                            "static effect: turn off Require Current Frame Data to start its tick early",
                            "scalability doc, Current Frame Data"))
    if (f.get("gpu_emitters") or 0) > 0 and not f.get("fixed_bounds_enabled"):
        out.append(_problem("warn", "GPU_NO_FIXED_BOUNDS",
                            "GPU emitters without fixed bounds [added, verify]; size them to the trail length",
                            "scalability doc, Fixed vs Dynamic Bounds"))
    if f.get("spawned_frequently") and not f.get("max_pool_size"):
        out.append(_problem("warn", "NO_POOL", "frequently spawned system without a pool",
                            "Kiraly [00:32:18]"))
    if (f.get("pool_prime_size") or 0) > 0 and f.get("loaded_mid_play"):
        out.append(_problem("warn", "PRIME_HITCH", "pool priming on an asset loaded mid-play hitches",
                            "NiagaraSystem.pool_prime_size doc"))
    if element_class and f.get("effect_type") and element_class not in str(f.get("effect_type")):
        out.append(_problem("note", "ET_CLASS_MISMATCH",
                            "Effect Type %s does not match planned class %s" % (f.get("effect_type"), element_class),
                            "Kiraly table [00:45:57]"))
    return out


def contract_verdict(contract: Dict[str, Tuple[str, str]], user_params: Iterable[Any]) -> Dict[str, Any]:
    """Check a duplicated template exposes the User parameters of its contract.

    user_params: iterable of names, (name, type) tuples or dicts with 'name' and 'type'.
    Names match with or without the 'User.' prefix; types match loosely (substring)."""
    have: Dict[str, str] = {}
    for p in user_params:
        if isinstance(p, dict):
            n, t = str(p.get("name", "")), str(p.get("type", ""))
        elif isinstance(p, (tuple, list)):
            n, t = str(p[0]), (str(p[1]) if len(p) > 1 else "")
        else:
            n, t = str(p), ""
        have[n.replace("User.", "").lower()] = t.lower()
    missing, wrong_type = [], []
    for name, (typ, _why) in contract.items():
        key = name.split(".", 1)[-1].lower()
        if name.startswith("NDC."):
            continue  # payload is in the Data Channel asset
        if key not in have:
            missing.append(name)
        elif have[key] and typ.lower() not in have[key] and not (typ == "float" and "float" in have[key]):
            wrong_type.append((name, typ, have[key]))
    return {"ok": not missing and not wrong_type, "missing": missing, "wrong_type": wrong_type,
            "action": ("" if not missing else
                       "escalate ONE GUI build: bind these module inputs to User parameters in the "
                       "template (Niagara Editor, User Parameters panel), then re-run the check")}


def physmat_check(density_g_cm3: Optional[float], friction: Optional[float] = None,
                  restitution: Optional[float] = None, friction_combine: Optional[str] = None,
                  heavy: bool = True) -> List[Dict[str, str]]:
    """Physical material sanity for destructibles (Van Allen wPgd1J1Tf70 [00:26:11]-[00:27:27])."""
    out: List[Dict[str, str]] = []
    src = "Van Allen wPgd1J1Tf70"
    if density_g_cm3 is not None:
        if density_g_cm3 > 25.0:
            out.append(_problem("error", "DENSITY_UNITS",
                                "density %.0f looks like kg/m3; UE physical material density is g/cm3 "
                                "(stone 2, not 2000); the sim 'goes crazy'" % density_g_cm3, src + " [00:26:11]"))
        elif density_g_cm3 < 0.05:
            out.append(_problem("warn", "DENSITY_LOW", "density %.3f g/cm3 is implausibly low [added range]"
                                % density_g_cm3, "[added]"))
    if heavy:
        if restitution is not None and restitution > 0.2:
            out.append(_problem("warn", "BOUNCY", "restitution %.2f: heavy materials want very low "
                                "restitution [0.2 threshold added]" % restitution, src + " [00:26:55]"))
        if friction is not None and friction < 0.8:
            out.append(_problem("note", "LOW_FRICTION", "friction %.2f: heft comes from friction up to 1 "
                                "[0.8 threshold added]" % friction, src + " [00:26:55]"))
        if friction_combine is not None and "MAX" not in str(friction_combine).upper():
            out.append(_problem("note", "COMBINE", "friction combine %s: Van Allen uses Max" % friction_combine,
                                src + " [00:26:55]"))
    return out


def gc_verdict(f: Dict[str, Any], placements: int = 1, concave_or_modular: bool = True,
               uses_shock_propagation: bool = False, ships_non_nanite_platform: bool = False,
               root_proxy_placement_threshold: int = 3) -> List[Dict[str, str]]:
    """Audit one GeometryCollection's facts (gc_facts in the editor).

    Keys: path, enable_nanite, enable_nanite_fallback, strip_on_cook, root_proxy_count,
    custom_renderer_type, remove_on_max_sleep, damage_threshold (list), levels (int),
    use_size_specific_damage_threshold, damage_model, cluster_connection_type,
    physics_material, density_g_cm3, dataflow_asset, size_specific_count."""
    out: List[Dict[str, str]] = []
    gdc = "Caillaud/Van Allen wPgd1J1Tf70"
    xiao = "Xiao Yue zFiHDRREv7E"
    if not f.get("enable_nanite"):
        out.append(_problem("warn", "NO_NANITE", "Nanite off: GC rendering has no LOD without it; flip the flag, "
                            "no refracture needed", gdc + " [00:04:21]"))
    if ships_non_nanite_platform and not f.get("enable_nanite_fallback"):
        out.append(_problem("warn", "NO_FALLBACK", "non-Nanite platform shipped without Nanite fallback",
                            "GeometryCollection.enable_nanite_fallback doc"))
    if not f.get("strip_on_cook"):
        out.append(_problem("note", "NO_STRIP", "strip_on_cook off; stripping non-Nanite geometry cut ~95% size",
                            gdc + " [00:05:28]"))
    if placements >= root_proxy_placement_threshold and not f.get("root_proxy_count"):
        out.append(_problem("warn", "NO_ROOT_PROXY",
                            "placed %d times without a root proxy (+ root proxy ISM renderer) "
                            "[threshold %d added]" % (placements, root_proxy_placement_threshold), gdc + " [00:05:58]"))
    if f.get("root_proxy_count") and "RootProxy" not in str(f.get("custom_renderer_type", "")):
        out.append(_problem("note", "RENDERER", "root proxy set but custom renderer is not the root proxy "
                            "renderer (GeometryCollectionRootProxyRenderer, 5.5 notes) [verify]", gdc + " [00:07:05]"))
    if not f.get("remove_on_max_sleep"):
        out.append(_problem("note", "REMOVAL", "no asset-level Remove on Sleep; confirm per-bone Remove on Break "
                            "exists (Fracture Mode or Dataflow; not readable from the Python class)",
                            gdc + " [00:08:39]-[00:10:43]"))
    if f.get("remove_on_max_sleep") and f.get("automatic_crumble_partial_clusters") is False:
        out.append(_problem("note", "CRUMBLE", "Remove on Sleep without automatic_crumble_partial_clusters: a partial "
                            "cluster shrinks as one chunk (per-bone Remove on Break has Cluster Crumbling)",
                            gdc + " [00:10:17]; GeometryCollection doc"))
    thr = list(f.get("damage_threshold") or [])
    levels = f.get("levels")
    model = str(f.get("damage_model", "")).upper()
    msc = "STRENGTH" in model or "CONNECTIVITY" in model          # enum member names [verify]
    if msc:
        if f.get("tensile_strength") in (None, 0, 0.0):
            out.append(_problem("warn", "MSC_TENSILE", "Material Strength and Connectivity: thresholds are contact area "
                                "x the physical material's tensile strength; set it there (the per-level array is not "
                                "the knob) [property name verify]", xiao + " [00:20:27]"))
    elif f.get("use_size_specific_damage_threshold"):
        pass
    elif thr:
        if levels and len(thr) < int(levels):
            out.append(_problem("warn", "THRESHOLD_LEVELS", "%d damage thresholds for %s cluster levels"
                                % (len(thr), levels), "Chaos docs, Damage Threshold per level"))
        if any(b > a for a, b in zip(thr, thr[1:])):
            out.append(_problem("warn", "THRESHOLD_ORDER", "thresholds should decrease with depth: %s" % thr,
                                "Chaos docs (quickstart 5000, 500, 50)"))
    if uses_shock_propagation and not f.get("use_size_specific_damage_threshold"):
        out.append(_problem("error", "SHOCK_NEEDS_SIZE_SPECIFIC",
                            "shock propagation does nothing with level-based thresholds", gdc + " [00:19:37]"))
    conn = str(f.get("cluster_connection_type", ""))
    if concave_or_modular and conn and ("PROXIMITY" not in conn.upper() and "OVERLAP" not in conn.upper()):
        out.append(_problem("warn", "CONNECTION_GRAPH",
                            "connection type %s on a concave or modular asset: floating chunks and corner hinges; "
                            "use Bounds Overlap Filtered or Proximity with an area threshold [enum names verify]"
                            % conn, xiao + " [00:17:14]-[00:18:56]"))
    if not f.get("physics_material"):
        out.append(_problem("warn", "NO_PHYSMAT", "no physics material: heft and damage multipliers come from it",
                            gdc + " [00:27:58]"))
    if f.get("density_g_cm3") is not None:
        out.extend(physmat_check(f.get("density_g_cm3"), heavy=False))
    if not f.get("size_specific_count"):
        out.append(_problem("note", "SIZE_SPECIFIC", "no size-specific collision data: small pieces keep convex; "
                            "boxes below 0.3 relative size cut dips", xiao + " [00:25:51]"))
    if not f.get("dataflow_asset"):
        out.append(_problem("note", "NO_DATAFLOW", "no Dataflow asset: the setup is not regenerable from a recipe",
                            "Caillaud t_jyTILDYo8 [00:02:46]"))
    return out


def strain_plan(damage_thresholds: Sequence[float], projectile_speed: float, reference_speed: float,
                base_velocity: float = 500.0, margin: float = 1.25, must_break: bool = False,
                radius: float = 100.0) -> Dict[str, Any]:
    """Strain and breaking velocity for a gameplay hit (Van Allen [00:29:29]-[00:32:35]; Chaos quickstart
    Radius 100, Strain 50000 against 5000/500/50, velocity 500). Strain and velocity scale with
    projectile speed so slow hits bounce and fast ones shatter; must_break guarantees level 0.
    `margin` is [added]."""
    if not damage_thresholds:
        raise ValueError("need the per-level damage thresholds")
    t0 = float(damage_thresholds[0])
    ratio = max(0.0, projectile_speed / float(reference_speed)) if reference_speed else 1.0
    strain = t0 * margin * ratio
    if must_break:
        strain = max(strain, t0 * margin)
    levels_broken = sum(1 for t in damage_thresholds if strain >= t)
    return {"strain": strain, "radius": radius, "breaking_linear_velocity": base_velocity * ratio,
            "speed_ratio": ratio, "breaks_level0": strain >= t0, "levels_reached": levels_broken,
            "calls": ["Apply External Strain (item index or location, radius, propagation depth 1, strain)",
                      "Apply Breaking Linear Velocity (along -hit normal or projectile direction)"],
            "note": "fields only for hero moments: 'heavy and slow' (Van Allen [00:29:29])"}


def niagara_overview_verdict(rows: Dict[str, Dict[str, float]], budget: Optional[Dict[str, float]] = None,
                             measured_cores: Optional[int] = None, target_cores: Optional[int] = None,
                             frame_ms: float = 16.67) -> Dict[str, Any]:
    """Judge `stat NiagaraOverview` rows {'GT Concurrent Total': {'avg','max'}, 'GT Total', 'RT Total'}.

    Kiraly: read per thread, against the target core count, spikes as much as averages
    ([00:04:41]-[00:05:15], [00:21:54])."""
    b = dict(DEFAULT_FX_BUDGET_MS)
    if budget:
        b.update(budget)
    get = lambda k, s: float((rows.get(k) or {}).get(s, 0.0))  # noqa: E731
    gtc_avg, gt_avg, rt_avg = get("GT Concurrent Total", "avg"), get("GT Total", "avg"), get("RT Total", "avg")
    gtc_max, gt_max, rt_max = get("GT Concurrent Total", "max"), get("GT Total", "max"), get("RT Total", "max")
    problems: List[Dict[str, str]] = []
    if measured_cores and target_cores and measured_cores > target_cores:
        problems.append(_problem("error", "CORES",
                                 "measured on %d cores, target has %d: GT Concurrent is hidden worker time; "
                                 "re-measure with the core count limited" % (measured_cores, target_cores),
                                 "Kiraly 71c5yv-XeY8 [00:05:15], slide 00:01:26"))
    if gt_avg + gtc_avg > b["gt_plus_gtc"]:
        problems.append(_problem("warn", "GT_BUDGET", "GT + GT concurrent avg %.2f ms > %.2f ms"
                                 % (gt_avg + gtc_avg, b["gt_plus_gtc"]), "[added budget] calibrate"))
    if rt_avg > b["rt"]:
        problems.append(_problem("warn", "RT_BUDGET", "RT avg %.2f ms > %.2f ms (GPU sims pay RT dispatch)"
                                 % (rt_avg, b["rt"]), "[added budget]; Kiraly [00:05:47]"))
    for label, mx in (("GT Concurrent", gtc_max), ("GT", gt_max), ("RT", rt_max)):
        if mx > 0.5 * frame_ms:
            problems.append(_problem("warn", "SPIKE_" + label.replace(" ", "_").upper(),
                                     "%s max %.2f ms is over half the frame" % (label, mx), "Kiraly [00:21:54]"))
    return {"gt_plus_gtc_avg": gt_avg + gtc_avg, "rt_avg": rt_avg,
            "max": {"gtc": gtc_max, "gt": gt_max, "rt": rt_max}, "budget": b,
            "problems": problems, "ok": not [p for p in problems if p["level"] in ("error", "warn")]}


def before_after(before: Dict[str, Dict[str, float]], after: Dict[str, Dict[str, float]]) -> List[Dict[str, Any]]:
    """Kiraly-style before/after table (frame 00:20:58): per row avg and max, delta and percent."""
    out = []
    for k in sorted(set(before) | set(after)):
        b, a = before.get(k, {}), after.get(k, {})
        row = {"row": k}
        for s in ("avg", "max"):
            bv, av = b.get(s), a.get(s)
            row[s + "_before"], row[s + "_after"] = bv, av
            if bv is not None and av is not None:
                row[s + "_delta"] = av - bv
                row[s + "_pct"] = (100.0 * (av - bv) / bv) if bv else None
        out.append(row)
    return out


def _is_niagara_timer(name: str) -> bool:
    return name.startswith("NS_") or "niagara" in name.lower()


def niagara_trace_summary(rows: Any, top: int = 15) -> List[Dict[str, Any]]:
    """Summarise Niagara timers (Kiraly: search NS_ timers; Niagara only appears with
    statnamedevents, [00:10:52], [00:12:30]).

    rows: either the dict returned by ue_stat.timer_totals(records) (keys total_ms, count,
    per_frame, frames), which gives per-frame worst values, or raw records with a name key
    ('name', 'timer', 'event') and 'duration_ms', 'ms' or 'duration_s'."""
    if isinstance(rows, dict) and "total_ms" in rows:
        frames = max(1, int(rows.get("frames") or 0))
        out = []
        for name, total in rows["total_ms"].items():
            if not _is_niagara_timer(name):
                continue
            per = [f.get(name, 0.0) for f in rows.get("per_frame", [])]
            out.append({"name": name, "count": int(rows.get("count", {}).get(name, 0)), "total_ms": float(total),
                        "avg_ms_per_frame": float(total) / frames, "max_ms_per_frame": max(per) if per else None})
        out.sort(key=lambda d: d["total_ms"], reverse=True)
        return out[:top]
    agg: Dict[str, Dict[str, float]] = {}
    for r in rows:
        name = str(r.get("name") or r.get("timer") or r.get("event") or "")
        if not _is_niagara_timer(name):
            continue
        if "duration_ms" in r:
            ms = float(r["duration_ms"])
        elif "ms" in r:
            ms = float(r["ms"])
        elif "duration_s" in r:
            ms = 1000.0 * float(r["duration_s"])
        else:
            continue
        a = agg.setdefault(name, {"count": 0.0, "total_ms": 0.0, "max_ms": 0.0})
        a["count"] += 1
        a["total_ms"] += ms
        a["max_ms"] = max(a["max_ms"], ms)
    res = [{"name": n, "count": int(v["count"]), "total_ms": v["total_ms"],
            "avg_ms": v["total_ms"] / v["count"], "max_ms": v["max_ms"]} for n, v in agg.items()]
    res.sort(key=lambda d: d["total_ms"], reverse=True)
    return res[:top]


def destruction_run_verdict(frame_ms: Sequence[float], break_index: int, budget_ms: float = 16.67,
                            baseline_frames: int = 30, recover_tolerance: float = 1.10) -> Dict[str, Any]:
    """Break-frame spike and recovery time from a frame-time series (Xiao Yue's recovery criterion,
    zFiHDRREv7E [00:27:36]; Caillaud's frame rate with many instances [00:02:56]).
    recover_tolerance is [added]."""
    if not frame_ms or break_index >= len(frame_ms):
        raise ValueError("frame series too short")
    pre = list(frame_ms[max(0, break_index - baseline_frames):break_index]) or [frame_ms[0]]
    base = sorted(pre)[len(pre) // 2]
    post = list(frame_ms[break_index:])
    spike = max(post)
    recover = None
    for i, v in enumerate(post):
        if all(x <= base * recover_tolerance for x in post[i:i + 10]):
            recover = i
            break
    over = sum(1 for v in post if v > budget_ms)
    return {"baseline_ms": base, "break_spike_ms": spike, "frames_over_budget": over,
            "recovery_frames": recover, "recovered": recover is not None,
            "ok": spike <= budget_ms and recover is not None}


def stress_grid(n: int, spacing: float = 300.0, origin: Tuple[float, float, float] = (0.0, 0.0, 100.0)) -> List[Tuple[float, float, float]]:
    """n x n positions for the doc's 20 x 20 stress test (lightweight emitters quick start)."""
    ox, oy, oz = origin
    half = (n - 1) * spacing / 2.0
    return [(ox - half + i * spacing, oy - half + j * spacing, oz) for i in range(n) for j in range(n)]


# =============================================================================================
# 2b. OFFLINE LAYER: checks added by the v0.2 refactor (2026-09-24), from the U7 blind grade
#     (tests/grading/U7_grade.md: expert points the notes contain that v0.1 failed to teach).
# =============================================================================================

_ET_RANK = {"NET_OneShot": 0, "NET_Ambient": 0, "NET_OneShotCritical": 2, "NET_PersistentCritical": 2}


def system_plan(rows: Sequence[Dict[str, Any]], membership: Dict[str, str]) -> Dict[str, Dict[str, Any]]:
    """Group classified elements (classify_element rows) into Niagara systems.

    An Effect Type is a property of the SYSTEM, assigned in System Properties (Kiraly 71c5yv-XeY8
    [00:20:16]); one system cannot carry two. The system takes the Effect Type of its most critical
    element; every less critical emitter in it gets per-emitter Scalability Mode Self (distance cull
    with Sleep and Let Particles Finish, spawn count scale) instead (Kiraly [00:26:03]-[00:27:08]).
    A non-critical element that is spammy (NDC) or GPU-simulated is better split into its own system
    so the aggressive type, caps and budget can act on it [split rule added]. An NDC listener is its
    own looping system (Infinite loop plus Complete if Unused, NDC doc).

    membership: {element name: system name}. Returns {system: {effect_type, elements,
    scalability_self, split_candidates, problems}}."""
    byname = {r["name"]: r for r in rows}
    groups: Dict[str, List[Dict[str, Any]]] = {}
    for el, sysname in membership.items():
        if el not in byname:
            raise KeyError("element %r is not in the classified rows" % el)
        groups.setdefault(sysname, []).append(byname[el])
    unassigned = [n for n in byname if n not in membership]
    out: Dict[str, Dict[str, Any]] = {}
    for sysname, els in groups.items():
        top = max(els, key=lambda r: _ET_RANK.get(r["effect_type"], 0))
        et = top["effect_type"]
        problems: List[Dict[str, str]] = []
        lifecycles = {("Persistent" in r["effect_type"] or "Ambient" in r["effect_type"]) for r in els}
        if len(lifecycles) > 1:
            problems.append(_problem("warn", "MIXED_LIFECYCLE",
                                     "one-shot and persistent elements in one system: one Effect Type cannot be "
                                     "both Spawn Only / Kill and Clear and Continuous / Asleep; split the system",
                                     "Kiraly [00:23:31], [00:24:35] [split rule added]"))
        ndc = [r["name"] for r in els if r["spawn"] == "ndc_islands"]
        if ndc and len(ndc) != len(els):
            problems.append(_problem("error", "NDC_LISTENER_SEPARATE",
                                     "%s read a Data Channel: the listener is its own looping system "
                                     "(Infinite loop + Complete if Unused); move the other elements out" % ", ".join(ndc),
                                     "NDC doc, Niagara System; Kiraly [00:43:03]"))
        secondary = [r for r in els if r["effect_type"] != et]
        self_rows = [r["name"] for r in secondary]
        split = [r["name"] for r in secondary
                 if _ET_RANK.get(et, 0) > _ET_RANK.get(r["effect_type"], 0)
                 and (r["spawn"] == "ndc_islands" or r["sim_target"] == "GPU")]
        if self_rows:
            problems.append(_problem("note", "SCALABILITY_SELF",
                                     "%s run under %s (the system's type): give them Emitter State > Scalability "
                                     "Mode Self, distance cull with Sleep and Let Particles Finish, spawn scale on Low"
                                     % (", ".join(self_rows), et), "Kiraly [00:26:03]-[00:27:08]"))
        if split:
            problems.append(_problem("warn", "SPLIT_CANDIDATE",
                                     "%s are not critical but spammy or GPU: split them into their own system "
                                     "so the aggressive type and caps can cull them" % ", ".join(split),
                                     "[added] from Kiraly's table [00:45:57] and [00:05:47]"))
        out[sysname] = {"effect_type": et, "elements": [r["name"] for r in els],
                        "scalability_self": self_rows, "split_candidates": split, "problems": problems}
    if unassigned:
        out["_unassigned"] = {"effect_type": None, "elements": unassigned, "scalability_self": [],
                              "split_candidates": [],
                              "problems": [_problem("error", "UNASSIGNED", "elements without a system: %s"
                                                    % ", ".join(unassigned))]}
    return out


# Which thread a Niagara lever actually saves. Pick the lever for the measured bottleneck.
LEVER_SAVES: Dict[str, Tuple[Tuple[str, ...], str]] = {
    "effect_type_first_pass": (("GT", "GTC", "RT"), "Kiraly [00:20:48]: active systems 227 to 103; RT 5.07 to "
                               "1.51, GT Concurrent 4.23 to 2.08, GT 2.12 to 1.41 ms, same look"),
    "instance_caps": (("GT", "GTC", "RT"), "Kiraly [00:17:29]-[00:18:02]: hard caps remove instances; "
                      "significance picks the survivors"),
    "max_distance_cull": (("GT", "GTC"), "Kiraly [00:16:57]: stops the system TICKING, nothing to do with GPU "
                          "culling; the scalability manager tick pays for the check"),
    "cull_proxy": (("GT", "GTC"), "Kiraly [00:18:02]: renders copies of a simulated instance; saves the tick, "
                   "still costs the RT ('nothing is ever perfectly free')"),
    "stateless_emitters": (("GT", "GTC", "RT", "GPU", "MEMORY"), "Kiraly frame 00:39:43: footsteps GT 1,387 to 271 us, "
                           "RT 301 to 215 us, GPU 46 to 0 us, memory 2.72 to 0.28 MB (editor numbers)"),
    "ndc_listener": (("GT",), "Kiraly [00:45:15]-[00:45:46]: per-impact about 487 us GT vs one listener about "
                     "146 us; RT unchanged because the particles still render"),
    "cpu_instead_of_gpu": (("RT", "GPU"), "Kiraly [00:05:47], [00:39:56]: every GPU system pays an RT dispatch, "
                           "visible or not"),
    "per_emitter_scalability": (("GT", "GTC", "RT", "GPU"), "Kiraly [00:26:03]-[00:27:08]: secondary emitters "
                                "sleep or spawn less by distance and quality"),
    "fx_budget": (("GT", "GTC", "RT"), "Kiraly [00:34:39]-[00:37:21]: scales NON-critical types under load; "
                  "oscillates without fx.Budget.AdjustedUsageDecayRate"),
    "pooling": (("GT",), "Kiraly [00:30:40]-[00:33:53]: moderate recurrence, no respawn churn; prime 0 for "
                "mid-play loads [thread mapping added]"),
}

_THREAD_ALIASES = {"GTCONCURRENT": "GTC", "GAMETHREADCONCURRENT": "GTC", "GAMETHREAD": "GT", "RENDERTHREAD": "RT",
                   "RENDER": "RT", "GPUTIME": "GPU"}


def lever_check(bottleneck: str, lever: str) -> Dict[str, Any]:
    """Does this optimisation lever reduce the thread that is over budget? (Kiraly reads GT, GT
    Concurrent and RT separately [00:04:41]-[00:05:15]; distance culling and cull proxies do not
    touch the RT [00:16:57], [00:18:02].) bottleneck: GT, GTC ('GT Concurrent'), RT, GPU, MEMORY."""
    if lever not in LEVER_SAVES:
        raise KeyError("unknown lever %r; known: %s" % (lever, ", ".join(sorted(LEVER_SAVES))))
    b = bottleneck.upper().replace(" ", "").replace("_", "")
    b = _THREAD_ALIASES.get(b, b)
    saves, why = LEVER_SAVES[lever]
    ok = b in saves
    better = sorted(k for k, (s, _w) in LEVER_SAVES.items() if b in s and k != lever)
    return {"lever": lever, "bottleneck": b, "saves": list(saves), "ok": ok, "why": why,
            "alternatives": [] if ok else better,
            "msg": "" if ok else "%s does not reduce %s; try %s" % (lever, b, ", ".join(better) or "a profile first")}


def budget_verdict(effect_type: Dict[str, Any], gameplay_critical: bool,
                   cvars: Optional[Dict[str, Any]] = None) -> List[Dict[str, str]]:
    """FX budget sanity for one Effect Type (preset dict or facts with budget_scaling,
    max_global_budget_usage). cvars: the project's fx.Budget.* INI values.
    Kiraly: budgets only for non-critical effects in high-intensity moments [00:34:39]; they must go
    in INI files [00:35:12]; too tight a budget oscillates, damped by fx.Budget.AdjustedUsageDecayRate
    [00:36:50]-[00:37:21]; Max Global Budget Usage is the nuclear option [00:36:18]."""
    cv = {str(k).lower(): v for k, v in (cvars or {}).items()}
    out: List[Dict[str, str]] = []
    src = "Kiraly 71c5yv-XeY8"
    uses = bool(effect_type.get("budget_scaling")) or effect_type.get("max_global_budget_usage") is not None
    if not uses:
        return out
    if gameplay_critical:
        out.append(_problem("error", "BUDGET_ON_CRITICAL",
                            "budget scaling on a gameplay-critical type: under load the player loses the read",
                            src + " [00:34:39]; table [00:45:57]"))
    enabled = str(cv.get("fx.budget.enabled", "0")).strip() not in ("0", "", "false", "False")
    if not enabled:
        out.append(_problem("note", "BUDGET_NOT_ENABLED",
                            "budget scaling does nothing until fx.Budget.Enabled 1 (INI; fx.Budget.EnabledInEditor "
                            "to test in editor)", src + " [00:35:12]"))
    elif "fx.budget.adjustedusagedecayrate" not in cv:
        out.append(_problem("warn", "NO_DECAY_DAMPING",
                            "budget enabled without fx.Budget.AdjustedUsageDecayRate: cull, free budget, respawn, "
                            "repeat; set the decay and run budget_oscillation on a stress capture",
                            src + " [00:36:50]-[00:37:21]"))
    if effect_type.get("max_global_budget_usage") is not None and gameplay_critical:
        out.append(_problem("error", "NUCLEAR_ON_CRITICAL", "Max Global Budget Usage culls the whole type: "
                            "only for things like footsteps in heavy combat", src + " [00:36:18]"))
    return out


def budget_oscillation(active_counts: Sequence[float], rel_amplitude: float = 0.15,
                       max_reversals: int = 3) -> Dict[str, Any]:
    """Detect the budget oscillation trap on a TotalActive (or culled count) time series from the
    Debug HUD or a trace: up, down, up, down (Kiraly [00:36:50]). A reversal counts when the value
    moves back by more than rel_amplitude x mean from its last extreme. Thresholds [added]."""
    xs = [float(v) for v in active_counts]
    if len(xs) < 3:
        return {"reversals": 0, "oscillating": False, "amplitude": 0.0}
    mean = sum(xs) / len(xs)
    amp = max(1.0, rel_amplitude * abs(mean))
    direction, ext, rev = 0, xs[0], 0
    for v in xs[1:]:
        if direction == 0:
            if v - ext >= amp:
                direction, ext = 1, v
            elif ext - v >= amp:
                direction, ext = -1, v
        elif direction == 1:
            if v > ext:
                ext = v
            elif ext - v >= amp:
                direction, ext, rev = -1, v, rev + 1
        else:
            if v < ext:
                ext = v
            elif v - ext >= amp:
                direction, ext, rev = 1, v, rev + 1
    osc = rev > max_reversals
    return {"reversals": rev, "oscillating": osc, "amplitude": amp,
            "fix": ("raise the budget or increase fx.Budget.AdjustedUsageDecayRate (Kiraly [00:37:21])"
                    if osc else "")}


def strobe_risk(speed_cm_s: float, head_length_cm: float, fps: float = 60.0,
                stretch: float = 1.0) -> Dict[str, Any]:
    """Will a fast head strobe at game frame rate? A round head that moves more than its own length
    between two frames does not blend frame to frame (Keyser #5 WLMVpcK0WvA [00:07:40]-[00:08:47]).
    Along the travel axis two footprints of length L offset by step s overlap with 1D IoU
    (L - s) / (L + s) [derivation added]; the rubric's T4 pass is IoU >= 0.2, which needs L >= 1.5 s.
    Works for any projectile, tracer or swipe moving roughly across the view."""
    if fps <= 0 or head_length_cm <= 0:
        raise ValueError("fps and head length must be positive")
    step = abs(speed_cm_s) / fps
    length = head_length_cm * max(stretch, 1e-6)
    iou = (length - step) / (length + step) if length + step > 0 else 0.0
    return {"step_cm_per_frame": step, "head_length_cm": length, "iou_1d": max(0.0, iou),
            "strobes": iou <= 0.0, "passes_t4": iou >= 0.2,
            "stretch_for_overlap": step / head_length_cm, "stretch_for_t4": 1.5 * step / head_length_cm,
            "fix": ("" if iou >= 0.2 else
                    "velocity-aligned sprite stretched with speed (Scale Sprite Size By Speed is one of the 17 "
                    "stateless modules) and motion blur baked into the head texture so a paused frame reads "
                    "direction (Keyser #2 Wb7r6_L9Fyk [00:03:31]-[00:04:04]); alignment option name [verify]")}


def fixed_bounds_check(speed_cm_s: float, max_lifetime_s: float, effect_radius_cm: float,
                       box_half_extent_cm: Optional[float] = None, local_space: bool = False,
                       prefer_dynamic_above_cm: float = 5000.0) -> Dict[str, Any]:
    """Fixed bounds for a moving system. World-space particles left behind by an emitter moving at
    speed trail up to speed x lifetime behind it, so fixed bounds must reach that far or the trail is
    culled while still on screen [derived]. Fixed bounds are cheaper except for a small effect that
    travels a large distance, which is the doc's exception (scalability doc, Fixed vs Dynamic
    Bounds). The 5000 cm switch point is [added]. Debug: System Show Bounds in the Niagara debugger."""
    need = effect_radius_cm if local_space else abs(speed_cm_s) * max_lifetime_s + effect_radius_cm
    problems: List[Dict[str, str]] = []
    if box_half_extent_cm is not None and box_half_extent_cm < need:
        problems.append(_problem("error", "BOUNDS_TOO_SMALL",
                                 "fixed half extent %.0f cm < %.0f cm of trail: particles culled while visible"
                                 % (box_half_extent_cm, need), "scalability doc, Fixed vs Dynamic Bounds [derived]"))
    if need > prefer_dynamic_above_cm:
        problems.append(_problem("note", "PREFER_DYNAMIC",
                                 "a %.0f cm box for a small travelling effect: the doc's exception, keep dynamic "
                                 "bounds or shorten world-space lifetimes" % need, "scalability doc [threshold added]"))
    return {"needed_half_extent_cm": need, "problems": problems,
            "ok": not [p for p in problems if p["level"] == "error"]}


_BEAT_RANK = {"flash": 0, "debris": 1, "sparks": 1, "smoke": 2, "aftermath": 2}


def spawn_schedule_verdict(schedule: Sequence[Dict[str, Any]], hit_time: float, window_end: float,
                           windup: Optional[Tuple[float, float]] = None, fps: float = 60.0) -> Dict[str, Any]:
    """Judge an ability's spawn schedule before building it and after capturing it.

    schedule: [{name, role, start, end}] with seconds on one clock (cast input = 0) and roles
    'windup' (anticipation on the caster, ends at release), 'buildup' (charge or gathering toward
    the hit itself, ends AT the hit), 'travel', 'flash', 'debris', 'sparks', 'smoke', 'aftermath',
    'persistent'. windup: (start, release) of the character's cast animation window.
    Rules: build-up stops spawning exactly at the hit (Shishido W8A7KgGQjrg [00:30:00]); the flash
    peaks on the hit frame (Keyser #5 [00:14:34]); consequences follow causes, flash then debris and
    sparks then smoke (Shishido [00:31:20], [00:37:02]); nothing but persistent elements spawns after
    the gameplay window (Keyser #1 [00:15:21]); anticipation uses the window between input and firing
    and rides the character's wind-up (Keyser #5 [00:08:47]-[00:09:54]; Firsova [00:06:45]); with no
    window, move the interest into the falloff (Keyser #5 [00:09:20], [00:18:07]). Tolerances [added]."""
    tol = 1.0 / fps + 1e-6
    probs: List[Dict[str, str]] = []
    by_role: Dict[str, List[Dict[str, Any]]] = {}
    for s in schedule:
        by_role.setdefault(str(s.get("role", "")).lower(), []).append(s)
    for s in by_role.get("buildup", []):
        end = float(s.get("end", s.get("start", 0.0)))
        if end > hit_time + tol:
            probs.append(_problem("error", "BUILDUP_AFTER_HIT", "%s keeps spawning %.2f s after the hit"
                                  % (s["name"], end - hit_time), "Shishido [00:30:00]"))
        elif end < hit_time - 0.1:
            probs.append(_problem("note", "BUILDUP_GAP", "%s stops %.2f s before the hit: a dead beat before "
                                  "the payoff [0.1 s added]" % (s["name"], hit_time - end), "[added]"))
    flashes = by_role.get("flash", [])
    if not flashes:
        probs.append(_problem("warn", "NO_HIT_BEAT", "no flash or hit beat: nothing marks the gameplay moment",
                              "Keyser #5 [00:00:57]-[00:02:06]"))
    for s in flashes:
        if abs(float(s.get("start", 0.0)) - hit_time) > tol:
            probs.append(_problem("error", "FLASH_NOT_ON_HIT", "%s starts %.3f s off the hit frame"
                                  % (s["name"], float(s.get("start", 0.0)) - hit_time), "Keyser #5 [00:14:34]"))
    starts = {r: min(float(s.get("start", 0.0)) for s in lst) for r, lst in by_role.items() if r in _BEAT_RANK}
    for r, t in starts.items():
        for r2, t2 in starts.items():
            if _BEAT_RANK[r] < _BEAT_RANK[r2] and t2 + tol < t:
                probs.append(_problem("warn", "CAUSE_ORDER", "%s (%.2f s) starts before its cause %s (%.2f s)"
                                      % (r2, t2, r, t), "Shishido [00:37:02]"))
    for s in schedule:
        role = str(s.get("role", "")).lower()
        if role != "persistent" and float(s.get("end", s.get("start", 0.0))) > window_end + tol:
            probs.append(_problem("warn", "SPAWNS_AFTER_WINDOW", "%s spawns until %.2f s, window ends %.2f s: "
                                  "reads as still dangerous" % (s["name"], float(s["end"]), window_end),
                                  "Keyser #1 [00:15:21]"))
    anticip = by_role.get("windup", []) or by_role.get("buildup", [])   # what must ride the cast animation
    if windup is not None:
        w0, w1 = float(windup[0]), float(windup[1])
        if w1 - w0 > tol and not anticip:
            probs.append(_problem("note", "NO_ANTICIPATION", "a %.2f s wind-up window with no wind-up element"
                                  % (w1 - w0), "Keyser #5 [00:08:47]-[00:09:54]"))
        for s in anticip:
            if abs(float(s.get("start", 0.0)) - w0) > max(0.1, 0.25 * (w1 - w0)):
                probs.append(_problem("warn", "WINDUP_NOT_SYNCED", "%s starts at %.2f s, the cast animation's "
                                      "wind-up at %.2f s: spawn it from the animation (notify) [tolerance added]"
                                      % (s["name"], float(s.get("start", 0.0)), w0), "Keyser #5 [00:09:20]; Firsova [00:06:45]"))
    elif not anticip:
        probs.append(_problem("note", "NO_WINDOW", "no anticipation: if the design forbids a wind-up, put the "
                              "interest in the falloff", "Keyser #5 [00:09:20], [00:18:07]"))
    return {"problems": probs, "ok": not [p for p in probs if p["level"] == "error"]}


def duplicate_spawn_check(expected: Dict[str, float], observed: Dict[str, float],
                          factor: float = 2.0) -> List[Dict[str, str]]:
    """Blowout diagnosis before touching colour: stacked additive duplicates. Shishido's white-out
    came from six glow dots spawning instead of one (W8A7KgGQjrg [00:17:42]); counts come from the
    Niagara Debugger or FX Outliner. Keys: emitter names, plus 'systems_per_event' (1 expected; 2
    means the event spawned the system twice, e.g. gameplay and an animation notify [added])."""
    out: List[Dict[str, str]] = []
    for name, exp in expected.items():
        got = observed.get(name)
        if got is None or not exp:
            continue
        if got >= factor * exp:
            out.append(_problem("error", "DUPLICATE_SPAWN",
                                "%s: %.0f live vs %.0f intended: stacked additive copies blow out to white; fix the "
                                "count first, then back the additive core with an alpha-blended saturated layer"
                                % (name, got, exp), "Shishido [00:17:42]-[00:18:14]"))
    return out


def _interp(curve: Sequence[Tuple[float, float]], t: float) -> float:
    pts = sorted((float(a), float(b)) for a, b in curve)
    if not pts:
        raise ValueError("empty curve")
    if t <= pts[0][0]:
        return pts[0][1]
    for (a0, b0), (a1, b1) in zip(pts, pts[1:]):
        if a0 <= t <= a1:
            return b0 if a1 == a0 else b0 + (b1 - b0) * (t - a0) / (a1 - a0)
    return pts[-1][1]


def fade_curve_verdict(alpha: Sequence[Tuple[float, float]],
                       size: Optional[Sequence[Tuple[float, float]]] = None,
                       fade_start_max: float = 0.7) -> Dict[str, Any]:
    """Popcorning guard for smoke, clouds and debris cards: fade by opacity from about mid-life, not
    by shrinking only (Shishido W8A7KgGQjrg [00:11:24], [00:39:23]-[00:40:00]: opacity 1 to 0 from
    about halfway). Curves are (normalised age 0..1, value) as written in the Scale Color / Scale
    Sprite Size spec handed to the template builder. fade_start_max 0.7 is [added]."""
    probs: List[Dict[str, str]] = []
    a_max = max(v for _t, v in alpha) or 1.0
    start = next((t / 100.0 for t in range(0, 101) if _interp(alpha, t / 100.0) < 0.9 * a_max), 1.0)
    if _interp(alpha, 1.0) > 0.1 * a_max:
        probs.append(_problem("error", "NO_OPACITY_FADE", "alpha still %.2f at end of life: cards pop out"
                              % _interp(alpha, 1.0), "Shishido [00:39:23]"))
    elif start > fade_start_max:
        probs.append(_problem("warn", "LATE_FADE", "opacity fade starts at %.0f %% of life; Shishido starts about "
                              "halfway" % (100 * start), "Shishido [00:40:00]"))
    if size is not None and _interp(size, 1.0) < 0.3 * max(v for _t, v in size) and start > fade_start_max:
        probs.append(_problem("warn", "SHRINK_ONLY_FADE", "cards shrink away while opaque: popcorning",
                              "Shishido [00:39:23]-[00:40:00]"))
    return {"fade_start": start, "problems": probs, "ok": not [p for p in probs if p["level"] == "error"]}


def flipbook_playback_verdict(frame_curve: Sequence[Tuple[float, float]], frames: int,
                              min_ratio: float = 1.2) -> Dict[str, Any]:
    """Flipbook timing: fast at the start, slow at the end, like smoke slowed by air (Trumpler
    KaNDezgsg4M [00:13:08]). frame_curve: (normalised age, frame index). min_ratio [added]."""
    first = _interp(frame_curve, 0.5) - _interp(frame_curve, 0.0)
    second = _interp(frame_curve, 1.0) - _interp(frame_curve, 0.5)
    probs: List[Dict[str, str]] = []
    pts = sorted(frame_curve)
    if any(b1 < b0 for (_a0, b0), (_a1, b1) in zip(pts, pts[1:])):
        probs.append(_problem("error", "NOT_MONOTONIC", "frame index goes backwards", "[added]"))
    if abs(_interp(frame_curve, 1.0) - (frames - 1)) > 0.5:
        probs.append(_problem("warn", "END_FRAME", "playback ends at frame %.0f, not %d"
                              % (_interp(frame_curve, 1.0), frames - 1), "Flipbook Baker doc (frames start at 0)"))
    if second > 0 and first < min_ratio * second:
        probs.append(_problem("warn", "LINEAR_PLAYBACK", "first half plays %.1f frames, second half %.1f: "
                              "linear or slow-fast timing looks stuttery" % (first, second), "Trumpler [00:13:08]"))
    return {"first_half_frames": first, "second_half_frames": second, "problems": probs,
            "ok": not [p for p in probs if p["level"] == "error"]}


def texture_role_from_name(name: str) -> str:
    """Guess a VFX texture's role from its name for texture_verdict [convention added]."""
    n = name.lower()
    if "lut" in n or "gradient" in n or "ramp" in n:
        return "lut"
    if "erosion" in n or "noise" in n:
        return "erosion"
    if "flipbook" in n or "subuv" in n or "_fb" in n:
        return "flipbook"
    if "mask" in n or n.endswith("_m") or "glow" in n or "dot" in n:
        return "mask"
    if "normal" in n or n.endswith("_n"):
        return "normal"
    return "color"


def mesh_watertight_check(faces: Sequence[Sequence[int]]) -> Dict[str, Any]:
    """Source mesh audit before building a Geometry Collection: watertight (every edge shared by
    exactly two faces) and no non-manifold edges. Open faces simulate worse and unpredictably;
    intersecting parts are pushed apart at simulation start, so every separate shell must be checked
    for overlaps in the DCC (Chaos docs, Geometry Collections: Best practices). faces: vertex index
    polygons (0- or 1-based). Intersection itself is not computed here [added: shell count only]."""
    edges: Dict[Tuple[int, int], int] = {}
    parent: Dict[int, int] = {}

    def find(x: int) -> int:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for f in faces:
        idx = [int(i) for i in f]
        for a, b in zip(idx, idx[1:] + idx[:1]):
            key = (a, b) if a < b else (b, a)
            edges[key] = edges.get(key, 0) + 1
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb
    boundary = sum(1 for c in edges.values() if c == 1)
    nonmanifold = sum(1 for c in edges.values() if c > 2)
    shells = len({find(v) for v in list(parent)})
    ok = boundary == 0 and nonmanifold == 0 and bool(faces)
    return {"faces": len(faces), "edges": len(edges), "boundary_edges": boundary, "nonmanifold_edges": nonmanifold,
            "shells": shells, "watertight": ok,
            "action": ("" if ok else "fix open or non-manifold edges in the DCC before the GC (Chaos docs, Best practices)")
            + ("" if shells <= 1 else "; %d shells: check them for intersections" % shells)}


def read_obj_faces(path: str) -> List[List[int]]:
    """Face index lists from an OBJ file (v, v/vt, v/vt/vn, negative indices), for mesh_watertight_check."""
    faces: List[List[int]] = []
    nverts = 0
    with open(path) as fh:
        for line in fh:
            if line.startswith("v "):
                nverts += 1
            elif line.startswith("f "):
                idx = []
                for tok in line.split()[1:]:
                    i = int(tok.split("/")[0])
                    idx.append(i if i > 0 else nverts + 1 + i)
                faces.append(idx)
    return faces


def gc_recipe_verdict(r: Dict[str, Any]) -> Dict[str, Any]:
    """Judge a destructible's recipe (a Dataflow template's variables or a Fracture Mode plan) before
    and after building, for any material: wall, pillar, crate, bridge, glass. Keys (all optional; a
    missing key is reported as 'unknown' where it matters):
      source_watertight, source_intersecting, random_seed, material, fracture, levels,
      hold ('anchor' | 'kinematic' | 'sleep'), connection ('proximity' | 'bounds_overlap_filtered' | other),
      contact_area_threshold, damage_model ('msc' | 'user_thresholds' | 'size_specific'),
      thresholds (list), thresholds_tuned (bool), tensile_strength, size_specific (bool),
      shock_propagation (bool), one_convex_per_cluster, leaf_box_below, debris_one_way,
      remove_on_break, break_delay (min, max), removal_duration (min, max), cluster_crumbling,
      platform_removal_multiplier ({profile: multiplier}), ships_low_end, tiny_geo,
      interior_material, interior_distance_bake, settle ('disable' | 'sleep' | 'none'), debris_needs_wake,
      vfx_reads_breaks, chaos_data_generation, notify_breaks, debris_profile ('broken_bones' | 'whole_gc'),
      strain_falloff (bool)."""
    P: List[Dict[str, str]] = []
    gdc, xiao, ndw, doc = ("Caillaud/Van Allen wPgd1J1Tf70", "Xiao Yue zFiHDRREv7E", "Caillaud t_jyTILDYo8",
                           "Chaos docs")

    def add(level, code, msg, src):
        P.append(_problem(level, code, msg, src))
    if r.get("source_watertight") is False or r.get("source_intersecting"):
        add("error", "SOURCE_MESH", "source mesh open or self-intersecting: fix it in the DCC before the GC",
            doc + ", Geometry Collections: Best practices")
    elif "source_watertight" not in r:
        add("note", "SOURCE_UNKNOWN", "run mesh_watertight_check on the source before fracturing", doc + ", Best practices")
    if r.get("random_seed", -1) in (-1, None):
        add("note", "SEED", "fixed Random Seed (not -1) so the pattern regenerates identically", doc + ", Fracturing: common options")
    mat = str(r.get("material", "")).lower()
    frac = str(r.get("fracture", "")).lower()
    pattern = {"concrete": ("noise", "grout"), "stone": ("noise",), "brick": ("brick", "noise"),
               "wood": ("shrink", "stretch", "splinter"), "glass": ("radial", "slice", "crack")}
    if mat in pattern and frac and not any(k in frac for k in pattern[mat]):
        add("warn", "MATERIAL_PATTERN", "%s fractured as %r: concrete noise plus grout, wood shrink-fracture-stretch, "
            "glass radial or slices (or a material crack with a hit mask)" % (mat, frac), xiao + " [00:05:36]-[00:07:15], [00:13:19]")
    lv = r.get("levels")
    if lv is not None and int(lv) < 2:
        add("warn", "LEVELS", "one level: clusters are what keep the sim stable and the frame rate acceptable",
            xiao + " [00:21:55]-[00:23:07]")
    if str(r.get("hold", "")).lower() == "sleep":
        add("error", "HOLD_BY_SLEEP", "sleep holds nothing: it pays cost and wakes on a bump; anchor or kinematic bones",
            gdc + " [00:23:40]-[00:24:35]")
    conn = str(r.get("connection", "")).lower()
    if conn and "proximity" not in conn and "overlap" not in conn:
        add("warn", "CONNECTION_GRAPH", "default pivot-based graph on concave pieces: floating chunks and corner "
            "hinges; Proximity with contact area threshold, or Bounds Overlap Filtered", xiao + " [00:17:14]-[00:18:56]")
    elif "proximity" in conn and not r.get("contact_area_threshold"):
        add("note", "CONTACT_THRESHOLD", "Proximity without a contact area threshold keeps corner contacts", xiao + " [00:18:56]")
    model = str(r.get("damage_model", "")).lower()
    if model in ("size_specific", "size-specific"):
        add("error", "SIZE_SPECIFIC_IS_A_FLAG", "size-specific is a threshold option "
            "(use_size_specific_damage_threshold), not a damage model: pick MSC or user thresholds",
            "Python API GeometryCollection; " + xiao + " [00:19:54]-[00:20:27]")
    if model == "msc":
        if not r.get("tensile_strength"):
            add("error", "MSC_NEEDS_TENSILE", "Material Strength and Connectivity: threshold = contact area x the "
                "physical material's tensile strength; set tensile strength there", xiao + " [00:20:27]")
        if r.get("thresholds_tuned"):
            add("warn", "MSC_ARRAY_TUNED", "the per-level threshold array is not the knob under MSC: tune tensile "
                "strength (and strain) instead, or switch to user thresholds", xiao + " [00:20:27]")
    elif model == "user_thresholds":
        thr = [float(x) for x in (r.get("thresholds") or [])]
        if lv is not None and thr and len(thr) < int(lv):
            add("warn", "THRESHOLD_LEVELS", "%d thresholds for %s levels" % (len(thr), lv), doc)
        if any(b > a for a, b in zip(thr, thr[1:])):
            add("warn", "THRESHOLD_ORDER", "thresholds should fall with depth", doc + " (quickstart 5000, 500, 50)")
    if r.get("shock_propagation") and not r.get("size_specific"):
        add("error", "SHOCK_NEEDS_SIZE_SPECIFIC", "shock propagation does nothing with level-based thresholds",
            gdc + " [00:19:37]-[00:20:11]")
    if r.get("one_convex_per_cluster") is False:
        add("warn", "CONVEX", "leaf-convex fallback: generate one convex per cluster", xiao + " [00:24:07]")
    if r.get("leaf_box_below") is None:
        add("note", "LEAF_PROXY", "size-specific proxies: boxes below 0.3 relative size", xiao + " [00:25:15]-[00:25:51]")
    if r.get("debris_one_way") is False:
        add("warn", "ONE_WAY", "debris levels two-way: convex piles; set one-way (spheres between one-way bodies, "
            "no damage cascades)", gdc + " [00:12:59]-[00:14:37]")
    if not r.get("remove_on_break"):
        add("warn", "REMOVE_ON_BREAK", "no Remove on Break: per-piece random delay and duration ranges give control "
            "Remove on Sleep lacks", gdc + " [00:08:39]-[00:11:15]")
    else:
        for key in ("break_delay", "removal_duration"):
            rng = r.get(key)
            if rng is not None and float(rng[0]) >= float(rng[1]):
                add("note", "RANGE_" + key.upper(), "%s %s is not a range: pieces vanish in sync" % (key, rng),
                    gdc + " [00:09:12]")
        if not r.get("cluster_crumbling"):
            add("warn", "CLUSTER_CRUMBLING", "Cluster Crumbling off: a cluster that lands unbroken shrinks as one "
                "big chunk instead of crumbling into its pieces", gdc + " [00:10:17]")
    if r.get("ships_low_end") and not r.get("platform_removal_multiplier"):
        add("warn", "PLATFORM_MULTIPLIER", "one asset for every platform: put the removal timer multiplier cvar in the "
            "low-end device profile [cvar name verify]", gdc + " [00:11:24]-[00:11:56]")
    if not r.get("tiny_geo"):
        add("note", "TINY_GEO", "Tiny Geo: merge slivers, or 0/0 removal replaced by a Niagara burst",
            gdc + " [00:20:47]-[00:21:52]")
    if not r.get("interior_material") or not r.get("interior_distance_bake"):
        add("warn", "INTERIOR", "interior faces need their material, UVs and a distance-to-surface bake so breaks "
            "read as thick material, not a painted shell", ndw + " [00:29:14]-[00:34:05]; " + xiao + " [00:07:15]")
    settle = str(r.get("settle", "")).lower()
    if settle == "sleep" and r.get("debris_needs_wake") is False:
        add("warn", "DISABLE_NOT_SLEEP", "settled debris that never wakes: disable it, it performs better than sleep",
            xiao + " [00:28:45]; " + doc + ", Sleep and Disable")
    elif settle in ("", "none"):
        add("note", "SETTLE", "no settle policy: sleep or disable field just above the ground", xiao + " [00:27:36]")
    if r.get("vfx_reads_breaks"):
        if not r.get("chaos_data_generation") or not r.get("notify_breaks"):
            add("error", "EVENTS_OFF", "Niagara reads breaks only with Chaos data generation on in Project Settings "
                "AND break notification on the GC component", xiao + " [00:08:42]")
    if str(r.get("debris_profile", "")).lower() == "whole_gc":
        add("warn", "DEBRIS_PROFILE_WHOLE_GC", "a debris profile on the whole GC lets the player walk through the "
            "intact wall; switch only broken bones from the break event", xiao + " [00:09:50]-[00:10:24]")
    if r.get("strain_falloff"):
        add("warn", "STRAIN_FALLOFF", "falloff with external strain costs performance; the doc says avoid it",
            doc + ", Master Field: Strain Falloff")
    return {"problems": P, "ok": not [p for p in P if p["level"] == "error"]}


# =============================================================================================
# 3. OFFLINE LAYER: image metrics for the VFX critique (numpy, Pillow)
# =============================================================================================

def _np():
    try:
        import numpy as np  # type: ignore
        return np
    except ImportError as exc:  # pragma: no cover
        raise ImportError("ue_vfx image metrics need numpy (system python3; not UE's embedded Python)") from exc


def load_image(src: Any):
    """Path (PNG, JPG, EXR if Pillow reads it) or array -> float32 HxWx3 in 0..1 (display encoded)."""
    np = _np()
    if isinstance(src, str):
        from PIL import Image  # type: ignore
        im = Image.open(src).convert("RGB")
        a = np.asarray(im, dtype=np.float32) / 255.0
    else:
        a = np.asarray(src, dtype=np.float32)
        if a.max() > 1.5:
            a = a / 255.0
    if a.ndim == 2:
        a = np.stack([a, a, a], axis=-1)
    return a[..., :3]


def srgb_to_linear(a):
    np = _np()
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def luminance(img):
    """Relative luminance Y from display-encoded RGB (Rec. 709 weights on linear values).
    Accurate grayscale, as Keyser warns against naive conversions (3DaBs-7oFhM [00:13:32])."""
    lin = srgb_to_linear(img)
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]


def lstar(img):
    """CIE L* (0..100) from display-encoded RGB."""
    np = _np()
    y = luminance(img)
    e = 216.0 / 24389.0
    k = 24389.0 / 27.0
    f = np.where(y > e, np.cbrt(y), (k * y + 16.0) / 116.0)
    return 116.0 * f - 16.0


def rgb_to_hsv(img):
    np = _np()
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    mx = np.max(img, axis=-1)
    mn = np.min(img, axis=-1)
    d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-8), 0.0)
    h = np.zeros_like(mx)
    nz = d > 1e-8
    rc = np.where(nz, (mx - r) / np.maximum(d, 1e-8), 0)
    gc = np.where(nz, (mx - g) / np.maximum(d, 1e-8), 0)
    bc = np.where(nz, (mx - b) / np.maximum(d, 1e-8), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2.0 + rc - bc, 4.0 + gc - rc))
    h = np.where(nz, (h / 6.0) % 1.0, 0.0)
    return np.stack([h, s, mx], axis=-1)


def _box_mean(a, r: int):
    np = _np()
    if r <= 0:
        return a.astype(np.float64)
    p = np.pad(a.astype(np.float64), r, mode="edge")
    c = np.cumsum(np.cumsum(p, axis=0), axis=1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s / float(k * k)


def blur(a, r: int = 4, passes: int = 3):
    """Box blur repeated (about Gaussian): the 'squint' (Firsova zPl0oVanDV0 [00:14:05])."""
    out = a
    for _ in range(passes):
        out = _box_mean(out, r)
    return out


def local_contrast(L, r: int = 4):
    """Local standard deviation of L in a (2r+1)^2 window."""
    np = _np()
    m = _box_mean(L, r)
    m2 = _box_mean(L * L, r)
    return np.sqrt(np.maximum(m2 - m * m, 0.0))


def effect_mask(with_fx, without_fx, threshold: float = 0.02):
    """Pixels the effect changed: capture the same frame with and without the Niagara component
    (Keyser-derived check [added]); threshold on max channel difference (0..1)."""
    np = _np()
    a, b = load_image(with_fx), load_image(without_fx)
    return np.max(np.abs(a - b), axis=-1) > threshold


def value_bands(img, mask=None) -> Dict[str, float]:
    """L* percentiles plus the share of effect pixels above 97 and below 3 (no 0 % or 100 %,
    Keyser 3DaBs-7oFhM slide 00:02:19; thresholds added)."""
    np = _np()
    L = lstar(load_image(img))
    v = L[mask] if mask is not None else L.ravel()
    if v.size == 0:
        return {"n": 0}
    p = np.percentile(v, [1, 5, 50, 95, 99])
    return {"n": int(v.size), "p1": float(p[0]), "p5": float(p[1]), "p50": float(p[2]), "p95": float(p[3]),
            "p99": float(p[4]), "range_5_95": float(p[3] - p[1]),
            "share_above_97": float(np.mean(v > 97.0)), "share_below_3": float(np.mean(v < 3.0))}


def blowout_share(img, mask=None, l_threshold: float = 97.0) -> float:
    """Share of (effect) pixels near white in the tone-mapped capture (Shishido W8A7KgGQjrg [00:17:12])."""
    np = _np()
    L = lstar(load_image(img))
    v = L[mask] if mask is not None else L.ravel()
    return float(np.mean(v > l_threshold)) if v.size else 0.0


def saturation_stats(img, mask=None) -> Dict[str, float]:
    """Share of fully blown colour (S and V above 0.95; Keyser #4 [00:06:29], thresholds added)."""
    np = _np()
    hsv = rgb_to_hsv(load_image(img))
    s, v = hsv[..., 1], hsv[..., 2]
    if mask is not None:
        s, v = s[mask], v[mask]
    if s.size == 0:
        return {"n": 0}
    return {"n": int(s.size), "mean_s": float(np.mean(s)),
            "share_full_blown": float(np.mean((s > 0.95) & (v > 0.95)))}


def radial_profile(img, center_xy: Tuple[float, float], max_radius: float, rings: int = 8, mask=None) -> List[Dict[str, float]]:
    """Mean L* and saturation per ring from a centre (projectile head or impact point)."""
    np = _np()
    a = load_image(img)
    L = lstar(a)
    S = rgb_to_hsv(a)[..., 1]
    h, w = L.shape
    yy, xx = np.mgrid[0:h, 0:w]
    rr = np.hypot(xx - center_xy[0], yy - center_xy[1])
    out = []
    for i in range(rings):
        r0, r1 = max_radius * i / rings, max_radius * (i + 1) / rings
        sel = (rr >= r0) & (rr < r1)
        if mask is not None:
            sel &= mask
        if not sel.any():
            out.append({"r0": r0, "r1": r1, "L": float("nan"), "S": float("nan"), "n": 0})
            continue
        out.append({"r0": r0, "r1": r1, "L": float(L[sel].mean()), "S": float(S[sel].mean()), "n": int(sel.sum())})
    return out


def core_fringe_verdict(profile: List[Dict[str, float]]) -> Dict[str, Any]:
    """Near-white core, saturation higher in the fringe than the core, value falling outward
    (Keyser #4 [00:12:46]-[00:14:27], [00:19:55])."""
    rings = [p for p in profile if p.get("n")]
    if len(rings) < 3:
        return {"ok": False, "reason": "too few rings with pixels"}
    core, fringe = rings[0], max(rings[1:], key=lambda p: p["S"])
    ok_s = fringe["S"] > core["S"]
    ok_l = core["L"] >= max(p["L"] for p in rings) - 1e-6
    ok_white = core["L"] < 99.0
    return {"ok": ok_s and ok_l and ok_white, "core_L": core["L"], "core_S": core["S"],
            "fringe_S": fringe["S"], "saturation_rises_outward": ok_s, "core_brightest": ok_l,
            "core_not_pure_white": ok_white}


def focal_point(img, mask=None, blur_radius: int = 6) -> Tuple[float, float]:
    """(x, y) of maximum local contrast on the blurred grayscale (Firsova [00:12:25], [00:14:05])."""
    np = _np()
    L = blur(lstar(load_image(img)), r=max(1, blur_radius // 2), passes=2)
    C = local_contrast(L, r=blur_radius)
    if mask is not None:
        C = np.where(mask, C, 0.0)
    y, x = np.unravel_index(int(np.argmax(C)), C.shape)
    return float(x), float(y)


def focal_error(img, intended_xy: Tuple[float, float], mask=None) -> float:
    """Distance from the contrast focal point to the intended point (world_to_screen of the head
    or impact), as a fraction of the image diagonal."""
    _np()
    a = load_image(img)
    fx, fy = focal_point(a, mask)
    h, w = a.shape[:2]
    return float(math.hypot(fx - intended_xy[0], fy - intended_xy[1]) / math.hypot(w, h))


def axis_contrast_profile(img, head_xy: Tuple[float, float], tail_xy: Tuple[float, float],
                          samples: int = 10, radius: int = 6) -> Dict[str, Any]:
    """Local contrast sampled from the projectile head to the tail. Highest at the head, lower on
    the trail (Keyser #3 [00:08:13], [00:11:27])."""
    np = _np()
    L = lstar(load_image(img))
    C = local_contrast(L, r=radius)
    h, w = L.shape
    vals = []
    for i in range(samples):
        t = i / float(max(1, samples - 1))
        x = int(round(head_xy[0] + t * (tail_xy[0] - head_xy[0])))
        y = int(round(head_xy[1] + t * (tail_xy[1] - head_xy[1])))
        x0, x1 = max(0, x - radius), min(w, x + radius + 1)
        y0, y1 = max(0, y - radius), min(h, y + radius + 1)
        vals.append(float(C[y0:y1, x0:x1].mean()) if x1 > x0 and y1 > y0 else 0.0)
    third = max(1, samples // 3)
    head_mean, tail_mean = float(np.mean(vals[:third])), float(np.mean(vals[-third:]))
    return {"profile": vals, "argmax_index": int(np.argmax(vals)), "head_mean": head_mean,
            "tail_mean": tail_mean, "ok": int(np.argmax(vals)) < third and head_mean > tail_mean}


def _downsample_mask(mask, max_side: int = 256):
    _np()
    h, w = mask.shape
    f = max(1, int(math.ceil(max(h, w) / float(max_side))))
    if f == 1:
        return mask.copy(), 1
    H, W = h // f, w // f
    m = mask[:H * f, :W * f].reshape(H, f, W, f).any(axis=(1, 3))
    return m, f


def components(mask, max_side: int = 256, min_area_px: int = 1) -> List[int]:
    """Connected component areas (4-connectivity) in original-pixel units, largest first.
    Numpy plus a Python flood fill on a downsampled mask (no scipy on this Mac)."""
    np = _np()
    m, f = _downsample_mask(np.asarray(mask, dtype=bool), max_side)
    H, W = m.shape
    seen = np.zeros_like(m, dtype=bool)
    areas: List[int] = []
    for y0 in range(H):
        row = m[y0]
        for x0 in range(W):
            if not row[x0] or seen[y0, x0]:
                continue
            stack = [(y0, x0)]
            seen[y0, x0] = True
            n = 0
            while stack:
                y, x = stack.pop()
                n += 1
                for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        stack.append((yy, xx))
            area = n * f * f
            if area >= min_area_px:
                areas.append(area)
    areas.sort(reverse=True)
    return areas


def size_classes(mask, big_frac: float = 0.25, small_frac: float = 0.05) -> Dict[str, Any]:
    """Few big, more medium, many small (Firsova [00:04:31]). Classes relative to the largest
    component; fractions are [added]."""
    areas = components(mask)
    if len(areas) < 3:
        return {"big": len(areas), "medium": 0, "small": 0, "count": len(areas), "ok": None,
                "note": "fewer than 3 shapes: not applicable to this frame (use a debris or spark frame)"}
    top = float(areas[0])
    big = sum(1 for a in areas if a >= big_frac * top)
    small = sum(1 for a in areas if a < small_frac * top)
    medium = len(areas) - big - small
    return {"big": big, "medium": medium, "small": small, "count": len(areas),
            "ok": big <= medium <= small and small > big}


def hotspot_count(img, percentile: float = 99.5, min_area_px: int = 16) -> int:
    """Competing high-contrast hotspots on the whole screen (Keyser #3 [00:01:06]: one clear
    hotspot per moment; more than one or two competing peaks means the tier is too high)."""
    np = _np()
    L = blur(lstar(load_image(img)), r=2, passes=2)
    C = local_contrast(L, r=4)
    thr = np.percentile(C, percentile)
    return len(components(C >= thr, min_area_px=min_area_px))


def footprint_vs_radius(img, mask, center_xy: Tuple[float, float], radius_px: float,
                        rings: int = 32) -> Dict[str, Any]:
    """Compare the effect's visible extent with the projected gameplay radius (Keyser #1 [00:09:11]-
    [00:11:55]: visible area = collision area). Edge = outermost ring still at least half covered
    by the effect mask; rim_contrast = L* drop across that edge (the bold primary shape belongs
    there, not only at the core). Tolerances [added]."""
    np = _np()
    a = load_image(img)
    L = lstar(a)
    m = np.asarray(mask, dtype=bool)
    h, w = L.shape
    yy, xx = np.mgrid[0:h, 0:w]
    rr = np.hypot(xx - center_xy[0], yy - center_xy[1])
    rmax = 1.6 * radius_px
    edges = np.linspace(0.0, rmax, rings + 1)
    cover, means = [], []
    for i in range(rings):
        sel = (rr >= edges[i]) & (rr < edges[i + 1])
        cover.append(float(m[sel].mean()) if sel.any() else 0.0)
        means.append(float(L[sel].mean()) if sel.any() else 0.0)
    k = max([i for i, c in enumerate(cover) if c >= 0.5] or [0])
    edge_r = float(edges[k + 1])
    rim = means[k] - means[min(k + 1, rings - 1)] if k + 1 < rings else 0.0
    outside = float(np.mean(rr[m] > 1.1 * radius_px)) if m.any() else 0.0
    ratio = edge_r / radius_px if radius_px else float("nan")
    return {"edge_radius_px": edge_r, "radius_px": radius_px, "edge_ratio": ratio,
            "rim_contrast_Lstar": rim, "share_outside_1_1r": outside,
            "ok": 0.9 <= ratio <= 1.1 and outside <= 0.05}


def elongation(mask, velocity_xy: Optional[Tuple[float, float]] = None) -> Dict[str, Any]:
    """Paused-frame direction read (Keyser #2 [00:03:31]-[00:04:04]): second moments of the head
    mask; elongation ratio and alignment with screen velocity. Thresholds [added]."""
    np = _np()
    ys, xs = np.nonzero(np.asarray(mask, dtype=bool))
    if xs.size < 5:
        return {"ok": False, "reason": "mask too small"}
    x, y = xs - xs.mean(), ys - ys.mean()
    cov = np.array([[np.mean(x * x), np.mean(x * y)], [np.mean(x * y), np.mean(y * y)]])
    vals, vecs = np.linalg.eigh(cov)
    ratio = float(math.sqrt(max(vals[1], 1e-9) / max(vals[0], 1e-9)))
    major = vecs[:, 1]
    align = None
    if velocity_xy is not None:
        v = np.array(velocity_xy, dtype=float)
        if np.linalg.norm(v) > 0:
            align = float(abs(np.dot(major, v / np.linalg.norm(v))))
    ok = ratio >= 1.5 and (align is None or align >= 0.8)
    return {"elongation": ratio, "alignment": align, "ok": ok}


def intensity_curve(frames_with: Sequence[Any], frames_without: Optional[Sequence[Any]] = None,
                    mode: str = "peak") -> List[float]:
    """Intensity over time (Keyser #5 [00:12:11]-[00:14:34]), normalised to 0..1.

    mode 'peak' (default): peak added luminance (slightly blurred max), because "intensity is not
    size": an explosion is most intense at its first, smallest frames [00:14:34].
    mode 'coverage': added luminance times coverage (screen presence; use for linger checks).
    Without clean plates the frame's own luminance is used (less reliable)."""
    np = _np()
    vals = []
    for i, f in enumerate(frames_with):
        Y = luminance(load_image(f))
        added = np.maximum(Y - luminance(load_image(frames_without[i])), 0.0) if frames_without is not None else Y
        if mode == "coverage":
            vals.append(float(added.mean()))
        else:
            vals.append(float(_box_mean(added, 1).max()))
    mx = max(vals) if vals else 0.0
    return [v / mx for v in vals] if mx > 0 else vals


def motion_energy(frames: Sequence[Any]) -> List[float]:
    """Mean absolute frame difference (flicker, speed); first value 0."""
    np = _np()
    out = [0.0]
    prev = None
    for f in frames:
        Y = luminance(load_image(f))
        if prev is not None:
            out.append(float(np.abs(Y - prev).mean()))
        prev = Y
    return out


def timing_verdict(times: Sequence[float], curve: Sequence[float], event_time: float,
                   window_end: float, kind: str = "impact", fps: float = 60.0,
                   linger_after: float = 0.25, linger_max: float = 0.10) -> Dict[str, Any]:
    """Judge one intensity curve (Keyser #5): anticipation, overload at the gameplay moment, time
    to process; explosions peak at the first instant; nothing lingers after the window.
    kind: 'impact' | 'explosion' | 'projectile' | 'pulse'. Tolerances are [added]."""
    if not curve or len(curve) != len(times):
        raise ValueError("times and curve must have the same non-zero length")
    peak_i = max(range(len(curve)), key=lambda i: curve[i])
    peak_t, peak = float(times[peak_i]), float(curve[peak_i])
    tol = 2.0 / fps + 1e-6
    checks: Dict[str, Any] = {"peak_time": peak_t}
    if kind in ("impact", "explosion"):
        checks["peak_at_event"] = (event_time - 1e-6) <= peak_t <= event_time + tol
    rise_t = None
    for i in range(peak_i, -1, -1):
        if curve[i] < 0.1 * peak:
            rise_t = peak_t - float(times[i])
            break
    fall_t = None
    for i in range(peak_i, len(curve)):
        if curve[i] <= 0.1 * peak:
            fall_t = float(times[i]) - peak_t
            break
    checks["rise_s"], checks["fall_s"] = rise_t, fall_t
    if kind == "impact" and rise_t is not None and fall_t is not None and rise_t > tol:
        checks["dissipation_shorter_than_buildup"] = fall_t < rise_t   # Keyser [00:18:07]
    later = [c for t, c in zip(times, curve) if t >= window_end + linger_after - 1e-6]
    checks["linger_level"] = (max(later) / peak) if (later and peak > 0) else None
    checks["no_linger"] = checks["linger_level"] is None or checks["linger_level"] <= linger_max
    if kind == "projectile":
        travel = [c for t, c in zip(times, curve) if t < event_time]
        if len(travel) >= 3:
            m = sum(travel) / len(travel)
            sd = math.sqrt(sum((c - m) ** 2 for c in travel) / len(travel))
            checks["steady_travel"] = (sd / m if m else 1.0) <= 0.25
    checks["ok"] = all(v for k, v in checks.items() if isinstance(v, bool))
    return checks


def strobe_overlap(mask_a, mask_b) -> float:
    """IoU of the head mask on consecutive frames at game frame rate. 0 = strobing risk: stretch
    along velocity or motion-blur the texture (Keyser #5 [00:08:13]-[00:08:47])."""
    np = _np()
    a, b = np.asarray(mask_a, bool), np.asarray(mask_b, bool)
    u = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / u) if u else 0.0


def palette_shares(img, mask=None, k: int = 3, iters: int = 20, max_pixels: int = 20000) -> Dict[str, Any]:
    """Colour clusters of the effect pixels (deterministic k-means). Firsova: about 60/30/10 with
    the accent near the focal point ([00:14:39]); tolerance in the verdict is [added]."""
    np = _np()
    a = load_image(img)
    px = a[mask] if mask is not None else a.reshape(-1, 3)
    if px.shape[0] == 0:
        return {"shares": [], "ok": False}
    if px.shape[0] > max_pixels:
        idx = np.linspace(0, px.shape[0] - 1, max_pixels).astype(int)
        px = px[idx]
    lum = px @ np.array([0.2126, 0.7152, 0.0722])
    order = np.argsort(lum)
    centers = px[order[np.linspace(0, len(order) - 1, k).astype(int)]].copy()
    for _ in range(iters):
        d = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for j in range(k):
            sel = px[lab == j]
            if len(sel):
                centers[j] = sel.mean(0)
    shares = np.bincount(lab, minlength=k) / float(len(lab))
    srt = sorted(zip(shares.tolist(), centers.tolist()), reverse=True)
    s = [x[0] for x in srt]
    ok = (k == 3 and abs(s[0] - 0.6) <= 0.15 and abs(s[1] - 0.3) <= 0.15 and s[2] <= 0.25)
    return {"shares": s, "centers": [x[1] for x in srt], "ok": ok}


_CVD = {  # Machado, Oliveira, Fernandes 2009, severity 1.0, linear RGB [added]
    "protanopia": ((0.152286, 1.052583, -0.204868), (0.114503, 0.786281, 0.099216), (-0.003882, -0.048116, 1.051998)),
    "deuteranopia": ((0.367322, 0.860646, -0.227968), (0.280085, 0.672501, 0.047413), (-0.011820, 0.042940, 0.968881)),
    "tritanopia": ((1.255528, -0.076749, -0.178779), (-0.078411, 0.930809, 0.147602), (0.004733, 0.691367, 0.303900)),
}


def simulate_cvd(img, kind: str = "deuteranopia"):
    """Colour-vision-deficiency simulation for Keyser's red-on-green check (3DaBs-7oFhM [00:10:54])."""
    np = _np()
    lin = srgb_to_linear(load_image(img))
    m = np.array(_CVD[kind], dtype=np.float32)
    out = np.clip(lin @ m.T, 0.0, 1.0)
    return np.where(out <= 0.0031308, out * 12.92, 1.055 * np.power(out, 1 / 2.4) - 0.055)


def cvd_contrast(img, mask, kind: str = "deuteranopia", ring_px: int = 12) -> Dict[str, float]:
    """L* difference between the effect and its surround, before and after CVD simulation."""
    np = _np()
    a = load_image(img)
    m = np.asarray(mask, dtype=bool)
    grown = _box_mean(m.astype(np.float64), ring_px) > 0
    ring = grown & ~m
    if not m.any() or not ring.any():
        return {"before": 0.0, "after": 0.0, "retained": 0.0}
    L0, L1 = lstar(a), lstar(simulate_cvd(a, kind))
    before = abs(float(L0[m].mean() - L0[ring].mean()))
    after = abs(float(L1[m].mean() - L1[ring].mean()))
    return {"before": before, "after": after, "retained": (after / before) if before else 0.0}


def curve_correlation(a: Sequence[float], b: Sequence[float]) -> float:
    """Pearson correlation of two intensity curves (Keyser #5 [00:18:40]: two abilities with the
    same art must differ by timing)."""
    n = min(len(a), len(b))
    if n < 2:
        return 0.0
    a, b = list(a[:n]), list(b[:n])
    ma, mb = sum(a) / n, sum(b) / n
    sa = math.sqrt(sum((x - ma) ** 2 for x in a))
    sb = math.sqrt(sum((x - mb) ** 2 for x in b))
    if sa == 0 or sb == 0:
        return 0.0
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (sa * sb)


def saturation_under_values(img, mask=None, s_vivid: float = 0.85, l_min: float = 70.0,
                            max_share: float = 0.35) -> Dict[str, Any]:
    """Good values can hide bad saturation: check the saturation underneath a correct grayscale
    (Keyser #4 8iTkIDYupu4 [00:15:36]-[00:16:44]); values from linear-light L*, never a channel
    average (Keyser #3 [00:13:32]). Counts vivid pixels (S > s_vivid) among HIGH values (L* >= l_min):
    bright areas should desaturate toward the near-white core while saturation lives in the fringe and
    in dark edges ("you don't always have to have your saturated colors sing with high values",
    [00:16:49]; core to fringe [00:12:46]-[00:14:27]). An all-oversaturated effect with good values
    fails here while passing V1. Thresholds [added]."""
    np = _np()
    a = load_image(img)
    L = lstar(a)
    S = rgb_to_hsv(a)[..., 1]
    if mask is not None:
        L, S = L[mask], S[mask]
    else:
        L, S = L.ravel(), S.ravel()
    if L.size == 0:
        return {"n": 0, "ok": None}
    lit = L >= l_min
    share = float(np.mean(S[lit] > s_vivid)) if lit.any() else 0.0
    bands = {}
    for name, lo, hi in (("dark", 0.0, 35.0), ("mid", 35.0, 70.0), ("high", 70.0, 101.0)):
        sel = (L >= lo) & (L < hi)
        bands[name] = float(S[sel].mean()) if sel.any() else None
    return {"n": int(L.size), "share_vivid_lit": share, "mean_s_by_band": bands, "ok": share <= max_share}


def accent_focal_distance(img, mask, focal_xy: Tuple[float, float], k: int = 3,
                          max_frac: float = 0.10) -> Dict[str, Any]:
    """60 / 30 / 10 with the accent NEAR THE FOCAL POINT (Firsova zPl0oVanDV0 [00:14:39]-[00:15:14]):
    the smallest colour cluster's centroid against the intended focal point (world_to_screen of the
    head or impact), as a fraction of the image diagonal. max_frac [added]."""
    np = _np()
    a = load_image(img)
    m = np.asarray(mask, dtype=bool)
    pal = palette_shares(a, m, k=k)
    if not pal["shares"] or not m.any():
        return {"ok": None, "reason": "no effect pixels"}
    centers = np.array(pal["centers"], dtype=np.float64)
    ys, xs = np.nonzero(m)
    px = a[ys, xs].astype(np.float64)
    lab = ((px[:, None, :] - centers[None, :, :]) ** 2).sum(-1).argmin(1)
    acc = len(centers) - 1                                  # palette_shares sorts by share, largest first
    sel = lab == acc
    if not sel.any():
        return {"ok": None, "reason": "empty accent cluster", "shares": pal["shares"]}
    cx, cy = float(xs[sel].mean()), float(ys[sel].mean())
    h, w = a.shape[:2]
    frac = math.hypot(cx - focal_xy[0], cy - focal_xy[1]) / math.hypot(w, h)
    return {"accent_xy": (cx, cy), "distance_frac": frac, "shares": pal["shares"], "ok": frac <= max_frac}


def size_classes_series(masks: Sequence[Any]) -> Dict[str, Any]:
    """Few big, more medium, many small, and the RATIO HELD OVER TIME (Firsova [00:04:31]-[00:05:05]):
    size_classes on every frame that has at least three shapes (debris, sparks, embers)."""
    per = [size_classes(m) for m in masks]
    applicable = [p for p in per if p.get("ok") is not None]
    held = bool(applicable) and all(p["ok"] for p in applicable)
    return {"frames": per, "applicable": len(applicable), "held": held if applicable else None}


def premultiplied_check(rgba, eps: float = 2.0 / 255.0, min_share: float = 0.995) -> Dict[str, Any]:
    """Is a baked flipbook premultiplied (RGB never above alpha)? The Flipbook Baker output is
    premultiplied with black, so the material must divide RGB by A into Emissive and put A into
    Opacity, or sprites get black fringes (Flipbook Baker doc, Adjust the Settings on the Sprite
    Renderer). rgba: path to a PNG with alpha, or an HxWx4 array. min_share [added]."""
    np = _np()
    if isinstance(rgba, str):
        from PIL import Image  # type: ignore
        arr = np.asarray(Image.open(rgba).convert("RGBA"), dtype=np.float32) / 255.0
    else:
        arr = np.asarray(rgba, dtype=np.float32)
        if arr.max() > 1.5:
            arr = arr / 255.0
    if arr.ndim != 3 or arr.shape[-1] != 4:
        return {"premultiplied": None, "reason": "no alpha channel"}
    rgb, a = arr[..., :3], arr[..., 3]
    partial = (a > eps) & (a < 1.0 - eps)
    if not partial.any():
        return {"premultiplied": None, "reason": "no partially transparent pixels to judge"}
    under = np.max(rgb, axis=-1) <= a + eps
    share = float(np.mean(under[partial]))
    pre = share >= min_share
    return {"premultiplied": pre, "share_rgb_le_alpha": share,
            "action": ("material: RGB divided by A into Emissive, A into Opacity (Flipbook Baker doc)" if pre
                       else "straight alpha: use RGB directly")}


def onion_skin(frames: Sequence[Any]):
    """Max blend of a frame series (Firsova's onion-skin self-check [00:08:58])."""
    np = _np()
    out = None
    for f in frames:
        a = load_image(f)
        out = a if out is None else np.maximum(out, a)
    return out


def contact_sheet(frames: Sequence[Any], out_path: str, cols: int = 4, gray: bool = False,
                  squint: bool = False) -> str:
    """Write a grid of frames (optionally grayscale by L*, optionally blurred) for the agent to LOOK at."""
    np = _np()
    from PIL import Image  # type: ignore
    imgs = [load_image(f) for f in frames]
    if not imgs:
        raise ValueError("no frames")
    h, w = imgs[0].shape[:2]
    rows = int(math.ceil(len(imgs) / float(cols)))
    sheet = np.zeros((rows * h, cols * w, 3), dtype=np.float32)
    for i, a in enumerate(imgs):
        if gray or squint:
            L = lstar(a) / 100.0
            if squint:
                L = blur(L, r=4, passes=3)
            a = np.stack([L, L, L], -1)
        r, c = divmod(i, cols)
        sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = a[:h, :w]
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    Image.fromarray((np.clip(sheet, 0, 1) * 255).astype("uint8")).save(out_path)
    return out_path


# ---------------------------------------------------------------- procedural textures (offline)

# Fire ramp: hot near-white core, yellow, orange, red, smoky brown outside (Keyser #4 [00:10:35]);
# the first stop is kept just under white (Keyser #4 [00:19:55]). Stop values are [added].
FIRE_RAMP = ((0.00, (0.10, 0.07, 0.06)), (0.25, (0.45, 0.10, 0.03)), (0.50, (0.95, 0.35, 0.05)),
             (0.75, (1.00, 0.75, 0.25)), (1.00, (1.00, 0.95, 0.85)))


def make_glow_dot(size: int = 256, falloff: float = 2.2, artifacts: float = 0.06, seed: int = 1):
    """Soft glow dot: 'a dot, blurred, blurred more, plus messed up artifacts' (Shishido [00:14:22]).
    Returns an HxW float array 0..1 (grayscale; use as alpha or colourise with a LUT)."""
    np = _np()
    yy, xx = np.mgrid[0:size, 0:size]
    c = (size - 1) / 2.0
    r = np.hypot(xx - c, yy - c) / c
    a = np.clip(1.0 - r, 0.0, 1.0) ** falloff
    rng = np.random.default_rng(seed)
    noise = blur(rng.random((size, size)), r=max(1, size // 64), passes=2)
    noise = (noise - noise.mean()) / (noise.std() + 1e-8)
    a = np.clip(a * (1.0 + artifacts * noise), 0.0, 1.0)
    return blur(a, r=max(1, size // 128), passes=1)


def make_gradient_lut(stops=FIRE_RAMP, width: int = 256, height: int = 4):
    """Gradient LUT strip for gradient-map colouring of grayscale flipbooks (Trumpler
    [00:38:47]-[00:39:50]; Firsova's gradient maps [00:15:14]). Returns HxWx3 0..1."""
    np = _np()
    xs = np.linspace(0.0, 1.0, width)
    pos = [s[0] for s in stops]
    cols = np.array([s[1] for s in stops], dtype=np.float64)
    row = np.stack([np.interp(xs, pos, cols[:, k]) for k in range(3)], axis=-1)
    return np.repeat(row[None, :, :], height, axis=0)


def make_erosion_noise(size: int = 256, octaves: int = 4, seed: int = 1):
    """Tileable layered value noise for erosion masks, which 'fake complexity' compared with a
    uniform alpha fade (Trumpler [00:39:52]). Wraps at the edges. Returns HxW 0..1."""
    np = _np()
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = 4 * (2 ** o)
        g = rng.random((cells, cells))
        idx = (np.arange(size) * cells / float(size))
        i0 = np.floor(idx).astype(int) % cells
        i1 = (i0 + 1) % cells
        t = idx - np.floor(idx)
        t = t * t * (3 - 2 * t)
        rows = g[i0][:, i0] * (1 - t)[None, :] + g[i0][:, i1] * t[None, :]
        rows2 = g[i1][:, i0] * (1 - t)[None, :] + g[i1][:, i1] * t[None, :]
        layer = rows * (1 - t)[:, None] + rows2 * t[:, None]
        out += amp * layer
        total += amp
        amp *= 0.5
    out /= total
    return (out - out.min()) / (out.max() - out.min() + 1e-8)


def pack_masks(r, g, b):
    """Pack three grayscale masks into RGB. Only when they share UVs, panning and resolution:
    Trumpler keeps separate masks about 90 % of the time ([00:36:40]-[00:37:44])."""
    np = _np()
    return np.stack([np.asarray(r), np.asarray(g), np.asarray(b)], axis=-1)


def save_png(arr, path: str) -> str:
    """Save a 0..1 array (HxW or HxWx3) as 8-bit PNG for import."""
    np = _np()
    from PIL import Image  # type: ignore
    a = (np.clip(np.asarray(arr, dtype=np.float64), 0, 1) * 255).astype("uint8")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    Image.fromarray(a).save(path)
    return path


# ---------------------------------------------------------------- rubric scoring

# Measurable rubric rows (ids match references/critique.md). Thresholds are [added] starting
# points to calibrate on reference captures; the source column is the principle's origin.
RUBRIC_METRICS = {
    "G1": ("footprint", "edge ratio 0.85..1.15 and <=5% of effect pixels beyond 1.1 R", "Keyser #1 [00:09:44]"),
    "G3": ("linger", "intensity <=10% of peak 0.25 s after the gameplay window", "Keyser #1 [00:15:21]; #5 [00:07:18]"),
    "V1": ("value_bands", "<=2% of effect pixels above L* 97 or below 3", "Keyser #3 slide 00:02:19"),
    "V2": ("blowout", "near-white share <=2% of effect pixels", "Shishido [00:17:12]"),
    "V3": ("head_contrast", "local contrast peaks in the head third, head > tail", "Keyser #3 [00:08:13]"),
    "V4": ("focal", "focal point within 5% of the diagonal from the intended point", "Firsova [00:12:25]"),
    "V5": ("hotspots", "<=2 competing hotspots in the crowd capture", "Keyser #3 [00:01:06]"),
    "V6": ("cvd", ">=70% of effect-surround L* contrast retained under deuteranopia", "Keyser #3 [00:10:54]"),
    "C1": ("saturation", "<=1% fully blown colour (S,V > 0.95)", "Keyser #4 [00:06:29]"),
    "C2": ("saturation_under_values", "<=35% vivid (S > 0.85) among high-value pixels (L* >= 70)",
           "Keyser #4 [00:15:36]-[00:16:49]"),
    "C3": ("core_fringe", "near-white core, fringe more saturated, core brightest", "Keyser #4 [00:19:55]"),
    "C4": ("palette", "about 60/30/10 within 15 points; accent within 10% of the diagonal from the focal point",
           "Firsova [00:14:39]-[00:15:14]"),
    "S1": ("direction", "paused head elongation >=1.5, aligned >=0.8 with velocity", "Keyser #2 [00:04:04]"),
    "S2": ("size_classes", "big <= medium <= small counts, held on every applicable frame", "Firsova [00:04:31]"),
    "T1": ("timing", "peak within 2 frames of the event (impact, explosion)", "Keyser #5 [00:14:34]"),
    "T2": ("dissipation", "fall shorter than build-up when there is a build-up", "Keyser #5 [00:18:07]"),
    "T4": ("strobe", "head IoU between consecutive frames > 0", "Keyser #5 [00:08:13]"),
    "T5": ("differentiation", "curve correlation < 0.9 with the sibling ability", "Keyser #5 [00:18:40]"),
    "T7": ("schedule", "no build-up after the hit, flash on the hit, causes before consequences",
           "Shishido [00:30:00], [00:37:02]"),
    "Q3": ("budget_oscillation", "at most 3 reversals of TotalActive under a stress capture", "Kiraly [00:36:50]"),
}


def score_rubric(m: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Score measurable rubric rows 0/1/2 from a metrics dict. Keys used (all optional):
    footprint (footprint_vs_radius), timing (timing_verdict), value_bands, blowout (float),
    head_contrast (axis_contrast_profile), focal_error (float), hotspots (int), cvd
    (cvd_contrast), saturation (saturation_stats), core_fringe (core_fringe_verdict),
    palette (palette_shares), direction (elongation), size_classes, strobe_iou (float),
    correlation (float); v0.2: saturation_under_values, accent (accent_focal_distance),
    size_classes_series, schedule (spawn_schedule_verdict), budget_oscillation.
    Missing metrics are reported as 'not measured'."""
    rows: List[Dict[str, Any]] = []

    def add(rid: str, score: Optional[int], detail: Any):
        metric, rule, src = RUBRIC_METRICS[rid]
        rows.append({"id": rid, "metric": metric, "rule": rule, "source": src,
                     "score": score, "detail": detail,
                     "status": "not measured" if score is None else ("pass" if score == 2 else ("near" if score == 1 else "fail"))})

    def band(value: Optional[float], good: float, near: float, higher_is_better: bool = False) -> Optional[int]:
        if value is None:
            return None
        if higher_is_better:
            return 2 if value >= good else (1 if value >= near else 0)
        return 2 if value <= good else (1 if value <= near else 0)

    fp = m.get("footprint")
    if fp:
        s = 2 if fp["ok"] else (1 if 0.7 <= fp["edge_ratio"] <= 1.3 and fp["share_outside_1_1r"] <= 0.15 else 0)
        add("G1", s, fp)
    else:
        add("G1", None, None)
    tv = m.get("timing") or {}
    add("G3", (2 if tv.get("no_linger") else (1 if (tv.get("linger_level") or 1) <= 0.25 else 0)) if tv else None, tv.get("linger_level"))
    vb = m.get("value_bands")
    add("V1", band(max(vb["share_above_97"], vb["share_below_3"]), 0.02, 0.05) if vb and vb.get("n") else None, vb)
    add("V2", band(m.get("blowout"), 0.02, 0.05), m.get("blowout"))
    hc = m.get("head_contrast")
    add("V3", (2 if hc["ok"] else (1 if hc["head_mean"] > hc["tail_mean"] else 0)) if hc else None, hc and hc.get("profile"))
    add("V4", band(m.get("focal_error"), 0.05, 0.10), m.get("focal_error"))
    hs = m.get("hotspots")
    add("V5", (2 if hs <= 2 else (1 if hs <= 3 else 0)) if hs is not None else None, hs)
    cv = m.get("cvd")
    add("V6", band(cv["retained"], 0.7, 0.5, higher_is_better=True) if cv else None, cv)
    ss = m.get("saturation")
    add("C1", band(ss["share_full_blown"], 0.01, 0.03) if ss and ss.get("n") else None, ss)
    su = m.get("saturation_under_values")
    add("C2", band(su["share_vivid_lit"], 0.35, 0.5) if su and su.get("n") else None, su)
    cf = m.get("core_fringe")
    add("C3", (2 if cf["ok"] else (1 if cf.get("saturation_rises_outward") else 0)) if cf and "core_L" in cf else None, cf)
    pl = m.get("palette")
    acc = m.get("accent") or {}
    if pl and pl.get("shares"):
        c4 = 2 if pl["ok"] else 1
        if acc.get("ok") is False:
            c4 = min(c4, 1)
        add("C4", c4, {"shares": pl.get("shares"), "accent_distance": acc.get("distance_frac")})
    else:
        add("C4", None, None)
    el = m.get("direction")
    add("S1", (2 if el["ok"] else (1 if el.get("elongation", 0) >= 1.2 else 0)) if el and "elongation" in el else None, el)
    sc = m.get("size_classes")
    ser = m.get("size_classes_series")
    if ser and ser.get("held") is not None:
        add("S2", 2 if ser["held"] else (1 if any(p.get("ok") for p in ser["frames"] if p.get("ok") is not None) else 0),
            {"applicable": ser["applicable"]})
    else:
        add("S2", (2 if sc["ok"] else (1 if sc.get("small", 0) > sc.get("big", 0) else 0))
            if sc and sc.get("ok") is not None else None, sc)
    if tv and "peak_at_event" in tv:
        add("T1", 2 if tv["peak_at_event"] else 0, tv.get("peak_time"))
    else:
        add("T1", None, None)
    if tv and "dissipation_shorter_than_buildup" in tv:
        add("T2", 2 if tv["dissipation_shorter_than_buildup"] else 0, (tv.get("rise_s"), tv.get("fall_s")))
    else:
        add("T2", None, None)
    iou = m.get("strobe_iou")
    add("T4", (2 if iou >= 0.2 else (1 if iou > 0 else 0)) if iou is not None else None, iou)
    cc = m.get("correlation")
    add("T5", band(cc, 0.9, 0.95) if cc is not None else None, cc)
    sch = m.get("schedule")
    if sch is not None:
        codes = {p["code"] for p in sch.get("problems", [])}
        add("T7", 0 if codes & {"BUILDUP_AFTER_HIT", "FLASH_NOT_ON_HIT"} else (1 if "CAUSE_ORDER" in codes else 2),
            sorted(codes))
    else:
        add("T7", None, None)
    bo = m.get("budget_oscillation")
    add("Q3", (0 if bo["oscillating"] else 2) if bo else None, bo and bo.get("reversals"))
    return rows


def rubric_summary(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    measured = [r for r in rows if r["score"] is not None]
    fails = [r["id"] for r in measured if r["score"] == 0]
    return {"measured": len(measured), "score": sum(r["score"] for r in measured),
            "max": 2 * len(measured), "fails": fails, "not_measured": [r["id"] for r in rows if r["score"] is None],
            "deliverable": not fails}


# =============================================================================================
# 4. IN-EDITOR LAYER (UE 5.8 Editor Python). NOT YET RUN IN UNREAL.
# =============================================================================================

def _ue():
    import unreal  # type: ignore  # only inside UnrealEditor
    return unreal


def _enum(enum_cls, candidates: Sequence[str]):
    for c in candidates:
        if hasattr(enum_cls, c):
            return getattr(enum_cls, c)
    raise AttributeError("none of %s on %s [verify with job_00_vfx_probe]" % (list(candidates), enum_cls))


def _set(obj, prop: str, value, log: Dict[str, str]):
    """set_editor_property with logging; several Chaos/Niagara properties are read-only as Python
    attributes but read-write as editor properties (py-nia doc)."""
    try:
        obj.set_editor_property(prop, value)
        log[prop] = "ok"
    except Exception as exc:  # noqa: BLE001
        log[prop] = "FAILED: %s" % exc


def _get(obj, prop: str, default=None):
    try:
        return obj.get_editor_property(prop)
    except Exception:  # noqa: BLE001
        return default


def asset_subsystem():
    u = _ue()
    return u.get_editor_subsystem(u.EditorAssetSubsystem)


def actor_subsystem():
    u = _ue()
    return u.get_editor_subsystem(u.EditorActorSubsystem)


def load(path: str):
    return _ue().load_asset(path)


def duplicate_template(src: str, dst: str, overwrite: bool = False):
    """Duplicate a template NiagaraSystem (or any asset). Python cannot author emitters or modules
    (py-nia doc), so every effect starts as a duplicate. Not yet run in Unreal."""
    eas = asset_subsystem()
    if eas.does_asset_exist(dst):
        if not overwrite:
            raise RuntimeError("%s exists; version it (never overwrite a deliverable) or pass overwrite" % dst)
        return load(dst)
    asset = eas.duplicate_asset(src, dst)
    if asset is None:
        raise RuntimeError("duplicate_asset failed: %s -> %s" % (src, dst))
    return asset


def user_parameters(system) -> List[Dict[str, str]]:
    """get_all_user_parameters -> [{'name','type','raw'}]. NiagaraUserParameterInfo field names are
    [verify]; the function tries common ones and keeps the repr."""
    u = _ue()
    out = []
    for p in u.NiagaraFunctionLibrary.get_all_user_parameters(system):
        d = {"raw": str(p)}
        for fld in ("name", "parameter_name", "variable_name"):
            v = _get(p, fld)
            if v is not None:
                d["name"] = str(v)
                break
        for fld in ("type", "type_name", "parameter_type"):
            v = _get(p, fld)
            if v is not None:
                d["type"] = str(v)
                break
        out.append(d)
    return out


def set_system_properties(system, props: Dict[str, Any]) -> Dict[str, str]:
    """Set NiagaraSystem editor properties (effect_type, max_pool_size, pool_prime_size,
    warmup_time, require_current_frame_data, determinism, random_seed, ...). Returns a log."""
    log: Dict[str, str] = {}
    for k, v in props.items():
        if isinstance(v, str) and v.startswith("/"):
            v = load(v)
        _set(system, k, v, log)
    return log


def assign_effect_type(system_paths: Sequence[str], effect_type_path: str, save: bool = True) -> Dict[str, str]:
    """Assign one Effect Type to many systems (doc-listed `effect_type`). Not yet run in Unreal."""
    eft = load(effect_type_path)
    eas = asset_subsystem()
    log: Dict[str, str] = {}
    for p in system_paths:
        s = load(p)
        sub: Dict[str, str] = {}
        _set(s, "effect_type", eft, sub)
        log[p] = sub.get("effect_type", "?")
        if save and sub.get("effect_type") == "ok":
            eas.save_loaded_asset(s, only_if_is_dirty=False)
    return log


def create_effect_type(path: str, preset_name: str) -> Tuple[Any, Dict[str, str]]:
    """Create a NiagaraEffectType from EFFECT_TYPE_PRESETS [verify: factory class and field names;
    the 5.8 Python doc audited for this project does not cover NiagaraEffectType]. If this fails,
    a human or GUI agent builds the asset once from gui-paths.md and the agent only assigns it."""
    u = _ue()
    preset = EFFECT_TYPE_PRESETS[preset_name]
    pkg, name = path.rsplit("/", 1)
    tools = u.AssetToolsHelpers.get_asset_tools()
    factory = None
    for fname in ("NiagaraEffectTypeFactoryNew", "NiagaraEffectTypeFactory"):
        if hasattr(u, fname):
            factory = getattr(u, fname)()
            break
    eft = tools.create_asset(name, pkg, u.NiagaraEffectType, factory)
    log: Dict[str, str] = {"factory": type(factory).__name__ if factory else "None"}
    try:
        _set(eft, "update_frequency", _enum(u.NiagaraScalabilityUpdateFrequency,
                                            UPDATE_FREQUENCY_ENUM[preset["update_frequency"]]), log)
    except Exception as exc:  # noqa: BLE001
        log["update_frequency"] = "FAILED: %s" % exc
    try:
        _set(eft, "cull_reaction", _enum(u.NiagaraCullReaction, CULL_REACTION_ENUM[preset["cull_reaction"]]), log)
    except Exception as exc:  # noqa: BLE001
        log["cull_reaction"] = "FAILED: %s" % exc
    if "allow_culling_for_local_players" in preset:
        _set(eft, "allow_culling_for_local_players", preset["allow_culling_for_local_players"], log)
    if preset.get("significance") == "Distance":
        try:
            handler = u.new_object(u.NiagaraSignificanceHandlerDistance, eft)
            _set(eft, "significance_handler", handler, log)
        except Exception as exc:  # noqa: BLE001
            log["significance_handler"] = "FAILED: %s" % exc
    # Scalability array entries: struct field names [verify]; applied field by field and logged.
    try:
        arr = eft.get_editor_property("system_scalability_settings")
        settings = list(arr.get_editor_property("settings"))
        if settings:
            st = settings[0]
            for fld, key in (("max_system_instances", "max_system_instances"),
                             ("max_instances", "max_effect_type_instances")):
                if preset.get(key):
                    _set(st, fld, int(preset[key]), log)
            settings[0] = st
            arr.set_editor_property("settings", settings)
            _set(eft, "system_scalability_settings", arr, log)
    except Exception as exc:  # noqa: BLE001
        log["system_scalability_settings"] = "FAILED: %s" % exc
    asset_subsystem().save_loaded_asset(eft, only_if_is_dirty=False)
    return eft, log


def niagara_facts(system, path: str = "") -> Dict[str, Any]:
    """Facts for niagara_system_verdict. Handles the two `fixed_bounds` properties the doc lists
    (a Box and a bool) by type [verify which one Python returns]."""
    u = _ue()
    eft = _get(system, "effect_type")
    fb = _get(system, "fixed_bounds")
    fixed_enabled = bool(fb) if isinstance(fb, bool) else None
    emitters = []
    gpu = 0
    try:
        for e in u.NiagaraFunctionLibrary.get_all_emitters(system):
            s = str(e)
            emitters.append(s)
            if "GPU" in s.upper():
                gpu += 1
    except Exception as exc:  # noqa: BLE001
        emitters.append("get_all_emitters FAILED: %s" % exc)
    return {
        "path": path or system.get_path_name(),
        "effect_type": eft.get_name() if eft else None,
        "max_pool_size": _get(system, "max_pool_size"),
        "pool_prime_size": _get(system, "pool_prime_size"),
        "warmup_time": _get(system, "warmup_time"),
        "fixed_tick_delta": _get(system, "fixed_tick_delta"),
        "require_current_frame_data": _get(system, "require_current_frame_data"),
        "fixed_bounds_enabled": fixed_enabled,
        "fixed_bounds_raw": str(fb),
        "emitters": emitters,
        "gpu_emitters": gpu,          # from NiagaraMinimalEmitterInfo repr [verify fields]
        "user_parameters": [p.get("name", p["raw"]) for p in user_parameters(system)],
    }


def audit_niagara(root: str = "/Game", recursive: bool = True) -> List[Dict[str, Any]]:
    """Every NiagaraSystem under root: facts plus verdict, systems without an Effect Type first
    (Kiraly's first fix list, [00:14:14]). Headless-capable. Not yet run in Unreal."""
    u = _ue()
    eas = asset_subsystem()
    rows = []
    for p in eas.list_assets(root, recursive=recursive, include_folder=False):
        a = eas.load_asset(p)
        if not isinstance(a, u.NiagaraSystem):
            continue
        f = niagara_facts(a, p)
        f["verdict"] = niagara_system_verdict(f)
        rows.append(f)
    rows.sort(key=lambda r: (r["effect_type"] is not None, r["path"]))
    return rows


def place_system(system, location=(0.0, 0.0, 100.0)):
    """Place a NiagaraActor in the editor level and return (actor, component)."""
    u = _ue()
    actor = actor_subsystem().spawn_actor_from_object(system, u.Vector(*location))
    comp = actor.get_component_by_class(u.NiagaraComponent)
    return actor, comp


def set_user_params(comp, params: Dict[str, Any]) -> Dict[str, str]:
    """Set User parameters on a NiagaraComponent by value type (doc-listed set_variable_*).
    Names are passed as given; the User redirection store should accept both 'User.X' and 'X'
    [verify]. Verifies floats/ints/bools with get_variable_* when that returns a value."""
    u = _ue()
    log: Dict[str, str] = {}
    for name, v in params.items():
        try:
            if isinstance(v, str) and v.startswith("/"):
                v = load(v)
            if isinstance(v, bool):
                comp.set_variable_bool(name, v)
            elif isinstance(v, int):
                comp.set_variable_int(name, v)
            elif isinstance(v, float):
                comp.set_variable_float(name, v)
            elif isinstance(v, u.LinearColor):
                comp.set_variable_linear_color(name, v)
            elif isinstance(v, u.Vector):
                (comp.set_variable_position if "position" in name.lower() else comp.set_variable_vec3)(name, v)
            elif isinstance(v, u.MaterialInterface):
                comp.set_variable_material(name, v)
            elif isinstance(v, u.StaticMesh):
                comp.set_variable_static_mesh(name, v)
            elif isinstance(v, u.Texture):
                comp.set_variable_texture(name, v)
            elif isinstance(v, u.Actor):
                comp.set_variable_actor(name, v)
            else:
                comp.set_variable_object(name, v)
            log[name] = "set"
            if isinstance(v, (float, int)) and not isinstance(v, bool):
                getter = comp.get_variable_float if isinstance(v, float) else comp.get_variable_int
                got = getter(name)
                log[name] = "set, read back %s" % (got,)
        except Exception as exc:  # noqa: BLE001
            log[name] = "FAILED: %s" % exc
    return log


def world(pie: bool = False):
    u = _ue()
    ues = u.get_editor_subsystem(u.UnrealEditorSubsystem)
    return ues.get_game_world() if pie else ues.get_editor_world()


def console(cmd: str, pie: bool = False) -> None:
    """Run a console command in the editor or PIE world (SystemLibrary.execute_console_command [added])."""
    u = _ue()
    u.SystemLibrary.execute_console_command(world(pie), cmd)


def spawn_pooled(system, location=(0.0, 0.0, 100.0), method: str = "AUTO_RELEASE", pie: bool = True):
    """Spawn with a pooling method chosen at spawn time (Kiraly [00:32:18]); PIE world by default."""
    u = _ue()
    pm = _enum(u.NCPoolMethod, POOL_METHOD_ENUM[method])
    return u.NiagaraFunctionLibrary.spawn_system_at_location(world(pie), system, u.Vector(*location),
                                                            pooling_method=pm)


def stress_grid_place(system, n: int = 20, spacing: float = 300.0, origin=(0.0, 0.0, 100.0)) -> list:
    """Place n x n copies (the doc's 20 x 20 test) in the editor level; returns actors."""
    u = _ue()
    eas = actor_subsystem()
    return [eas.spawn_actor_from_object(system, u.Vector(*p)) for p in stress_grid(n, spacing, origin)]


def capture_ages(comp, ages: Sequence[float], out_dir: str, width: int = 1280, height: int = 720,
                 prefix: str = "fx", settle_ticks: int = 3):
    """GENERATOR: deterministic capture of a Niagara component at fixed ages. Run it as a latent
    job (ue_run.run_python(..., mode="latent"): one editor tick per yield) or in a live editor with
    run_on_ticker(). Needs a rendering editor (never a commandlet or -nullrhi).

    DesiredAge mode + seek, a few settle ticks, then ue_review.screenshot + wait_screenshot
    (lead toolkit). Writes <out_dir>/<prefix>_series.json and returns {"ages", "files", "series"}.
    Seeks longer than set_max_sim_time spill over frames; settle_ticks may need raising [verify].
    Not yet run in Unreal."""
    import ue_review  # <skills>/scenario-unreal-expert/scripts
    u = _ue()
    os.makedirs(out_dir, exist_ok=True)
    comp.set_age_update_mode(_enum(u.NiagaraAgeUpdateMode, ("DESIRED_AGE",)))
    comp.set_can_render_while_seeking(False)
    comp.reset_system()
    files = []
    for i, age in enumerate(ages):
        comp.seek_to_desired_age(float(age))
        for _ in range(int(settle_ticks)):
            yield
        path = os.path.join(out_dir, "%s_%02d_%0.3fs.png" % (prefix, i, float(age)))
        req = ue_review.screenshot(path, width, height)
        got = yield from ue_review.wait_screenshot(req)
        files.append(got)
    series = os.path.join(out_dir, prefix + "_series.json")
    with open(series, "w") as fh:
        json.dump({"ages": list(ages), "files": files}, fh, indent=1)
    return {"ages": list(ages), "files": files, "series": series}


def run_on_ticker(gen, on_done=None):
    """Drive a latent generator (capture_ages, a latent job's main) in a LIVE editor reached through
    Epic's MCP server or ue_remote.PythonRemote, one tick per yield; a number yielded means seconds
    to wait. on_done(value or exception) is called at the end. Returns the ticker handle.
    ue_run's latent mode does the same for headless-launched editors. Not yet run in Unreal."""
    import time as _time
    u = _ue()
    st = {"wake": 0.0, "handle": None}

    def tick(_dt):
        if _time.time() < st["wake"]:
            return True
        try:
            step = next(gen)
        except StopIteration as stop:
            u.unregister_ticker_callback(st["handle"])
            if on_done:
                on_done(stop.value)
            return False
        except Exception as exc:  # noqa: BLE001
            u.unregister_ticker_callback(st["handle"])
            if on_done:
                on_done(exc)
            return False
        if isinstance(step, (int, float)) and step > 0:
            st["wake"] = _time.time() + float(step)
        return True
    st["handle"] = u.register_ticker_callback(tick)
    return st["handle"]


TEXTURE_ROLE_SETTINGS = {
    # role: (srgb, compression candidates, lod group candidates). Enum member names [verify].
    "mask": (False, ("TC_MASKS",), ("TEXTUREGROUP_EFFECTS",)),
    "erosion": (False, ("TC_GRAYSCALE", "TC_MASKS"), ("TEXTUREGROUP_EFFECTS",)),
    "color": (True, ("TC_DEFAULT",), ("TEXTUREGROUP_EFFECTS",)),
    "flipbook": (True, ("TC_DEFAULT",), ("TEXTUREGROUP_EFFECTS",)),
    "lut": (True, ("TC_DEFAULT",), ("TEXTUREGROUP_EFFECTS",)),
}


def import_textures(files: Sequence[str], dest: str) -> list:
    """Headless import with AssetImportTask + AssetTools.import_asset_tasks (doc-listed); returns
    imported objects (AssetImportTask.get_objects, since `result` is deprecated). Not yet run."""
    u = _ue()
    tasks = []
    for f in files:
        t = u.AssetImportTask()
        t.set_editor_property("filename", f)
        t.set_editor_property("destination_path", dest)
        t.set_editor_property("automated", True)
        t.set_editor_property("save", True)
        t.set_editor_property("replace_existing", False)
        tasks.append(t)
    u.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
    out = []
    for t in tasks:
        try:
            out.extend(t.get_objects())
        except Exception:  # noqa: BLE001
            pass
    return out


def apply_texture_settings(tex, role: str, max_size: int = 0) -> Dict[str, str]:
    """Big source, small in engine: sRGB off for masks, Effects group, compression by role, and a
    Maximum Texture Size cap (Trumpler [00:18:14]; 5.8 texture doc). Not yet run in Unreal."""
    u = _ue()
    srgb, comp, group = TEXTURE_ROLE_SETTINGS[role]
    log: Dict[str, str] = {}
    _set(tex, "srgb", srgb, log)
    try:
        _set(tex, "compression_settings", _enum(u.TextureCompressionSettings, comp), log)
    except Exception as exc:  # noqa: BLE001
        log["compression_settings"] = "FAILED: %s" % exc
    try:
        _set(tex, "lod_group", _enum(u.TextureGroup, group), log)
    except Exception as exc:  # noqa: BLE001
        log["lod_group"] = "FAILED: %s" % exc
    if max_size:
        _set(tex, "max_texture_size", int(max_size), log)
    asset_subsystem().save_loaded_asset(tex, only_if_is_dirty=False)
    return log


# ---------------------------------------------------------------- Chaos (in editor)

def gc_facts(gc, path: str = "") -> Dict[str, Any]:
    """Facts for gc_verdict from a GeometryCollection asset (doc-listed editor properties)."""
    thr = _get(gc, "damage_threshold") or []
    rp = _get(gc, "root_proxy_data")
    rp_meshes = _get(rp, "proxy_meshes") if rp is not None else None   # struct field [verify]
    pm = _get(gc, "physics_material")
    density = None
    tensile = None
    if pm is not None:
        d = _get(pm, "density")
        density = float(d) if d is not None else None
        st = _get(pm, "strength")                          # FPhysicalMaterialStrength [verify]
        ts = _get(st, "tensile_strength") if st is not None else None
        tensile = float(ts) if ts is not None else None
    df = None
    try:
        df = gc.get_dataflow_asset()
    except Exception:  # noqa: BLE001
        pass
    crt = _get(gc, "custom_renderer_type")
    return {
        "path": path or gc.get_path_name(),
        "enable_nanite": _get(gc, "enable_nanite"),
        "enable_nanite_fallback": _get(gc, "enable_nanite_fallback"),
        "strip_on_cook": _get(gc, "strip_on_cook"),
        "root_proxy_count": len(rp_meshes) if rp_meshes else 0,
        "custom_renderer_type": crt.get_name() if crt else "",
        "remove_on_max_sleep": _get(gc, "remove_on_max_sleep"),
        "maximum_sleep_time": str(_get(gc, "maximum_sleep_time")),
        "removal_duration": str(_get(gc, "removal_duration")),
        "damage_threshold": [float(x) for x in thr],
        "levels": _get(gc, "max_cluster_level"),
        "use_size_specific_damage_threshold": _get(gc, "use_size_specific_damage_threshold"),
        "damage_model": str(_get(gc, "damage_model")),
        "cluster_connection_type": str(_get(gc, "cluster_connection_type")),
        "physics_material": pm.get_name() if pm else None,
        "density_g_cm3": density,
        "size_specific_count": len(_get(gc, "size_specific_data") or []),
        "dataflow_asset": df.get_name() if df else None,
        "use_material_damage_modifiers": _get(gc, "use_material_damage_modifiers"),
        "automatic_crumble_partial_clusters": _get(gc, "automatic_crumble_partial_clusters"),
        "tensile_strength": tensile,
    }


def harden_gc(gc, settings: Dict[str, Any], save: bool = True) -> Dict[str, str]:
    """Asset-level destruction policy. settings keys (doc-listed): enable_nanite (via set_enable_nanite),
    enable_nanite_fallback, strip_on_cook, damage_threshold (list), use_size_specific_damage_threshold,
    use_material_damage_modifiers, remove_on_max_sleep, maximum_sleep_time (min, max),
    removal_duration (min, max), slow_moving_as_sleeping, slow_moving_velocity_threshold,
    physics_material (path), root_proxy_meshes (paths), custom_renderer_class (name) [verify].
    Per-bone data (anchors, Remove on Break, one-way debris levels) is NOT on this class: Dataflow
    or Fracture Mode. Not yet run in Unreal."""
    u = _ue()
    log: Dict[str, str] = {}
    s = dict(settings)
    if "enable_nanite" in s:
        try:
            gc.set_enable_nanite(bool(s.pop("enable_nanite")))
            log["enable_nanite"] = "ok"
        except Exception as exc:  # noqa: BLE001
            log["enable_nanite"] = "FAILED: %s" % exc
    for key in ("maximum_sleep_time", "removal_duration"):
        if key in s:
            lo, hi = s.pop(key)
            _set(gc, key, u.Vector2D(float(lo), float(hi)), log)
    if "physics_material" in s:
        _set(gc, "physics_material", load(s.pop("physics_material")), log)
    if "damage_threshold" in s:
        _set(gc, "damage_threshold", [float(x) for x in s.pop("damage_threshold")], log)
    meshes = s.pop("root_proxy_meshes", None)
    if meshes:
        try:
            proxy = u.GeometryCollectionProxyMeshData()
            _set(proxy, "proxy_meshes", [load(m) for m in meshes], log)   # field name [verify]
            _set(gc, "root_proxy_data", proxy, log)
        except Exception as exc:  # noqa: BLE001
            log["root_proxy_data"] = "FAILED: %s" % exc
    rclass = s.pop("custom_renderer_class", None)
    if rclass:
        cls = getattr(u, rclass, None)
        if cls is None:
            log["custom_renderer_type"] = "FAILED: unreal.%s not found [verify]" % rclass
        else:
            _set(gc, "custom_renderer_type", cls, log)
    for k, v in s.items():
        _set(gc, k, v, log)
    if save:
        asset_subsystem().save_loaded_asset(gc, only_if_is_dirty=False)
    return log


def audit_gc(root: str = "/Game", recursive: bool = True, placements: Optional[Dict[str, int]] = None) -> List[Dict[str, Any]]:
    """Every GeometryCollection under root with facts and verdict. Headless-capable. Not yet run."""
    u = _ue()
    eas = asset_subsystem()
    rows = []
    for p in eas.list_assets(root, recursive=recursive, include_folder=False):
        a = eas.load_asset(p)
        if not isinstance(a, u.GeometryCollection):
            continue
        f = gc_facts(a, p)
        f["verdict"] = gc_verdict(f, placements=(placements or {}).get(p, 1))
        rows.append(f)
    return rows


def texture_facts(tex, path: str = "", role: Optional[str] = None, needed_size: Optional[int] = None) -> Dict[str, Any]:
    """Facts for texture_verdict from a Texture2D (editor properties srgb, lod_group,
    compression_settings, max_texture_size; size getters [verify]). Role from the name when not
    given (texture_role_from_name). Works on any object with get_editor_property. Not yet run in Unreal."""
    name = path.rsplit("/", 1)[-1] if path else (tex.get_name() if hasattr(tex, "get_name") else "")
    w = h = 0
    for gx, gy in (("blueprint_get_size_x", "blueprint_get_size_y"), ("get_size_x", "get_size_y")):
        fx, fy = getattr(tex, gx, None), getattr(tex, gy, None)
        if fx and fy:
            try:
                w, h = int(fx()), int(fy())
                break
            except Exception:  # noqa: BLE001
                pass
    return {"path": path or name, "role": role or texture_role_from_name(name), "width": w, "height": h,
            "srgb": _get(tex, "srgb"), "lod_group": str(_get(tex, "lod_group", "")),
            "compression": str(_get(tex, "compression_settings", "")),
            "max_texture_size": _get(tex, "max_texture_size"), "needed_size": needed_size}


def audit_vfx_textures(root: str = "/Game/VFX", recursive: bool = True) -> List[Dict[str, Any]]:
    """Every Texture2D under root: facts plus texture_verdict (masks sRGB off, TEXTUREGROUP_Effects,
    power of two, big sources capped in engine; Trumpler [00:18:14]-[00:20:05]). Headless-capable.
    Not yet run in Unreal."""
    u = _ue()
    eas = asset_subsystem()
    rows = []
    for p in eas.list_assets(root, recursive=recursive, include_folder=False):
        a = eas.load_asset(p)
        if not isinstance(a, u.Texture2D):
            continue
        f = texture_facts(a, p)
        f["verdict"] = texture_verdict(f)
        rows.append(f)
    return rows


def enable_break_events(gc_comp, breaks: bool = True, collisions: bool = False, removals: bool = False) -> Dict[str, str]:
    """Component half of the event wiring Niagara needs to read Chaos breaks (Xiao Yue zFiHDRREv7E
    [00:08:42]): break (and optional collision, removal) notification on the GC component. The
    project half, Chaos data generation in Project Settings, is a GUI or DefaultEngine.ini edit
    [setting name verify]. Setter and property names [verify]. Not yet run in Unreal."""
    log: Dict[str, str] = {}
    for flag, on in (("breaks", breaks), ("collisions", collisions), ("removals", removals)):
        if not on:
            continue
        setter = getattr(gc_comp, "set_notify_" + flag, None)
        if setter is not None:
            try:
                setter(True)
                log["notify_" + flag] = "ok"
                continue
            except Exception as exc:  # noqa: BLE001
                log["notify_" + flag] = "setter FAILED: %s" % exc
        _set(gc_comp, "notify_" + flag, True, log)
    return log


def export_static_mesh_obj(mesh, out_path: str) -> str:
    """Export a Static Mesh to OBJ for mesh_watertight_check (AssetExportTask [verify exporter
    selection in 5.8]). Not yet run in Unreal."""
    u = _ue()
    task = u.AssetExportTask()
    task.set_editor_property("object", mesh)
    task.set_editor_property("filename", out_path)
    task.set_editor_property("automated", True)
    task.set_editor_property("prompt", False)
    task.set_editor_property("replace_identical", True)
    ok = u.Exporter.run_asset_export_task(task)
    if not ok:
        raise RuntimeError("OBJ export failed for %s [verify exporter]" % mesh.get_path_name())
    return out_path


def apply_strain(gc_comp, location, strain: float, radius: float = 100.0, item_index: int = -1,
                 breaking_velocity=None, propagation_depth: int = 1, propagation_factor: float = 1.0) -> Dict[str, str]:
    """PIE test hit without a projectile: Apply External Strain then Apply Breaking Linear Velocity
    (Van Allen [00:29:29]; quickstart Radius 100, depth 1, factor 1). Python method names and argument
    order are [verify]; the function tries candidates and logs. Not yet run in Unreal."""
    u = _ue()
    log: Dict[str, str] = {}
    loc = u.Vector(*location) if isinstance(location, (tuple, list)) else location
    fn = getattr(gc_comp, "apply_external_strain", None)
    if fn is None:
        log["apply_external_strain"] = "FAILED: not exposed [verify]"
    else:
        try:
            fn(item_index, loc, radius, propagation_depth, propagation_factor, strain)
            log["apply_external_strain"] = "ok"
        except Exception as exc:  # noqa: BLE001
            log["apply_external_strain"] = "FAILED: %s" % exc
    if breaking_velocity is not None:
        vel = u.Vector(*breaking_velocity) if isinstance(breaking_velocity, (tuple, list)) else breaking_velocity
        for name in ("apply_breaking_linear_velocity", "apply_linear_velocity"):
            f2 = getattr(gc_comp, name, None)
            if f2 is None:
                continue
            try:
                f2(item_index, vel)
                log[name] = "ok"
                break
            except Exception as exc:  # noqa: BLE001
                log[name] = "FAILED: %s" % exc
    return log


# ---------------------------------------------------------------- probe

def probe() -> Dict[str, Any]:
    """Record the names this skill marks [verify]. Run first (job_00_vfx_probe.py)."""
    u = _ue()
    rep: Dict[str, Any] = {"engine": u.SystemLibrary.get_engine_version()}
    rep["classes"] = sorted(n for n in dir(u) if any(k in n for k in (
        "Niagara", "GeometryCollection", "Dataflow", "Fracture", "FieldSystem", "ChaosCache",
        "FXConverter", "Cascade", "PhysicalMaterial", "ChaosVD")))
    for enum_name in ("NCPoolMethod", "NiagaraAgeUpdateMode", "NiagaraCullReaction",
                      "NiagaraScalabilityUpdateFrequency", "ClusterConnectionTypeEnum", "DamageModelTypeEnum"):
        e = getattr(u, enum_name, None)
        rep["enum:" + enum_name] = sorted(n for n in dir(e) if n.isupper()) if e else "MISSING"
    for cls_name in ("NiagaraEffectType", "NiagaraSystem", "NiagaraComponent", "GeometryCollection",
                     "GeometryCollectionComponent", "NiagaraDataChannelAsset", "PhysicalMaterial"):
        c = getattr(u, cls_name, None)
        rep["dir:" + cls_name] = sorted(n for n in dir(c) if not n.startswith("_")) if c else "MISSING"
    return rep
