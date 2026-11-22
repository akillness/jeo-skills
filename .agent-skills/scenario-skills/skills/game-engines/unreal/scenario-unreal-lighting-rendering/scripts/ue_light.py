#!/usr/bin/env python3
"""ue_light: toolkit of the scenario-unreal-lighting-rendering skill (Unreal Engine 5.8, macOS Apple Silicon).

STATUS: not yet run in Unreal. The pure layer is tested offline with python3 + numpy (Pillow for PNG,
ffmpeg for EXR) by tests/code/unreal-lighting-rendering/test_ue_light_offline.py. The editor layer ran
only against a fake `unreal` module (test_editor_layer_fake.py): that proves the Python logic, not the
engine names. Every engine class, property, enum and console name here is [verify] until
job_00_probe_lighting.py has run in the installed editor and its probe JSON has been read.

Use in the editor (Editor Python through Epic's MCP server, Remote Control Python exec, or a headless
`ue_run.run_python` job): put this folder on sys.path, then `import ue_light as L`.
Offline: `python3 ue_light.py <command> ...` (see main()).

WHERE EACH PART RUNS
Pure (python3 anywhere, and inside the editor):
  photometry  lumens_per_candela, lumens_to_candela, candela_to_lumens, to_unitless, from_unitless,
              ev100_from_camera, exposure_scale, pixel_from_luminance, luminance_from_pixel,
              ev100_for_luminance, ev100_for_illuminance, camera_for_ev100, emissive_for_stops,
              rect_candela_from_luminance, illuminance_at, tight_attenuation_radius, hsv_linear
  tables      CONDITIONS, FIXTURES, KELVIN, SKY, BUDGETS, THRESHOLDS, VIEW_MODES, CVAR_PRESETS,
              CVAR_FIXES, DEPRECATED_CVARS, CARGO_CULT_CVARS, SHADOW_LIFT_LADDER, NOISE_TRIAGE,
              RENDER_DIFF_TRIAGE, GLASS_RECIPE
  planning    exposure_plan, pp_values_for_exposure, look_values, sun_rotator, aim_rotator,
              forward_from_rotator, scattering_distribution_for, opening_rect_light, neon_sign_light,
              emissive_strategy, still_only_light_plan, exterior_rig_plan, still_plan, mrg_variables,
              capture_plan, preset_commands, device_profile_lines
  lint        light_lint, ppv_lint, scene_lint, glass_lint, room_shell_lint, emissive_fixture_pairs,
              cheat_inventory, cvar_lint, render_settings_report, ini_patch, mrg_lint, pass_budget,
              profilegpu_passes, exposure_warnings
  frames      load_image, luminance, region_mask, region_stats, frame_report, albedo_check,
              compare_ground_truth, temporal_flicker, noise_sigma, red_fraction, rank_lights_in_dump,
              write_report
Editor (needs `unreal`, imported lazily; nothing here runs at import time):
  probe, editor_world, console, cvar_value, apply_cvars, restore_cvars, level_actors,
  get_or_spawn_ppv, set_pp, read_pp, apply_exposure, apply_look, set_cine_camera_exposure,
  spawn_light, set_light_physical, set_lighting_channels, set_emissive_light_source, collect_lights,
  collect_ppvs, collect_rooms, collect_mesh_bounds, collect_emissive_meshes, collect_masked_casters,
  collect_glass_materials, build_exterior_rig, view_from, set_mi_scalar, spawn_calibrator,
  queue_mrg_still, lighting_manifest, log_mark, log_since

Conventions: distances in cm (Unreal), illuminance in lux, luminance in cd/m2, exposure in EV100.
Tags on actors carry the lighter's intent: "role:<key|fill|rim|practical|neon|opening|still_only>",
"fixture:<name in FIXTURES>", "flicker", "room:<name>". Sources: expert and doc notes in
notes/lighting, notes/rendering, notes/post-process; `[added]` marks this toolkit's own rules.
"""
from __future__ import annotations

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import colorsys
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

try:  # numpy is optional for the photometry and lint layers, required for frames
    import numpy as np
except Exception:  # pragma: no cover
    np = None

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLKIT = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-unreal-expert", "scripts"))


def _review():
    """scenario-unreal-expert's ue_review module (shared toolkit), or None when it is not installed."""
    if TOOLKIT not in sys.path and os.path.isdir(TOOLKIT):
        sys.path.append(TOOLKIT)
    try:
        import ue_review  # noqa: F401
        return ue_review
    except Exception:
        return None


# --------------------------------------------------------------------------------------------------
# Photometry and exposure (pure)
# --------------------------------------------------------------------------------------------------
UNITLESS_PER_CANDELA = 625.0  # 1 cd = 625 unitless (exposure doc, Physical Lighting Units)
MID_GREY = 0.18  # auto exposure maps the metered average to 18 percent (exposure doc); probe P0b checks it
F_STOPS = [1.0, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5, 2.8, 3.2, 3.5, 4.0, 4.5, 5.0, 5.6, 6.3, 7.1,
           8.0, 9.0, 10.0, 11.0, 13.0, 14.0, 16.0, 18.0, 20.0, 22.0]
ISO_STEPS = [50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000,
             2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800, 16000, 20000, 25600]


def lumens_per_candela(kind, outer_cone_deg=44.0):
    """Lumens emitted per candela: point 4*pi, spot 2*pi*(1 - cos(half angle)), rect pi.

    Exposure doc: point 1 cd = 12.6 lm, rect 1 cd = 3.14 lm, spot at the default 44 degree cone
    1 cd = 1.76 lm; a spot in lumens gets brighter when its cone narrows, candela ignores the cone.
    """
    kind = kind.lower().replace("light", "")
    if kind == "point":
        return 4.0 * math.pi
    if kind == "spot":
        return 2.0 * math.pi * (1.0 - math.cos(math.radians(outer_cone_deg)))
    if kind == "rect":
        return math.pi
    raise ValueError("kind must be point, spot or rect, got %r" % kind)


def lumens_to_candela(lumens, kind, outer_cone_deg=44.0):
    return lumens / lumens_per_candela(kind, outer_cone_deg)


def candela_to_lumens(candela, kind, outer_cone_deg=44.0):
    return candela * lumens_per_candela(kind, outer_cone_deg)


def to_candela(value, units, kind, outer_cone_deg=44.0):
    units = (units or "").lower()
    if units.startswith("cand"):
        return value
    if units.startswith("lum"):
        return lumens_to_candela(value, kind, outer_cone_deg)
    if units.startswith("unit"):
        return value / UNITLESS_PER_CANDELA
    raise ValueError("units must be lumens, candelas or unitless, got %r" % units)


def to_unitless(value, units, kind, outer_cone_deg=44.0):
    return to_candela(value, units, kind, outer_cone_deg) * UNITLESS_PER_CANDELA


def from_unitless(unitless, units, kind, outer_cone_deg=44.0):
    cd = unitless / UNITLESS_PER_CANDELA
    if units.lower().startswith("cand"):
        return cd
    return candela_to_lumens(cd, kind, outer_cone_deg)


def ev100_from_camera(aperture, shutter_s, iso):
    """EV100 = log2(N^2 / t * 100 / ISO) (exposure doc, Manual Algorithm)."""
    return math.log2(aperture ** 2 / shutter_s * 100.0 / iso)


def exposure_scale(ev100, comp=0.0):
    """Exposure = 1 / 2^(EV100 + Exposure Compensation) (exposure doc)."""
    return 1.0 / (2.0 ** (ev100 + comp))


def pixel_from_luminance(luminance_cdm2, ev100, comp=0.0):
    """Pixel value before the tonemapper: B = Exposure * L (exposure doc)."""
    return luminance_cdm2 * exposure_scale(ev100, comp)


def luminance_from_pixel(pixel, ev100, comp=0.0):
    """Scene luminance (cd/m2) from a linear, tone-curve-disabled pixel rendered at a known exposure."""
    return pixel / exposure_scale(ev100, comp)


def ev100_for_luminance(luminance_cdm2, mid=MID_GREY):
    """EV100 at which a surface of this luminance lands on mid grey under B = L / 2^EV100 [added]."""
    return math.log2(max(luminance_cdm2, 1e-12) / mid)


def ev100_for_illuminance(lux, albedo=MID_GREY, mid=MID_GREY):
    """EV100 that puts a diffuse surface of `albedo` lit by `lux` on mid grey (L = albedo*E/pi) [added]."""
    return ev100_for_luminance(albedo * lux / math.pi, mid)


def _nearest(value, steps):
    return min(steps, key=lambda s: abs(math.log2(s) - math.log2(value)))


def camera_for_ev100(ev100, shutter_s=1.0 / 48.0, iso=None, aperture=None, snap=True):
    """Camera triple for a target EV100. Aperture belongs to depth of field (scenario-unreal-cinematics): when
    it is given, ISO is solved; otherwise ISO defaults to 800 and the aperture is solved.
    Default shutter 1/48 s is a 180 degree shutter at 24 fps [added]."""
    if aperture is None:
        iso = 800 if iso is None else iso
        n = math.sqrt(shutter_s * 2.0 ** ev100 * iso / 100.0)
        aperture = _nearest(n, F_STOPS) if snap else n
    elif iso is None:
        iso_exact = aperture ** 2 / shutter_s * 100.0 / 2.0 ** ev100
        iso = _nearest(iso_exact, ISO_STEPS) if snap else iso_exact
    ev = ev100_from_camera(aperture, shutter_s, iso)
    return {"aperture": aperture, "shutter_s": shutter_s, "shutter_1_over": round(1.0 / shutter_s, 3),
            "iso": iso, "ev100": ev, "target_ev100": ev100, "error_stops": ev - ev100}


def emissive_for_stops(ev100, stops=4.0, comp=0.0, mid=MID_GREY):
    """Emissive luminance that reads `stops` above mid grey at this exposure [added]. Set emissive only
    after exposure is calibrated (Gobey nlbJwMoj1Dg [00:02:38]); probe P0b checks that emissive 1.0
    renders B = 1.0 at manual EV100 0."""
    return mid * 2.0 ** (ev100 + comp + stops)


def rect_candela_from_luminance(luminance_cdm2, width_cm, height_cm, fill=1.0):
    """Peak intensity of a Lambertian rectangle: I = L * area (m2) * fill [added physics]. Use it to
    size an opening fill from the measured sky luminance, or a sign light from the tube luminance
    (fill = tube area / sign area)."""
    return luminance_cdm2 * (width_cm / 100.0) * (height_cm / 100.0) * fill


def illuminance_at(candela, distance_cm, cos_incidence=1.0):
    d = distance_cm / 100.0
    return candela * cos_incidence / (d * d)


def tight_attenuation_radius(candela, ev100, stops_below_mid=6.0, comp=0.0):
    """Radius (cm) beyond which the light lifts an 18 percent surface less than `stops_below_mid` under
    mid grey at this exposure [added]. Argyriou: the smallest attenuation radius is the strongest
    performance setting (Q1whHlGJB_o [00:26:32]); MegaLights: tight bounds cut noise (doc)."""
    e_min = math.pi * 2.0 ** (ev100 + comp - stops_below_mid)
    return 100.0 * math.sqrt(max(candela, 0.0) / e_min)


def hsv_linear(h_deg, s, v):
    """Linear RGB from the colour picker's HSV (Faucher's moon: 214, 0.34, 1.0 gives about A9CFFF)."""
    return colorsys.hsv_to_rgb((h_deg % 360.0) / 360.0, s, v)


# --------------------------------------------------------------------------------------------------
# Reference tables (pure). Values are look targets and starting points, not meter truths.
# --------------------------------------------------------------------------------------------------
CONDITIONS = {
    "sunlit": {"ev100": 14.0, "lux": 100000.0, "src": "Gobey chart nlbJwMoj1Dg [00:12:02]; Epic sky doc 120,000 lux at zenith"},
    "cloudy": {"ev100": 10.0, "lux": 20000.0, "src": "Gobey chart [00:12:02]; 5,000 to 20,000 lux [00:20:48]"},
    "low_sun": {"ev100": 7.0, "lux": 5000.0, "src": "Gobey chart [00:12:02]"},
    "blue_hour": {"ev100": 6.5, "ev_range": (6.0, 7.0), "lux": None,
                  "src": "[added] between the chart's low sun (7) and interior (4); confirm with the HDR meter"},
    "interior": {"ev100": 4.0, "lux": None, "src": "Gobey chart [00:12:02]"},
    "moonlit": {"ev100": 1.0, "lux": 0.5, "src": "Gobey chart [00:12:02]; Epic moon 0.26 lux at zenith"},
    "moonless": {"ev100": -2.0, "lux": 0.001, "src": "Gobey chart [00:12:02]"},
}

FIXTURES = {  # lumens, kelvin; ranges as (low, high)
    "candle": {"lumens": 12.0, "kelvin": 1900.0, "src": "Gobey chart [00:12:02]"},
    "decorative": {"lumens": 300.0, "kelvin": 3000.0, "src": "Gobey chart [00:12:02]"},
    "interior": {"lumens": 1000.0, "kelvin": 3000.0, "src": "Gobey chart [00:12:02]"},
    "exterior": {"lumens": 10000.0, "kelvin": None, "src": "Gobey chart [00:12:02]"},
    "street_small": {"lumens": 2500.0, "kelvin": None, "src": "Argyriou Q1whHlGJB_o [00:13:36]"},
    "street_big": {"lumens": 10000.0, "kelvin": None, "src": "Argyriou Q1whHlGJB_o [00:13:36]"},
    "pendant": {"lumens": (300.0, 1000.0), "kelvin": (2700.0, 3000.0),
                "src": "[added] chart's decorative to interior light, incandescent colour"},
    "fire": {"lumens": 1000.0, "kelvin": 1900.0, "src": "Gobey demo fire bowls [00:13:53]"},
}

KELVIN = {"candle": 1900, "incandescent": 3000, "fluorescent": 4000, "sun_direct": 5500, "cloudy": 6500,
          "shade": 8000, "blue_sky": 15000, "moonlight": 4000}  # Gobey chart; moon 4,000 K Faucher 1LfiYtKDsac [00:02:10]

SKY = {"sun_zenith_lux": 120000.0, "sun_angle_deg": 0.545, "moon_zenith_lux": 0.26, "moon_angle_deg": 0.568,
       "moon_hsv": (214.0, 0.34, 1.0), "src": "Epic sky doc (Additional Notes); moon colour Faucher [00:18:17]"}

BUDGETS = {  # documented numbers only; everything else is a project decision handed to scenario-unreal-performance
    "lumen_ms_60fps": 4.0, "lumen_ms_30fps": 8.0,  # Lumen GI + reflections, 1080p internal, console (Lumen doc)
    "rt_instances_max": 100000,  # HWRT scene after culling, consoles (Lumen performance guide)
    "megalights_ms_extreme_ref": 5.5,  # 900+ lights, PS5, 1080p, async off (SIGGRAPH 2025 [00:39:13]); an upper bound
}

THRESHOLDS = {  # all [added] unless noted: calibrate on an approved frame, then keep per project
    "exposure_tolerance_stops": 1.0,
    "grey_card_tolerance_stops": 0.33,
    "ground_truth_warn_stops": 0.5,
    "ground_truth_fail_stops": 1.0,  # Faucher: a big Lumen vs path tracer gap is a setup problem (0GYyHDuaPcg [00:07:43])
    "clip_display": 0.99,
    "crush_display": 0.02,
    "linear_white": 16.0,
    "linear_crush": MID_GREY * 2.0 ** -6,
    "crushed_frac_playable": 0.05,  # Argyriou: no pitch-black areas in play spaces (Q1whHlGJB_o [00:30:14])
    "clipped_frac_subject": 0.005,
    "neon_sat_min": 0.25,
    "neon_hue_keep_frac": 0.30,
    "warm_cool_min": 0.30,  # log2(R/B) practical minus ambient (Faucher teal and orange 1LfiYtKDsac [00:19:33])
    "hue_contrast_pass_deg": 90.0,  # Oakley: focal object on the opposite side of the wheel (rX0wZZxpB-U [00:09:19])
    "hue_contrast_warn_deg": 60.0,
    "shadow_shape_min_std_stops": 0.25,  # Oakley: the ambient must have shape (rX0wZZxpB-U [00:07:34])
    "flicker_max_stops": 0.03,
    "uniform_std": 1e-3,
    "attenuation_oversize_factor": 2.0,
    "room_margin": 1.25,
    "cluster_radius_cm": 100.0,  # MegaLights doc: merge clusters into one area light
    "cluster_min_count": 3,
    "fixture_radius_cm": 50.0,
    "plausible_band": 4.0,  # factor around a fixture's lumens
    "vsm_lights_under_megalights_max": 3,  # MegaLights doc: VSM per light "sparingly"
    "tight_radius_stops_below_mid": 6.0,
    "albedo_max_path_traced": 0.8,  # path tracer doc (Limitations); Faucher X5zVhc5ahl0 [00:22:24]
    "albedo_max_lumen": 0.9,  # Faucher 1e6oOiKh91U [00:13:35]: never 1.0, snow 0.8 to 0.9
    "albedo_min": 0.02,  # [added] lower bound from the physical digest checklist
    "albedo_high_frac_max": 0.01,  # [added] share of base-colour pixels allowed above the limit
    "albedo_low_frac_max": 0.05,  # [added]
    "specular_peak_stops": 1.5,  # [added] a highlight sits this far above the region median
    "specular_min_frac": 0.002,  # [added] share of a glossy region that must hold a highlight
    "source_shape_ratio": 2.0,  # [added] light source size vs fixture size, either way
    "room_shell_cover": 0.9,  # [added] one mesh spanning this share of a room on every axis = single-mesh shell
    "scattering_into_light": 0.9,  # Faucher 1LfiYtKDsac [00:16:06]; sky doc (Common Questions)
    "scattering_side": 0.0,  # same sources: shafts seen from the side
    "scattering_info_delta": 0.3,  # [added] gap that earns an info note (art direction decides)
    "lumen_emissive_boost": (5.0, 10.0),  # Campbell BKaAzhMHJZ0 [00:14:09]: visible about 1, Lumen scene 5 to 10
}

# Console names for representation views. Enable list, disable list. [verify] every name in the probe.
VIEW_MODES = {
    "lit": (["viewmode lit"], []),
    "lighting_only": (["viewmode lightingonly"], ["viewmode lit"]),
    "hdr": (["ShowFlag.VisualizeHDR 1"], ["ShowFlag.VisualizeHDR 0"]),  # HDR (Eye Adaptation) meter
    "hdr_range": (["r.EyeAdaptation.VisualizeDebugType 1"], ["r.EyeAdaptation.VisualizeDebugType 0"]),
    "local_exposure": (["ShowFlag.VisualizeLocalExposure 1"], ["ShowFlag.VisualizeLocalExposure 0"]),
    "lumen_overview": (["r.Lumen.Visualize 1"], ["r.Lumen.Visualize 0"]),
    "lumen_performance": (["r.Lumen.Visualize 2"], ["r.Lumen.Visualize 0"]),  # 5.4 notes
    "lumen_cards": (["r.Lumen.Visualize.CardPlacement 1"], ["r.Lumen.Visualize.CardPlacement 0"]),
    "mesh_distance_fields": (["ShowFlag.VisualizeMeshDistanceFields 1"], ["ShowFlag.VisualizeMeshDistanceFields 0"]),
    "megalights": (["r.MegaLights.Visualize 1"], ["r.MegaLights.Visualize 0"]),
    "megalights_raw_rt_shadows": (["ShowFlag.MegaLightsScreenTraces 0"], ["ShowFlag.MegaLightsScreenTraces 1"]),
    "megalights_complexity_dump": (["r.MegaLights.Visualize.LightComplexity.Freeze 1",
                                    "r.MegaLights.Visualize.LightComplexity.Dump"],
                                   ["r.MegaLights.Visualize.LightComplexity.Freeze 0"]),
    "vsm_cache": (["r.Shadow.Virtual.Visualize cache", "ShowFlag.VisualizeVirtualShadowMap 1"],
                  ["ShowFlag.VisualizeVirtualShadowMap 0"]),
    "vsm_casters": (["ShowFlag.VisualizeShadowCasters 1"], ["ShowFlag.VisualizeShadowCasters 0"]),
    "vsm_stats": (["r.ShaderPrintEnable 1", "r.Shadow.Virtual.ShowStats 2"], ["r.Shadow.Virtual.ShowStats 0"]),
    "sky_atmosphere": (["ShowFlag.VisualizeSkyAtmosphere 1"], ["ShowFlag.VisualizeSkyAtmosphere 0"]),
    "color_grading": (["ShowFlag.VisualizeColorGrading 1"], ["ShowFlag.VisualizeColorGrading 0"]),  # 5.8
    "post_stack": (["ShowFlag.VisualizePostProcessStack 1"], ["ShowFlag.VisualizePostProcessStack 0"]),  # 5.8, with r.PostProcessing.Debug.Property <name>
    "light_complexity": (["viewmode lightcomplexity"], ["viewmode lit"]),
    "stationary_overlap": (["viewmode stationarylightoverlap"], ["viewmode lit"]),
    "path_tracing": (["viewmode pathtracing", "r.PathTracing.ProgressDisplay 1"], ["viewmode lit"]),
    # Buffer Visualization > Base Color, for albedo_check (display-encoded screenshot) [verify both names]
    "base_color": (["viewmode VisualizeBuffer", "r.BufferVisualizationTarget BaseColor"], ["viewmode lit"]),
}

# Cvar presets: few entries, each with its reason. "device_profile" lines go to <Platform>DeviceProfiles.ini.
CVAR_PRESETS = {
    "gameplay_60_console": {
        "device_profile": {"sg.GlobalIlluminationQuality": ("2", "Lumen High = 60 fps console target (Lumen doc, Scalability Settings)"),
                           "sg.ReflectionQuality": ("2", "same (Lumen doc)")},
        "cvars": {"r.Lumen.Reflections.MaxRoughnessToTraceForFoliage": ("0", "foliage reflections are hard to see: a large win (Lumen doc, Tips)")},
        "notes": "MegaLights samples and downsample stay at engine defaults for gameplay (MegaLights doc). Measure before adding anything.",
    },
    "gameplay_30_console": {
        "device_profile": {"sg.GlobalIlluminationQuality": ("3", "Epic = 30 fps console (Lumen doc)"),
                           "sg.ReflectionQuality": ("3", "same")},
        "cvars": {},
        "notes": "about 8 ms Lumen at 1080p internal (Lumen doc)",
    },
    "gameplay_medium_lumen_lite": {
        "device_profile": {"sg.GlobalIlluminationQuality": ("1", "Lumen Lite, Irradiance Field Gather, about 2x faster than High (5.8 Beta)"),
                           "sg.ReflectionQuality": ("1", "SSR plus rough specular from GI (Lumen doc, Lumen Lite)")},
        "cvars": {},
        "notes": "handhelds, Switch 2, medium PC; keeps one look (each level about half the cost of the one above)",
    },
    "measure": {
        "device_profile": {},
        "cvars": {"r.RDG.AsyncCompute": ("0", "isolate pass timings; ship with async on (Lumen, VSM and MegaLights docs)"),
                  "r.DynamicRes.OperationMode": ("0", "dynamic resolution hides the truth (Campbell BKaAzhMHJZ0 [00:38:37]) [verify name]")},
        "commands": ["stat unit", "stat gpu", "ProfileGPU", "stat SceneRendering"],
        "notes": "turn every visualization off first; re-measure with async compute on for the real frame total",
    },
    "still_deferred": {
        "device_profile": {}, "cvars": {},
        "notes": "zero cvars: the render already runs Cinematic scalability through Global Game Overrides; add CVAR_FIXES only for a named problem (Faucher fVg5ihB8Wdc [00:03:00]; Comly, demystifying-mrq)",
    },
    "still_path_traced": {
        "device_profile": {}, "cvars": {},
        "notes": "path tracer quality is the sample count; light, Lumen and ray tracing settings have no effect (demystifying-mrq)",
    },
}

CVAR_FIXES = {  # named problem -> cvars (value None = tune after a test render). Sources in the reason strings.
    "vsm_close_up_resolution": {"r.Shadow.Virtual.ResolutionLodBiasDirectional": ("-1", "-1 doubles resolution (VSM doc, Clipmaps)")},
    "vsm_shallow_dof": {"r.Shadow.Virtual.MaxDOFResolutionBias": (None, "lower shadow resolution out of focus (VSM doc, Depth of Field)")},
    "megalights_noise_offline": {"r.MegaLights.Reference.NumShadingPass": (None, "reference mode for offline quality (MegaLights doc) [verify range]")},
    "nanite_proxy_in_rt": {"r.RayTracing.Nanite.Mode": ("1", "full-detail BVH, offline only: large cost, hitches (MegaLights doc; path tracer doc)")},
    "sky_cloud_cinematic": {
        "r.VolumetricRenderTarget": ("0", "full-quality cloud tracing (sky doc, Achieving Cinematic Quality)"),
        "r.VolumetricCloud.HighQualityAerialPerspective": ("1", "sky doc cinematic recipe"),
        "r.SkyAtmosphere.FastSkyLUT": ("0", "sky doc cinematic recipe"),
        "r.SkyAtmosphere.AerialPerspectiveLUT.FastApplyOnOpaque": ("0", "sky doc cinematic recipe"),
    },
    "pt_instances_missing": {"r.RayTracing.Geometry.InstancedStaticMeshes.Culling": ("0", "ray tracing culling too aggressive for camera rays (path tracer doc, FAQ)")},
    "pt_show_sky_cubemap": {"r.PathTracing.VisibleLights": ("2", "Sky Light with a specified cubemap visible to camera rays, the HDRIBackdrop replacement; no effect under Reference Atmosphere, which ignores any Sky Light (path tracer doc)")},
    "pt_emissive_double_count_test": {"r.PathTracing.EnableEmissive": ("0", "debug only: A/B for fixtures with emissive plus a real light (path tracer doc)")},
    "hidden_actor_in_lumen_reflections": {"r.Lumen.ScreenProbeGather.ScreenTraces": ("0", "Affect Indirect While Hidden needs screen traces off (Comly 8o2yaZzfHCA [00:19:38]) [verify name]"),
                                          "r.Lumen.Reflections.ScreenTraces": ("0", "same [verify name]")},
    "sun_steals_megalights_samples": {"r.MegaLights.DirectionalLightSampleFraction": (None, "5.7+, cap the sun's share indoors [verify default]")},
    "megalights_alpha_masked_shadows": {"r.MegaLights.HardwareRayTracing.EvaluateMaterialMode": ("1", "alpha masks in RT shadows at non-trivial cost; better avoid masked casters (MegaLights doc)")},
    "reflections_budget": {"r.Lumen.Reflections.Allow": ("0", "SSR instead of Lumen reflections, 1 ms on Series S (Lumen doc, Tips); device profile only")},
}

DEPRECATED_CVARS = {
    "r.Lumen.CachedLightingPreExposure": "r.EyeAdaptation.CachedLightingPreExposure (5.8, default 4)",
    "r.SkyLight.RealTimeReflectionCapture.PreExposure": "r.EyeAdaptation.CachedLightingPreExposure (5.8)",
    "r.Lumen.Supported.SM5": "removed in 5.8",
    "r.Lumen.HardwareRayTracing.SurfaceCacheAlphaMasking": "removed in 5.8",
    "r.MegaLights.DownsampleFactor": "r.MegaLights.DownsampleMode (5.7)",
    "r.MegaLights.DownsampleCheckerboard": "r.MegaLights.DownsampleMode (5.7)",
    "r.MegaLights.Volume.Debug": "r.MegaLights.Debug (5.8)",
    "r.Shadow.Virtual.ForceOnlyVirtualShadowMaps": "deprecated, no replacement (unsupported geometry casts no shadow)",
    "r.MinScreenRadiusForCSMDepth": "r.Shadow.RadiusThreshold (5.5)",
    "r.UseClusteredDeferredShading": "deprecated (5.7)",
    "r.EyeAdaptation.Focus": "Exposure Metering Mask (removed in 4.25)",
    "r.PathTracing.EnableBackfaceCulling": "removed in 5.8, culling always on: make the material two-sided [cvar name inferred]",
    "r.PathTracing.HeterogeneousVolumes": "removed in 5.4",
    "r.SSGI.Enable": "SSGI deprecated in 5.8: Lumen GI or Lumen Lite [cvar name added]",
    "r.RayTracing.GlobalIllumination": "Ray Tracing GI removed in 5.4 [cvar name added]",
    "r.RayTracing.Reflections": "Ray Tracing Reflections deprecated: Lumen reflections, hit lighting [cvar name added]",
    "r.TemporalAA.NumSamples": "the 5.8 doc names r.TemporalAASamples [verify which exists]",
}
DEPRECATED_VALUES = {"r.Lumen.TraceMeshSDFs": ("1", "detail tracing deprecated in 5.6, default 0 in 5.7: use global tracing or HWRT")}
CARGO_CULT_CVARS = {"r.MotionBlurQuality", "r.BloomQuality", "r.ShadowQuality"}  # Faucher's examples of pasted quality cvars [00:03:00]

SHADOW_LIFT_LADDER = [  # honest to dishonest (Faucher 0GYyHDuaPcg [00:08:14] [00:13:42]; Gobey nlbJwMoj1Dg [00:15:32])
    ("more_direct_light", "add or strengthen a motivated direct source (an opening rect, a practical)", "physical"),
    ("tone_mapper_toe", "Film Toe 0.55 -> 0.3, project-wide PPV only (Gobey [00:14:58]; doc: Film is project-wide)", "camera side"),
    ("local_exposure_shadows", "Local Exposure Shadow Contrast 0.8 -> 0.6 (Gobey [00:15:32]; doc: 0.6 to 1)", "camera side"),
    ("indirect_lighting_intensity", "one light's Indirect Lighting Intensity above 1 (Faucher used 5): view-dependent GI, not in the path tracer", "cheat"),
    ("diffuse_color_boost", "PPV Lumen Diffuse Color Boost 2 (Faucher [00:13:42]): breaks physicality", "cheat"),
    ("global_exposure", "global exposure brightens everything: last resort", "last"),
]

NOISE_TRIAGE = [  # symptom -> owner (demystifying-mrq; Faucher fVg5ihB8Wdc [00:09:47]; MegaLights doc; path tracer doc)
    ("grain in soft shadows, deferred", "that light's shadow quality; under MegaLights: bounds, hidden lights, the sun's share, Light Complexity"),
    ("noise in reflections, GI, AO", "PPV Lumen quality (Final Gather, Scene Lighting, Reflection Quality) or hit lighting, never MRG samples"),
    ("large low-frequency blotches", "a denoiser: find which one, disable only that one, raise its samples"),
    ("popping or flicker", "Lumen scene, distance fields, warm-up; 5.6 Rebuild Lumen Scene Between Render Layers; 5.8 layer warm-ups"),
    ("path tracer grain", "samples first, then the denoiser choice; fireflies: find the small bright emitter, keep Max Path Intensity default"),
    ("jaggies on thin bright edges", "AA None with odd samples, or tame the emissive (Karis in demystifying-mrq)"),
    ("MegaLights noise or ghosting under motion", "per-pixel light complexity: merge small lights, tighten radius and cones, remove hidden lights, keep the sun out"),
]

RENDER_DIFF_TRIAGE = [  # a Movie Render Graph frame differs from the viewport: suspects in this order
    ("global_game_overrides", "first suspect: it raises quality at render time; in MRG it acts only while the node is connected, in legacy MRQ configs it acts even when absent. Disconnect or disable it to test (MRG doc, Globals; Comly demystifying-mrq, CVARS; Faucher fVg5ihB8Wdc [00:03:33])"),
    ("cvars", "Set CVar and preset nodes, the job's console_variable_overrides (applied after graph nodes), Start Console Commands: remove all, re-add one per named problem (demystifying-mrq, CVARS; scripting doc)"),
    ("use_lod_zero", "Use LODZero also forces foliage LOD 0; past foliage.MaxTrianglesToRender no foliage renders at all (MRG doc, Game Overrides)"),
    ("warm_up", "Lumen not converged: warm-up frames, 5.6 Rebuild Lumen Scene Between Render Layers, 5.8 layer warm-ups (MRG doc; Faucher 1e6oOiKh91U [00:09:56])"),
    ("exposure_path", "the viewport was judged under the EV100 override or not on Game Settings; the still carries its own PPV values on the CineCamera (Gobey nlbJwMoj1Dg [00:21:56]; exposure doc)"),
    ("renderer_features", "the path tracer ignores Lumen-only cheats (Indirect Lighting Intensity, Diffuse Color Boost, Ray Tracing Quality Switch emissive boosts): read cheat_inventory before calling it a bug (path tracer doc; Faucher 0GYyHDuaPcg [00:08:48])"),
]

GLASS_RECIPE = {  # path tracer doc (Basic Glass Material, Thin Translucency); Faucher X5zVhc5ahl0 [00:14:36] [00:15:43]
    "solid_path_traced": {"shading_model": "DefaultLit", "blend_mode": "Translucent", "lighting_mode": "Surface ForwardShading",
                          "refraction_method": "Index of Refraction", "ior": 1.5, "opacity_refractive_part": 0.0, "max_bounces_min": 8,
                          "why": "a Refraction Method other than IOR makes the path tracer use transparency: not a bounce, roughness ignored"},
    "thin": {"shading_model": "Thin Translucent", "output": "Thin Translucent Material",
             "why": "plastic wrap, bubbles, thin panes; IOR only splits reflect and transmit; coloured glass reads as plastic"},
    "gameplay": {"why": "keep glass cheap: plain translucent or a decal for grime instead of translucent geometry (Argyriou Q1whHlGJB_o [00:16:19]); front-layer translucency reflections only in a PPV around hero glass (MegaLights doc)"},
    "authoring": "material graph work: scenario-unreal-materials authors the masters once; this skill checks them with glass_lint",
}


# --------------------------------------------------------------------------------------------------
# Planning (pure)
# --------------------------------------------------------------------------------------------------
def exposure_plan(use="gameplay", conditions=("interior", "blue_hour"), subject=None, shutter_s=1.0 / 48.0,
                  iso=None, aperture=None, speed_up=3.0, speed_down=1.0):
    """Exposure as a camera decision (Gobey: remove the childproofing first).

    use="gameplay": histogram, Exposure Compensation 0, Min/Max EV100 bracketing the conditions the
    player walks between (Gobey 10/14 at noon); use="fixed": Min = Max (the doc: equal values disable
    auto exposure); use="camera": Manual + Apply Physical Camera Exposure with an ISO/shutter/aperture.
    """
    evs = []
    for c in conditions:
        cond = CONDITIONS[c] if isinstance(c, str) else c
        evs.append(float(cond["ev100"]))
    subject_ev = float(CONDITIONS[subject]["ev100"]) if isinstance(subject, str) else (
        float(subject) if subject is not None else evs[0])
    plan = {"use": use, "conditions": list(conditions), "bias": 0.0,
            "notes": ["Exposure Compensation 0 and clamped EV100 before any light is placed (Gobey [00:11:40])",
                      "viewport exposure on Game Settings, or screenshots bypass the PPV (Gobey [00:21:56])",
                      "5.8 prints an on-screen warning when exposure leaves Lumen's supported range: it must not appear"]}
    if use == "gameplay":
        lo, hi = min(evs), max(evs)
        plan.update(mode="histogram", min_ev100=lo, max_ev100=hi, histogram_min=lo - 4.0, histogram_max=hi + 4.0,
                    speed_up=speed_up, speed_down=speed_down, low_percent=75.0, high_percent=90.0)
        plan["notes"].append("histogram range [added]: tighten it around the range the HDR view shows (doc Tips)")
        plan["notes"].append("Low/High Percent 75/90 sit inside the doc's 70 to 80 and 80 to 95; Speed Up 3 above Speed Down 1 (Gobey frame [00:21:52]; exposure doc)")
        plan["notes"].append("walk the player path between the conditions (street to bar) and watch adaptation and the HDR view (Gobey [00:19:12])")
    elif use == "fixed":
        plan.update(mode="fixed", min_ev100=subject_ev, max_ev100=subject_ev)
    elif use == "camera":
        cam = camera_for_ev100(subject_ev, shutter_s=shutter_s, iso=iso, aperture=aperture)
        plan.update(mode="manual_physical", ev100=cam["ev100"], camera=cam)
    else:
        raise ValueError("use must be gameplay, fixed or camera")
    return plan


def pp_values_for_exposure(plan):
    """PostProcessSettings fields for an exposure plan (names [verify]). Enum values are 'enum:Type.NAME'."""
    v = {"auto_exposure_bias": float(plan.get("bias", 0.0))}
    mode = plan["mode"]
    if mode == "histogram":
        v.update(auto_exposure_method="enum:AutoExposureMethod.AEM_HISTOGRAM",
                 auto_exposure_min_brightness=plan["min_ev100"], auto_exposure_max_brightness=plan["max_ev100"],
                 histogram_log_min=plan["histogram_min"], histogram_log_max=plan["histogram_max"],
                 auto_exposure_speed_up=plan["speed_up"], auto_exposure_speed_down=plan["speed_down"],
                 auto_exposure_low_percent=plan["low_percent"], auto_exposure_high_percent=plan["high_percent"],
                 auto_exposure_apply_physical_camera_exposure=False)
    elif mode == "fixed":
        v.update(auto_exposure_method="enum:AutoExposureMethod.AEM_HISTOGRAM",
                 auto_exposure_min_brightness=plan["min_ev100"], auto_exposure_max_brightness=plan["max_ev100"],
                 auto_exposure_apply_physical_camera_exposure=False)
    elif mode == "manual_physical":
        cam = plan["camera"]
        v.update(auto_exposure_method="enum:AutoExposureMethod.AEM_MANUAL",
                 auto_exposure_apply_physical_camera_exposure=True,
                 camera_iso=float(cam["iso"]), camera_shutter_speed=float(cam["shutter_1_over"]),
                 depth_of_field_fstop=float(cam["aperture"]))
    return v


def look_values(dark_interior=False, lumen_gi=True):
    """Project-wide PPV look: Local Exposure is always set up with Lumen GI (doc); Film only here, never
    per shot (doc). With a dark interior under a correct exterior: Toe 0.3 and Shadow Contrast 0.6
    (Gobey) before any fill light. Under 5.8's ACES 2.0 SDR path the Film values may act differently
    [verify by screenshot]."""
    v = {}
    if lumen_gi:
        v.update(local_exposure_highlight_contrast_scale=0.8, local_exposure_shadow_contrast_scale=0.8,
                 local_exposure_detail_strength=1.0)
    if dark_interior:
        v.update(film_toe=0.3, local_exposure_shadow_contrast_scale=0.6)
    return v


def sun_rotator(elevation_deg, azimuth_deg):
    """Directional light rotator for a sun (or moon) at this elevation above the horizon and this compass
    azimuth (degrees, world +X = 0, +Y = 90). The light points from the sun to the scene [added math].
    Blue hour: the sun a few degrees below the horizon, e.g. elevation -4 [added]."""
    return {"pitch": -float(elevation_deg), "yaw": (float(azimuth_deg) + 180.0) % 360.0, "roll": 0.0}


def aim_rotator(src, dst):
    """Rotator whose forward (+X) points from src to dst (cm). Lights emit along +X."""
    dx, dy, dz = (dst[0] - src[0], dst[1] - src[1], dst[2] - src[2])
    yaw = math.degrees(math.atan2(dy, dx))
    pitch = math.degrees(math.atan2(dz, math.hypot(dx, dy)))
    return {"pitch": pitch, "yaw": yaw, "roll": 0.0}


def forward_from_rotator(rot):
    """Unit forward (+X) vector of a rotator dict (degrees). A light emits along it, so the direction
    from the scene toward a directional light is its negative."""
    p, y = math.radians(float(rot.get("pitch", 0.0))), math.radians(float(rot.get("yaw", 0.0)))
    return (math.cos(p) * math.cos(y), math.cos(p) * math.sin(y), math.sin(p))


def _unit(v):
    n = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / n for c in v)


def scattering_distribution_for(camera_forward, to_light):
    """Volumetric fog Scattering Distribution from the key camera's angle to the light: near 0.9 when
    the camera looks into the light, near 0 when the shafts are seen from the side (Faucher 1LfiYtKDsac
    [00:16:06]; sky doc, Common Questions). The linear blend on the cosine between those two documented
    ends is [added]; art direction decides the final value. to_light: from the subject toward the light
    (for a directional light, the negative of forward_from_rotator)."""
    c = sum(a * b for a, b in zip(_unit(camera_forward), _unit(to_light)))
    hi, lo = THRESHOLDS["scattering_into_light"], THRESHOLDS["scattering_side"]
    return round(max(lo, min(hi, lo + (hi - lo) * c)), 2)


_AXES = {"+X": (1, 0, 0), "-X": (-1, 0, 0), "+Y": (0, 1, 0), "-Y": (0, -1, 0), "+Z": (0, 0, 1), "-Z": (0, 0, -1)}


def opening_rect_light(opening_min, opening_max, inward="+X", room_depth_cm=800.0, sky_luminance=None,
                       color=(0.75, 0.85, 1.0), offset_cm=2.0):
    """Faucher's fake-the-opening rect light (0GYyHDuaPcg [00:06:18]): on the inner face of a door or
    window, facing in, Source Width/Height = the opening, barn doors 88 degrees and 20 cm, cool colour
    for skylight, attenuation about the room depth. Intensity from the measured sky luminance through
    the opening (cd/m2, from a linear render: L = B * 2^EV100) [added]; without it, None (measure first).
    Rect lights emit along +X; source width along local Y, height along local Z [verify]."""
    n = _AXES[inward]
    size = [opening_max[i] - opening_min[i] for i in range(3)]
    center = [(opening_max[i] + opening_min[i]) / 2.0 for i in range(3)]
    axis = [i for i in range(3) if n[i] != 0][0]
    inner = opening_max[axis] if n[axis] > 0 else opening_min[axis]
    center[axis] = inner + n[axis] * offset_cm
    rot = aim_rotator((0, 0, 0), n)
    if axis == 2:  # skylight in a ceiling or floor: width along world Y, height along world X [verify]
        width, height = size[1], size[0]
    else:
        lateral = 1 if axis == 0 else 0
        width, height = size[lateral], size[2]
    cd = rect_candela_from_luminance(sky_luminance, width, height) if sky_luminance else None
    return {"class": "RectLight", "location": tuple(center), "rotation": rot, "source_width": width,
            "source_height": height, "barn_door_angle": 88.0, "barn_door_length": 20.0,
            "attenuation_radius": float(room_depth_cm), "light_color": tuple(color),
            "intensity": cd, "intensity_units": "candelas" if cd else None, "tags": ["role:opening"],
            "why": "Lumen lacks samples for a small bright opening; raising sky light or exposure only gives splotches (Faucher [00:04:41])"}


def neon_sign_light(face_min, face_max, outward="+X", tube_length_cm=None, tube_diameter_cm=1.5,
                    tube_luminance=None, color=(1.0, 0.1, 0.6), gap_cm=5.0, ev100=None):
    """A real light for a neon sign: emissive is the look, the light does the lighting (Faucher
    1e6oOiKh91U [00:12:30]; Gobey Q&A [00:37:33]; SIGGRAPH MegaLights [00:04:06]). A rect fitted to
    the sign face, in front of it and not inside it (MegaLights doc). Intensity = tube luminance x tube
    area [added]; attenuation from tight_attenuation_radius when ev100 is known [added]."""
    n = _AXES[outward]
    axis = [i for i in range(3) if n[i] != 0][0]
    size = [face_max[i] - face_min[i] for i in range(3)]
    center = [(face_max[i] + face_min[i]) / 2.0 for i in range(3)]
    face = face_max[axis] if n[axis] > 0 else face_min[axis]
    center[axis] = face + n[axis] * gap_cm
    lateral = 1 if axis == 0 else 0
    width, height = size[lateral], size[2]
    cd = None
    if tube_luminance and tube_length_cm:
        cd = tube_luminance * (tube_length_cm / 100.0) * (tube_diameter_cm / 100.0)
    radius = tight_attenuation_radius(cd, ev100) if (cd and ev100 is not None) else 300.0
    return {"class": "RectLight", "location": tuple(center), "rotation": aim_rotator((0, 0, 0), n),
            "source_width": width, "source_height": height, "light_color": tuple(color),
            "intensity": cd, "intensity_units": "candelas" if cd else None, "attenuation_radius": radius,
            "volumetric_scattering_intensity": 0.0, "tags": ["role:neon"],
            "why": "set volumetric scattering above 1 for a halo only if the sign never flickers (sky doc: fast lights trail in fog; Faucher 1LfiYtKDsac [00:13:23])"}


def emissive_strategy(use="gameplay", small=True, lumen=True, path_traced_still=False, light_nearby=True):
    """How an emissive fixture (neon, bulb, screen) takes part in lighting, per renderer.

    Always: the emissive is the look and a real light does the lighting (Faucher 1e6oOiKh91U [00:12:30];
    Gobey Q&A nlbJwMoj1Dg [00:37:33]). Lumen: small emissive meshes are culled from the Lumen Scene, so
    set Emissive Light Source on the component (Lumen doc, troubleshooting); a Lumen-only boost through
    a Ray Tracing Quality Switch (visible about 1, Lumen scene 5 to 10) adds bounce without blow-out
    (Campbell BKaAzhMHJZ0 [00:14:09]), with fill lights as the fallback when still noisy or lacking
    specular [00:14:42]. Path tracer: it ignores the Ray Tracing Quality Switch (takes the Normal input),
    so the boost is invisible there; and a mesh emissive plus its own light double counts (path tracer
    doc, Emissive Materials; Lighting Components)."""
    lo, hi = THRESHOLDS["lumen_emissive_boost"]
    s = {"real_light": True, "emissive_light_source": bool(lumen and small),
         "lumen_boost": (lo, hi) if (lumen and use == "gameplay") else None,
         "path_tracer": None, "why": ["emissive is the look, a real light does the lighting"]}
    if s["emissive_light_source"]:
        s["why"].append("small emissive: Emissive Light Source keeps it in the Lumen Scene (Lumen doc)")
    if s["lumen_boost"]:
        s["why"].append("optional Lumen-only boost %g to %g through a Ray Tracing Quality Switch master from scenario-unreal-materials [verify node and HWRT/SWRT support]; list it in cheat_inventory" % (lo, hi))
    if path_traced_still:
        s["path_tracer"] = {"boost_visible": False,
                            "double_count_test": "r.PathTracing.EnableEmissive 0 (or PPV Emissive Materials off) as an A/B",
                            "indirect_emissive_off": bool(light_nearby)}
        s["why"].append("path tracer: the boost does not exist there; with a real light at the fixture, A/B Emissive Materials and turn off Indirect Emissive in Lighting Components")
    return s


def still_only_light_plan(target_labels, kind="rect", channel=1, intensity=None, units="candelas", **light):
    """A cheat light for one still (rim, fill, faked bounce) that must not touch the rest of the level:
    light on lighting channel `channel` only, target meshes on channels 0 and `channel` (Faucher
    1LfiYtKDsac [00:24:02]). Caveats: direct light honours channels and MegaLights supports them in
    5.8 (deltas file), but Lumen GI bounce probably does not [verify], so Indirect Lighting Intensity 0
    [added]; whether the path tracer honours channels is not in the notes [verify with an A/B render].
    Home: the shot's Level Sequence as a spawnable (scenario-unreal-cinematics), never the gameplay level."""
    ch = [False, False, False]
    ch[channel] = True
    mesh = [True, False, False]
    mesh[channel] = True
    plan = {"kind": kind, "intensity": intensity, "units": units, "lighting_channels": tuple(ch),
            "indirect_lighting_intensity": 0.0, "tags": ["role:still_only", "channel:%d" % channel],
            "targets": {lab: tuple(mesh) for lab in target_labels},
            "verify": ["Lumen GI bounce ignores lighting channels (probably)", "path tracer and lighting channels: A/B the still with this light hidden"],
            "home": "shot Level Sequence (spawnable), handed to scenario-unreal-cinematics"}
    plan.update(light)
    return plan


def exterior_rig_plan(condition="blue_hour", moon=False, sun_elevation=None, sun_azimuth=225.0,
                      volumetric_fog=True, clouds=False, atmosphere_drives_fog=True, art_moon_lux=None,
                      key_camera_forward=None, key_to_light=None):
    """Physically based exterior (Epic sky doc; Faucher night recipe translated to 5.8).
    Sun intensity stays at its zenith value with Atmosphere Sun Light on; the atmosphere does the dusk
    [verify with the HDR meter]. The moon is a second atmosphere light (index 1), 0.26 lux physical;
    film and gameplay readability push it brighter (Faucher 1LfiYtKDsac [00:01:37]; Argyriou; Oakley).
    key_camera_forward: the key camera's forward vector; the fog's Scattering Distribution then follows
    its angle to the light (scattering_distribution_for); key_to_light overrides the light direction
    (for example toward the brightest street lamp); default is the moon if present, else the sun."""
    if sun_elevation is None:
        sun_elevation = {"blue_hour": -4.0, "low_sun": 8.0, "sunlit": 55.0, "cloudy": 40.0,
                         "moonlit": -20.0, "moonless": -20.0}.get(condition, 30.0)
    lights = [{"class": "DirectionalLight", "label": "Sun", "rotation": sun_rotator(sun_elevation, sun_azimuth),
               "intensity": SKY["sun_zenith_lux"], "light_source_angle": SKY["sun_angle_deg"],
               "atmosphere_sun_light": True, "atmosphere_sun_light_index": 0, "mobility": "movable",
               "shadow": "vsm", "allow_mega_lights": False,
               "why": "strong directional stays on deferred + VSM, out of MegaLights (MegaLights doc)"}]
    if moon:
        lux = art_moon_lux if art_moon_lux else SKY["moon_zenith_lux"]
        lights.append({"class": "DirectionalLight", "label": "Moon", "rotation": sun_rotator(35.0, sun_azimuth + 150.0),
                       "intensity": lux, "light_source_angle": SKY["moon_angle_deg"], "atmosphere_sun_light": True,
                       "atmosphere_sun_light_index": 1, "light_color": hsv_linear(*SKY["moon_hsv"]),
                       "volumetric_scattering_intensity": 3.0, "mobility": "movable", "shadow": "vsm",
                       "why": "moon = rim first (Faucher [00:09:23]); multi-scattering not evaluated for light 1 (sky doc)"})
    fog = {"class": "ExponentialHeightFog", "enable_volumetric_fog": volumetric_fog, "fog_density": 0.02,
           "fog_height_falloff": 0.2, "volumetric_fog_scattering_distribution": 0.2}
    if atmosphere_drives_fog:
        fog.update(fog_inscattering_luminance=(0.0, 0.0, 0.0), directional_inscattering_luminance=(0.0, 0.0, 0.0),
                   needs_project_setting="Support Sky Atmosphere Affecting Height Fog")
    if key_camera_forward is not None:
        to_light = key_to_light or tuple(-c for c in forward_from_rotator(lights[-1]["rotation"]))
        fog["volumetric_fog_scattering_distribution"] = scattering_distribution_for(key_camera_forward, to_light)
    rig = {"condition": condition, "lights": lights,
           "sky_light": {"class": "SkyLight", "real_time_capture": True, "mobility": "movable",
                         "lower_hemisphere_is_black": False},
           "sky_atmosphere": {"class": "SkyAtmosphere"}, "fog": fog,
           "clouds": {"class": "VolumetricCloud"} if clouds else None,
           "exposure": exposure_plan("fixed", (condition,), subject=condition)}
    return rig


def still_plan(renderer="path_traced", quality="final", delivery="direct", motion_blur=False, glass=False,
               sky_atmosphere_visible=False, thin_bright=False, light_modifiers=False, emissive_fixtures=False):
    """Movie Render Graph settings for a still or a shot, by rule.

    Path tracer: stills all spatial, 1 temporal; animation 1 spatial, many temporal, Reference Motion
    Blur (path tracer doc). Deferred: never mix sample types; odd counts (Frame Center shutter); AA None
    above about 8 samples; spatial only with Motion Blur Amount 0 for a still (demystifying-mrq; Faucher
    fVg5ihB8Wdc [00:04:58] [00:06:01] [00:06:46] [00:10:24]; MRG doc). Counts are starting points [added]
    within the experts' ranges (Faucher: 9 to 15 temporal start, 15 to 31 covers 95 percent)."""
    why = []
    plan = {"renderer": renderer, "quality": quality, "delivery": delivery, "motion_blur": motion_blur,
            "output": {"format": "exr", "bit_depth": 16, "compression": "PIZ",
                       "disable_tone_curve": delivery in ("graded", "comp"), "preview_png": True},
            "ppv": {}, "cvars": {}, "game_overrides": "connected", "why": why}
    if renderer == "path_traced":
        base = {"preview": 64, "draft": 256, "final": 1024}[quality]
        if delivery == "comp" and quality == "final":
            base = 4096
            why.append("denoiser off for comp: quality comes from samples (Faucher X5zVhc5ahl0 [00:25:09])")
        if motion_blur:
            plan.update(spatial_samples=1, temporal_samples=max(base // 4, 16) | 1, reference_motion_blur=True,
                        denoiser="nfor" if delivery != "comp" else "off", aa="none")
            why.append("animation: 1 spatial, many temporal, Reference Motion Blur (path tracer doc)")
        else:
            plan.update(spatial_samples=base, temporal_samples=1, reference_motion_blur=False,
                        denoiser="nne" if delivery != "comp" else "off", aa="none")
            why.append("still: all spatial, 1 temporal (path tracer doc); PPV samples are ignored by MRG")
        plan["warm_up_frames"] = 0
        plan["ppv"] = {"path_tracing_max_bounces": 10 if glass else None,
                       "path_tracing_enable_reference_atmosphere": bool(sky_atmosphere_visible),
                       "path_tracing_max_path_intensity": None}
        if glass:
            why.append("glass needs bounces: 10 in Faucher's scene (X5zVhc5ahl0 [00:16:47])")
        if sky_atmosphere_visible:
            why.append("Reference Atmosphere: Sky Atmosphere Transform Mode Planet Top at Component Transform, moved below the scene; any Sky Light is then ignored, so r.PathTracing.VisibleLights does nothing (path tracer doc)")
        if emissive_fixtures:
            plan["ppv"]["path_tracing_include_indirect_emissive"] = False
            why.append("emissive fixtures carry a real light: Indirect Emissive off in Lighting Components, the tubes stay visible (path tracer doc); it is global, so every emissive loses its bounce: A/B with r.PathTracing.EnableEmissive 0 first")
        why.append("Max Path Intensity stays default: it is relative to exposure (path tracer doc)")
    elif renderer == "deferred":
        if motion_blur:
            ts = {"preview": 1, "draft": 9, "final": 15}[quality]
            plan.update(spatial_samples=1, temporal_samples=ts, motion_blur_amount=None)
            why.append("motion blur: temporal samples only (Faucher [00:04:58])")
        else:
            ss = {"preview": 1, "draft": 9, "final": 31 if thin_bright else 15}[quality]
            plan.update(spatial_samples=ss, temporal_samples=1, motion_blur_amount=0.0)
            why.append("still: spatial only with Motion Blur Amount 0 (Faucher [00:06:46])")
        total = plan["spatial_samples"] * plan["temporal_samples"]
        plan["aa"] = "none" if total > 8 else "tsr"
        plan["warm_up_frames"] = {"preview": 32, "draft": 64, "final": 250}[quality]
        why.append("Lumen converges over frames: warm-up (Faucher used 250 to 500 in MRQ, 1e6oOiKh91U [00:09:56]); prove it with a 2x warm-up diff")
        lq = {"preview": 1.0, "draft": 2.0, "final": 4.0}[quality]
        plan["ppv"] = {"lumen_scene_lighting_quality": lq, "lumen_final_gather_quality": lq,
                       "lumen_scene_detail": lq if quality == "final" else None,
                       "lumen_ray_lighting_mode": "enum:LumenRayLightingModeOverride.HIT_LIGHTING_FOR_REFLECTIONS"}
        why.append("Lumen quality lives in the PPV and is near-exponential in cost; about 4 removes crawling for film (Gobey Q&A [00:39:12]); hit lighting for reflections (Lumen doc)")
        if light_modifiers:
            plan["layer_warm_ups"] = True
            why.append("5.8 layer warm-ups when a Light Modifier changes lighting between layers")
    else:
        raise ValueError("renderer must be path_traced or deferred")
    return plan


def mrg_variables(plan, names=None):
    """Graph variable values for the template graph MRG_LightingStill (authored once, see procedures.md "Without a script").
    `names` maps the plan keys to the template's exposed variable names."""
    names = names or {"spatial_samples": "SpatialSamples", "temporal_samples": "TemporalSamples",
                      "warm_up_frames": "WarmUpFrames", "path_traced": "UsePathTracer",
                      "disable_tone_curve": "DisableToneCurve", "reference_motion_blur": "ReferenceMotionBlur"}
    out = {names["spatial_samples"]: int(plan["spatial_samples"]),
           names["temporal_samples"]: int(plan["temporal_samples"]),
           names["warm_up_frames"]: int(plan.get("warm_up_frames", 0)),
           names["path_traced"]: plan["renderer"] == "path_traced",
           names["disable_tone_curve"]: bool(plan["output"]["disable_tone_curve"])}
    if "reference_motion_blur" in plan:
        out[names["reference_motion_blur"]] = bool(plan["reference_motion_blur"])
    return out


def preset_commands(preset, include_device_profile=False):
    """Console lines for a CVAR_PRESETS entry (device profile lines only when asked)."""
    p = CVAR_PRESETS[preset]
    lines = ["%s %s" % (k, v[0]) for k, v in p.get("cvars", {}).items() if v[0] is not None]
    if include_device_profile:
        lines += ["%s %s" % (k, v[0]) for k, v in p.get("device_profile", {}).items()]
    return lines + list(p.get("commands", []))


def device_profile_lines(preset):
    """`+CVars=` lines for Config/<Platform>/<Platform>DeviceProfiles.ini (Lumen doc, Scalability)."""
    p = CVAR_PRESETS[preset]
    return ["+CVars=%s=%s" % (k, v[0]) for k, v in p.get("device_profile", {}).items()] + \
           ["+CVars=%s=%s" % (k, v[0]) for k, v in p.get("cvars", {}).items() if v[0] is not None]


def capture_plan(cameras, modes=("lit", "hdr", "lumen_overview"), out_dir="Saved/LightingReview", tag="iter"):
    """Steps for one review round: per camera bookmark, per representation view, a screenshot.
    Screenshots are latent: run each step in its own editor call so a frame renders in between."""
    steps = []
    for cam in cameras:
        for m in modes:
            on, off = VIEW_MODES[m]
            steps.append({"camera": cam, "mode": m, "enable": on, "disable": off,
                          "file": os.path.join(out_dir, "%s_%s_%s.png" % (tag, cam, m))})
    return steps


# --------------------------------------------------------------------------------------------------
# Lint (pure): input = plain dicts, as collect_lights / collect_ppvs return them
# --------------------------------------------------------------------------------------------------
def _f(fid, status, message, fix=None, src=None, subject=None, value=None):
    return {"id": fid, "status": status, "subject": subject, "message": message, "fix": fix,
            "src": src, "value": value}


def _kind(light):
    return (light.get("cls") or "").lower().replace("component", "").replace("light", "")


def _tags(light):
    tags = [t.lower() for t in light.get("tags") or []]
    out = {"_all": tags}
    for t in tags:
        if ":" in t:
            k, v = t.split(":", 1)
            out.setdefault(k, v)
        else:
            out.setdefault(t, True)
    return out


def _in_box(p, box, margin=0.0):
    return all(box["min"][i] - margin <= p[i] <= box["max"][i] + margin for i in range(3))


def _room_of(light, rooms):
    """Room volume containing the light; else its "room:<name>" tag matched loosely to a volume label."""
    loc = light.get("location")
    if loc is not None:
        for name, box in (rooms or {}).items():
            if _in_box(loc, box):
                return name
    tag = light.get("room") or _tags(light).get("room")
    if tag:
        tag = str(tag).lower()
        for name in rooms or {}:
            n = name.lower()
            if n == tag or n.endswith("_" + tag) or n.startswith(tag + "_"):
                return name
        return tag
    return None


def _dist(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def _clusters(points, radius):
    parent = list(range(len(points)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            if _dist(points[i], points[j]) <= radius:
                parent[find(i)] = find(j)
    groups = {}
    for i in range(len(points)):
        groups.setdefault(find(i), []).append(i)
    return [g for g in groups.values() if len(g) > 1]


def _source_shape_findings(L, k, name, role):
    """Fixture rule, second half: the light's source shape matches its fixture (Faucher 0GYyHDuaPcg
    [00:15:14] [00:15:47]: Source Length on a tube, Source Width and Height on a panel). Needs
    `fixture_extent` (half extents in cm of the nearest fixture mesh, from collect_lights)."""
    out = []
    ext = L.get("fixture_extent")
    if not ext or role in ("fill", "rim", "opening", "still_only", "bounce"):
        return out
    dims = sorted((2.0 * abs(e) for e in ext), reverse=True)
    r = THRESHOLDS["source_shape_ratio"]

    def off(a, b):
        return a <= 0 or b <= 0 or not (1.0 / r <= a / b <= r)
    if k == "rect":
        src = sorted((float(L.get("source_width") or 0.0), float(L.get("source_height") or 0.0)), reverse=True)
        if off(src[0], dims[0]) or off(src[1], dims[1]):
            out.append(_f("source_shape", "warn", "rect source %.0f x %.0f cm vs fixture %.0f x %.0f cm" % (src[0], src[1], dims[0], dims[1]),
                          "fit Source Width and Height to the fixture's emitting face", "Faucher 0GYyHDuaPcg [00:15:47]; MegaLights doc (fit rect sources); [added] ratio", name))
    elif k in ("point", "spot"):
        sl, sr = float(L.get("source_length") or 0.0), float(L.get("source_radius") or 0.0)
        if sl <= 0 and sr <= 0:
            out.append(_f("source_point", "info", "zero-size source inside a fixture: pinpoint highlights, razor shadows",
                          "Source Radius about the bulb, Source Length for a tube", "Faucher 0GYyHDuaPcg [00:15:47]", name))
        elif sl > 0 and off(sl, dims[0]):
            out.append(_f("source_shape", "warn", "Source Length %.0f cm vs fixture length %.0f cm" % (sl, dims[0]),
                          "Source Length equal to the tube", "Faucher 0GYyHDuaPcg [00:15:47]; [added] ratio", name))
    return out


def light_lint(lights, context=None):
    """Lighter's lint over collected lights. context: {"profile": "gameplay"|"still", "lumen": bool,
    "megalights": bool, "megalights_directional": bool, "has_interiors": bool, "ev100": float,
    "rooms": {name: {"min": xyz, "max": xyz}}, "sun_floor_deg": 15 (Oakley, optional)}."""
    ctx = {"profile": "gameplay", "lumen": True, "megalights": False, "megalights_directional": False,
           "has_interiors": True, "ev100": None, "rooms": {}}
    ctx.update(context or {})
    T = THRESHOLDS
    out = []
    local = []
    for L in lights:
        name = L.get("label") or L.get("name") or "?"
        k = _kind(L)
        t = _tags(L)
        units = (L.get("units") or "").lower()
        mob = (L.get("mobility") or "").lower()
        role = t.get("role")
        if k in ("point", "spot", "rect"):
            local.append(L)
            if units.startswith("unit"):
                out.append(_f("units_physical", "warn", "unitless intensity: values mean nothing against a physical exposure",
                              "set Intensity Units to lumens or candela and convert (1 cd = 625 unitless)",
                              "exposure doc; Gobey nlbJwMoj1Dg [00:05:56]", name))
            fx = t.get("fixture")
            if fx in FIXTURES and units and not units.startswith("unit") and L.get("intensity") is not None:
                lm = candela_to_lumens(L["intensity"], k, L.get("outer_cone_angle") or 44.0) if units.startswith("cand") else L["intensity"]
                ref = FIXTURES[fx]["lumens"]
                lo, hi = (ref, ref) if not isinstance(ref, tuple) else ref
                band = T["plausible_band"]
                if lm < lo / band or lm > hi * band:
                    out.append(_f("intensity_plausible", "warn", "%.0f lm for a %s (reference %s lm)" % (lm, fx, ref),
                                  "use the reference value, then judge after exposure is calibrated",
                                  FIXTURES[fx]["src"], name, lm))
                kv = FIXTURES[fx].get("kelvin")
                if kv and not L.get("use_temperature"):
                    out.append(_f("temperature", "info", "fixture %s without Use Temperature" % fx,
                                  "use_temperature on, temperature %s K" % (kv,), "Gobey chart [00:12:02]", name))
            if mob == "static" and ctx["lumen"]:
                out.append(_f("static_under_lumen", "warn", "Static light: Lumen ignores it (dual-pipeline fake bounce only)",
                              "Stationary or Movable if it must light the Lumen version", "Argyriou Q1whHlGJB_o [00:24:56]", name))
            if ctx["profile"] == "gameplay" and not L.get("max_draw_distance"):
                out.append(_f("max_draw_distance", "warn", "no Max Draw Distance", "set one on every light",
                              "Argyriou [00:22:23]", name))
            ili = L.get("indirect_lighting_intensity")
            if ili is not None and ili > 1.0:
                out.append(_f("indirect_boost", "warn", "Indirect Lighting Intensity %.2g: a cheat" % ili,
                              "prefer direct light or camera-side lift; if kept, sweep the camera for view-dependent GI and zero its volumetric scattering",
                              "Lumen doc, Screen Tracing; Argyriou [00:26:00] [00:26:32]", name, ili))
            vsi = L.get("volumetric_scattering_intensity")
            if (t.get("flicker") or role in ("muzzle", "flashlight")) and vsi:
                out.append(_f("volumetric_trails", "warn", "fast-changing light with volumetric scattering %.2g: trails in fog" % vsi,
                              "Volumetric Scattering Intensity 0", "sky doc, Temporal Reprojection", name))
            if k == "point" and t.get("fixture") in ("street_small", "street_big", "exterior", "pendant") and L.get("source_length", 0) == 0:
                out.append(_f("spot_candidate", "info", "point light in a directional fixture", "a spot: cheapest, aimed like the fixture",
                              "Argyriou [00:19:37]", name))
            if L.get("inside_geometry"):
                out.append(_f("inside_geometry", "warn", "light origin inside geometry: occluded, still sampled",
                              "move it out of the mesh, or open the fixture (glass or an open shade)", "MegaLights doc, Lighting Complexity", name))
            if L.get("near_fixture") is False and role not in ("fill", "rim", "opening", "still_only", "bounce"):
                out.append(_f("fixture_missing", "warn", "no fixture mesh within %.0f cm" % T["fixture_radius_cm"],
                              "every artificial light needs a visible source", "Faucher 0GYyHDuaPcg [00:15:14]", name))
            out += _source_shape_findings(L, k, name, role)
            method = str(L.get("mega_lights_shadow_method") or "").lower()
            if (ctx["megalights"] and ctx["profile"] == "gameplay" and method.startswith("v") and L.get("cast_shadows", True)
                    and not t.get("vsm_reason")):
                out.append(_f("vsm_local_moving", "warn", "local light on VSM in gameplay: every character or dynamic object moving through it invalidates its pages",
                              "ray-traced shadows (the MegaLights default): they pay only for visible pixels, give free penumbras and scale with moving characters; keep VSM for content ray tracing cannot represent and tag the reason (vsm_reason:<why>)",
                              "Campbell BKaAzhMHJZ0 [00:26:25] [00:31:42]; MegaLights doc, Shadowing Methods", name))
            if role == "still_only" and ctx["profile"] == "gameplay" and L.get("affects_world", True):
                out.append(_f("still_only_in_gameplay", "warn", "still-only cheat light active in the gameplay level",
                              "move it to the shot's Level Sequence as a spawnable (scenario-unreal-cinematics), or Affects World off after the render",
                              "Faucher 1LfiYtKDsac [00:25:40] (a shot, not a game); [added] rule", name))
            if L.get("channels") and tuple(L["channels"]) != (True, False, False):
                out.append(_f("lighting_channels", "info", "custom lighting channels %s" % (L["channels"],),
                              "direct light honours channels; Lumen GI bounce probably does not [verify]: zero its indirect if the bounce matters",
                              "Faucher 1LfiYtKDsac [00:24:02]; deltas file", name))
            if ctx.get("ev100") is not None and L.get("intensity") and units and not units.startswith("unit") and L.get("attenuation_radius"):
                cd = to_candela(L["intensity"], units, k, L.get("outer_cone_angle") or 44.0)
                tight = tight_attenuation_radius(cd, ctx["ev100"], T["tight_radius_stops_below_mid"])
                if L["attenuation_radius"] > T["attenuation_oversize_factor"] * tight:
                    out.append(_f("attenuation_oversized", "warn",
                                  "radius %.0f cm vs %.0f cm where the light fades 6 stops under mid grey" % (L["attenuation_radius"], tight),
                                  "tighten the radius: the strongest cost and noise setting", "Argyriou [00:26:32]; MegaLights doc; [added] radius rule",
                                  name, L["attenuation_radius"]))
            room = _room_of(L, ctx["rooms"])
            if room and room in ctx["rooms"] and L.get("attenuation_radius"):
                b = ctx["rooms"][room]
                diag = _dist(b["min"], b["max"])
                if L["attenuation_radius"] > diag * T["room_margin"]:
                    out.append(_f("radius_exceeds_room", "warn", "radius %.0f cm beyond room %s (diag %.0f)" % (L["attenuation_radius"], room, diag),
                                  "tighten to the room", "Argyriou [00:26:32]", name))
        elif k == "directional":
            lux = L.get("intensity")
            idx = L.get("atmosphere_sun_light_index", 0)
            if lux is not None and idx == 0 and lux > SKY["sun_zenith_lux"] * 1.05:
                out.append(_f("sun_lux", "warn", "sun %.0f lux above 120,000 at zenith" % lux, "120,000 lux", SKY["src"], name, lux))
            if lux is not None and idx == 1:
                out.append(_f("moon_lux", "info", "moon %.3g lux = %.1fx the physical 0.26 lux" % (lux, lux / SKY["moon_zenith_lux"]),
                              "record it as art-directed if above physical", SKY["src"], name, lux))
            if ctx["megalights"] and ctx["megalights_directional"] and L.get("allow_mega_lights", True) and ctx["has_interiors"] and idx == 0:
                out.append(_f("sun_in_megalights", "warn", "strong directional in MegaLights with interiors: it takes up to half the samples",
                              "keep the sun on deferred + VSM (r.MegaLights.DirectionalLights 0) or cap r.MegaLights.DirectionalLightSampleFraction",
                              "MegaLights doc, Directional Lights; SIGGRAPH [00:16:40]", name))
            floor = ctx.get("sun_floor_deg")
            rot = L.get("rotation") or {}
            if floor is not None and "pitch" in rot and idx == 0 and -rot["pitch"] < floor:
                out.append(_f("sun_floor", "warn", "sun elevation %.1f below the %.0f degree readability floor" % (-rot["pitch"], floor),
                              "lock the sun at or above the floor", "Oakley rX0wZZxpB-U [00:19:16]", name))
        elif k == "sky":
            if L.get("hidden_in_editor") and L.get("affects_world", True):
                out.append(_f("hidden_but_lighting", "warn", "hidden in the Outliner but still lighting", "Affects World off to really disable",
                              "Faucher BGoaPyfZlYg [00:04:46]", name))
            if L.get("lower_hemisphere_is_black"):
                out.append(_f("lower_hemisphere", "info", "Lower Hemisphere Is Solid Color on: black bottoms on reflective objects",
                              "off for most scenes", "Faucher BGoaPyfZlYg [00:04:46]", name))
        if k != "sky" and L.get("hidden_in_editor") and L.get("affects_world", True):
            out.append(_f("hidden_but_lighting", "warn", "hidden in the editor but Affects World on", "Affects World off",
                          "Faucher BGoaPyfZlYg [00:04:46]", name))
    # per-room shadowed dynamic lights (gameplay without MegaLights)
    rooms_count = {}
    for L in local:
        if L.get("cast_shadows") and (L.get("mobility") or "").lower() != "static":
            r = _room_of(L, ctx["rooms"])
            if r:
                rooms_count.setdefault(r, []).append(L.get("label"))
    for r, names in sorted(rooms_count.items()):
        if len(names) > 1:
            status = "info" if ctx["megalights"] else ("warn" if ctx["profile"] == "gameplay" else "info")
            out.append(_f("shadowed_per_room", status, "%d shadow-casting dynamic lights in %s" % (len(names), r),
                          "one per room without MegaLights; under MegaLights shadows are almost free per light",
                          "Argyriou [00:21:51]; MegaLights doc, Performance", r, len(names)))
    # clusters of small lights: merge candidates
    pts = [(i, L["location"]) for i, L in enumerate(local) if L.get("location") is not None]
    for g in _clusters([p for _, p in pts], THRESHOLDS["cluster_radius_cm"]):
        if len(g) >= THRESHOLDS["cluster_min_count"]:
            names = [local[pts[i][0]].get("label") for i in g]
            out.append(_f("cluster_merge", "warn", "%d lights within %.0f cm: %s" % (len(g), THRESHOLDS["cluster_radius_cm"], ", ".join(map(str, names))),
                          "merge into one area light (a rect over the shelf)", "MegaLights doc, Lighting Complexity; SIGGRAPH [00:48:40]", names, len(g)))
    if ctx["megalights"]:
        vsm = [L.get("label") for L in local if (L.get("mega_lights_shadow_method") or "").lower().startswith("v")]
        if len(vsm) > THRESHOLDS["vsm_lights_under_megalights_max"]:
            out.append(_f("megalights_vsm_count", "warn", "%d local lights on VSM under MegaLights" % len(vsm),
                          "ray tracing by default; VSM only for hero lights and content RT cannot represent", "MegaLights doc, Shadowing Methods", vsm, len(vsm)))
    return out


def ppv_lint(ppvs, context=None):
    """Post Process Volume lint. ppvs: [{"label", "unbound", "priority", "values": {field: value}}] where
    `values` holds only overridden fields. context: {"profile", "lumen": bool, "megalights": bool,
    "extended_range": bool, "still_renderer": "deferred"|"path_traced", "glass_visible": bool}."""
    ctx = {"profile": "gameplay", "lumen": True, "megalights": False, "extended_range": None}
    ctx.update(context or {})
    out = []
    unbound = [p for p in ppvs if p.get("unbound")]
    if not unbound:
        out.append(_f("unbound_ppv", "fail", "no unbound PPV: engine defaults drive exposure and post",
                      "place one unbound PPV (Infinite Extent)", "exposure doc, Tips"))
    if ctx.get("extended_range") is False:
        out.append(_f("extended_range", "fail", "Extend default luminance range is off: Min/Max are not EV100",
                      "turn it on at project start (switching later breaks exposure setups)", "exposure doc"))
    for p in ppvs:
        v = p.get("values", {})
        name = p.get("label", "?")
        glob = bool(p.get("unbound"))
        if glob:
            if "auto_exposure_min_brightness" not in v or "auto_exposure_max_brightness" not in v:
                out.append(_f("exposure_clamped", "fail", "Min/Max EV100 not overridden: auto exposure rescues any light value",
                              "clamp to the condition (exposure_plan)", "Gobey nlbJwMoj1Dg [00:11:40] [00:12:14]", name))
            if abs(v.get("auto_exposure_bias", 0.0) or 0.0) > 1e-6:
                out.append(_f("exposure_comp_zero", "warn", "Exposure Compensation %.2g" % v["auto_exposure_bias"],
                              "0, adjust EV100 instead", "Gobey [00:11:40]", name, v["auto_exposure_bias"]))
            elif "auto_exposure_bias" not in v:
                out.append(_f("exposure_comp_zero", "warn", "Exposure Compensation not overridden (engine default applies)",
                              "override it to 0", "Gobey [00:11:40]", name))
            if ctx["lumen"] and not any(k.startswith("local_exposure_") for k in v):
                out.append(_f("local_exposure_set", "warn", "Local Exposure not set up with Lumen GI", "set highlight and shadow contrast (0.6 to 1)",
                              "exposure doc, Local Exposure", name))
        else:
            film = [k for k in v if k.startswith("film_")]
            if film:
                out.append(_f("film_project_wide", "warn", "local PPV overrides Film (%s)" % ", ".join(film),
                              "Film settings project-wide in the unbound PPV", "exposure doc, Film Settings", name))
        for key in ("local_exposure_highlight_contrast_scale", "local_exposure_shadow_contrast_scale"):
            if key in v and not (0.6 - 1e-6 <= v[key] <= 1.0 + 1e-6):
                out.append(_f("local_exposure_range", "warn", "%s %.2g outside 0.6 to 1" % (key, v[key]), "0.6 to 1",
                              "exposure doc", name, v[key]))
        if v.get("lumen_diffuse_color_boost", 1.0) > 1.0:
            out.append(_f("diffuse_color_boost", "warn", "Diffuse Color Boost %.2g: breaks physicality, absent from the path tracer" % v["lumen_diffuse_color_boost"],
                          "prefer direct light or camera-side lift", "Faucher 0GYyHDuaPcg [00:13:42]", name))
        gain = v.get("color_gain")
        if gain is not None and any(abs(c - 1.0) > 1e-3 for c in gain[:3]):
            out.append(_f("gain_for_exposure", "warn", "Gain used", "exposure through EV100 and compensation, not Gain",
                          "exposure doc, Workflow", name))
        if v.get("color_grading_intensity", 0.0) > 0.0:
            out.append(_f("lut_used", "info", "a LUT is applied", "quick look only; rebuild it with grading controls", "exposure doc", name))
        if ctx["profile"] == "gameplay":
            for key in ("lumen_scene_lighting_quality", "lumen_final_gather_quality", "lumen_scene_detail"):
                if v.get(key, 1.0) > 2.0:
                    out.append(_f("lumen_quality_cost", "warn", "%s %.2g in a gameplay PPV" % (key, v[key]),
                                  "keep near 1 for games; about 4 is film quality", "Gobey Q&A [00:39:12] [00:40:18]", name))
            mode = str(v.get("lumen_ray_lighting_mode", "")).upper()
            if mode.endswith("HIT_LIGHTING_FOR_REFLECTIONS"):
                out.append(_f("hit_lighting_gameplay", "warn", "hit lighting in gameplay", "cinematics only unless materials are trivial",
                              "Lumen doc, Hardware Ray Tracing", name))
        if ctx["megalights"] and glob and v.get("lumen_front_layer_translucency_reflections"):
            out.append(_f("front_layer_global", "warn", "front-layer translucency on in the global PPV",
                          "disable project-wide, enable in a PPV around hero glass", "MegaLights doc (can double lighting cost)", name))
        if "path_tracing_max_path_intensity" in v:
            out.append(_f("pt_max_path_intensity", "info", "Max Path Intensity overridden", "the default is right and exposure-relative",
                          "path tracer doc", name))
        if ctx.get("glass_visible") and ctx.get("still_renderer") == "path_traced" and v.get("path_tracing_max_bounces", 32) < 8:
            out.append(_f("pt_bounces_glass", "warn", "glass with %s bounces" % v.get("path_tracing_max_bounces"),
                          "8 to 12 (10 in Faucher's scene)", "Faucher X5zVhc5ahl0 [00:16:47]", name))
        wt = v.get("white_temp")
        if wt is not None:
            out.append(_f("white_balance_direction", "info", "White Temp %.0f K" % wt,
                          "check the direction on a screenshot: in White Balance mode a Temp above the scene light warms the image (doc)",
                          "exposure doc; Gobey [00:17:31]", name))
    return out


def scene_lint(scene, renderer="lumen"):
    """Scene-level checks. scene: {"hdri_backdrop": int, "sky_light": {"real_time_capture", "cubemap_resolution"},
    "sky_atmosphere": bool, "height_fog": {"volumetric", "fog_inscattering_black", "directional_inscattering_black",
    "scattering_distribution"}, "support_sky_affects_height_fog": bool, "albedo_max": float,
    "emissive_small_without_light": [names], "emissive_light_pairs": [(emissive, light, cm)] (emissive_fixture_pairs),
    "pt_emissive_materials": bool, "pt_indirect_emissive": bool, "reference_atmosphere": bool, "cvars": {name: value},
    "megalights": bool, "masked_casters": [labels], "glass": [material dicts for glass_lint],
    "meshes" + "rooms" (room_shell_lint), "key_camera_forward" + "key_to_light" (fog angle)}."""
    out = []
    ref_atmo = bool(scene.get("reference_atmosphere"))
    if renderer == "path_traced" and scene.get("hdri_backdrop"):
        out.append(_f("pt_hdri_backdrop", "fail", "HDRIBackdrop: double-counted light, no importance sampling",
                      "remove it; to show a cubemap sky use a Sky Light with a specified cubemap + r.PathTracing.VisibleLights 2 (with Reference Atmosphere any Sky Light is ignored and the atmosphere renders directly)",
                      "path tracer doc, Limitations; Reference Atmosphere"))
    vis = (scene.get("cvars") or {}).get("r.PathTracing.VisibleLights")
    vis = vis[0] if isinstance(vis, tuple) else vis
    if renderer == "path_traced" and ref_atmo and vis is not None and str(vis).strip() in ("2", "2.0"):
        out.append(_f("pt_visible_lights_noop", "info", "r.PathTracing.VisibleLights 2 with Reference Atmosphere: no effect",
                      "drop it: Reference Atmosphere ignores any Sky Light and renders the atmosphere to camera rays itself",
                      "path tracer doc, Reference Atmosphere; Direct Visibility of Light Sources"))
    pairs = scene.get("emissive_light_pairs") or []
    if renderer == "path_traced" and pairs and scene.get("pt_emissive_materials", True) and scene.get("pt_indirect_emissive", True):
        out.append(_f("pt_emissive_double_count", "warn", "%d emissive fixtures with a real light at them: %s" % (len(pairs), ", ".join("%s+%s" % (p[0], p[1]) for p in pairs[:6])),
                      "A/B with r.PathTracing.EnableEmissive 0 (PPV Emissive Materials off); keep the tube visible and turn off Indirect Emissive in PPV Path Tracing > Lighting Components so only the light lights",
                      "path tracer doc, Emissive Materials row and PPV table; rendering digest, path-traced scene audit", [p[0] for p in pairs], len(pairs)))
    if renderer != "path_traced" and scene.get("megalights") and scene.get("masked_casters"):
        mc = scene["masked_casters"]
        out.append(_f("megalights_alpha_masked", "warn", "%d alpha-masked shadow casters under MegaLights: %s" % (len(mc), ", ".join(map(str, mc[:6]))),
                      "ray-traced shadows ignore masks by default (screen traces only), so grilles, plants and bead curtains cast solid shadows off-screen: model the holes, or r.MegaLights.HardwareRayTracing.EvaluateMaterialMode 1 at a real cost, or VSM on the one light that must show them",
                      "MegaLights doc, Alpha Masking; SIGGRAPH dmmN8_c8Tb0 [00:26:09]", mc, len(mc)))
    for x in glass_lint(scene.get("glass") or [], renderer):
        out.append(x)
    if scene.get("meshes") and scene.get("rooms"):
        out += room_shell_lint(scene["meshes"], scene["rooms"])
    fog_ = scene.get("height_fog") or {}
    if scene.get("key_camera_forward") and scene.get("key_to_light") and fog_.get("volumetric") and fog_.get("scattering_distribution") is not None:
        want = scattering_distribution_for(scene["key_camera_forward"], scene["key_to_light"])
        have = float(fog_["scattering_distribution"])
        if abs(have - want) > THRESHOLDS["scattering_info_delta"]:
            out.append(_f("fog_scattering_angle", "info", "Scattering Distribution %.2f vs %.2f for the key camera's angle to the light" % (have, want),
                          "near 0.9 looking into the light, near 0 for shafts seen from the side; art direction decides",
                          "Faucher 1LfiYtKDsac [00:16:06]; sky doc, Common Questions", value=have))
    sl = scene.get("sky_light") or {}
    if renderer == "path_traced" and sl.get("real_time_capture") and (sl.get("cubemap_resolution") or 128) < 512:
        out.append(_f("pt_sky_cubemap", "warn", "real-time capture cubemap %s" % sl.get("cubemap_resolution", 128),
                      "512 or more, or Reference Atmosphere", "path tracer doc, Skylighting"))
    fog = scene.get("height_fog") or {}
    if scene.get("sky_atmosphere") and fog and scene.get("atmosphere_drives_fog"):
        if not (fog.get("fog_inscattering_black") and fog.get("directional_inscattering_black")):
            out.append(_f("fog_inscattering", "warn", "height fog inscattering colours not black while the atmosphere should drive the fog",
                          "both black + Support Sky Atmosphere Affecting Height Fog", "sky doc, Artistic Direction; Faucher 1LfiYtKDsac [00:11:12]"))
        if not scene.get("support_sky_affects_height_fog"):
            out.append(_f("fog_project_setting", "warn", "Support Sky Atmosphere Affecting Height Fog is off", "enable it (restart)", "sky doc"))
    if renderer == "path_traced" and fog and not fog.get("volumetric"):
        out.append(_f("pt_fog_volumetric", "warn", "height fog without Volumetric Fog: the path tracer needs it", "enable Volumetric Fog on the component",
                      "path tracer doc, Volumetric Fog"))
    am = scene.get("albedo_max")
    if am is not None:
        lim = THRESHOLDS["albedo_max_path_traced"] if renderer == "path_traced" else THRESHOLDS["albedo_max_lumen"]
        if am > lim:
            out.append(_f("albedo_high", "warn", "diffuse albedo up to %.2f" % am,
                          "at most %.1f: high albedo lengthens paths and washes out; albedo is lighting (hand to scenario-unreal-materials)" % lim,
                          "path tracer doc; Faucher X5zVhc5ahl0 [00:22:24]; 1e6oOiKh91U [00:13:35]; Gobey nlbJwMoj1Dg [00:07:30]", value=am))
    for name in scene.get("emissive_small_without_light") or []:
        out.append(_f("emissive_as_light", "warn", "small bright emissive with no companion light", "add a real light, or Emissive Light Source on the component",
                      "Lumen doc troubleshooting; Faucher 1e6oOiKh91U [00:12:30]", name))
    return out


def _norm(v):
    return re.sub(r"[^a-z0-9]", "", str(v or "").lower())


def glass_lint(materials, renderer="path_traced"):
    """Glass materials against GLASS_RECIPE. materials: [{"name", "shading_model", "blend_mode",
    "lighting_mode" (Translucency Lighting Mode), "refraction_method"}], enum names in any case
    (collect_glass_materials reads them; Python enum names [verify])."""
    out = []
    for m in materials:
        name = m.get("name", "?")
        sm, lm, rm = _norm(m.get("shading_model")), _norm(m.get("lighting_mode")), _norm(m.get("refraction_method"))
        if renderer == "path_traced":
            if "thintranslucent" in sm:
                out.append(_f("pt_glass_thin", "info", "Thin Translucent glass", GLASS_RECIPE["thin"]["why"],
                              "path tracer doc, Thin Translucency; Faucher X5zVhc5ahl0 [00:15:43]", name))
                continue
            if "indexofrefraction" not in rm:
                out.append(_f("pt_glass_refraction", "warn", "Refraction Method %s" % (m.get("refraction_method") or "unset"),
                              "Index of Refraction: otherwise the path tracer uses transparency, not a bounce, roughness ignored",
                              "path tracer doc, Thin Translucency and Basic Glass Material", name))
            if not ("surfaceperpixellighting" in lm or "surfaceforwardshading" in lm):
                out.append(_f("pt_glass_lighting_mode", "warn", "Lighting Mode %s" % (m.get("lighting_mode") or "unset"),
                              "Surface ForwardShading (TLM_SurfacePerPixelLighting [verify enum]), Opacity 0 on the refractive part",
                              "path tracer doc, Basic Glass Material; Faucher X5zVhc5ahl0 [00:14:36]", name))
        elif "surfaceperpixellighting" in lm or "surfaceforwardshading" in lm:
            out.append(_f("glass_gameplay_cost", "info", "forward-shaded glass in a real-time view", GLASS_RECIPE["gameplay"]["why"],
                          "Argyriou Q1whHlGJB_o [00:16:19]; MegaLights doc", name))
    return out


def room_shell_lint(meshes, rooms, cover=None):
    """One mesh that spans a whole room (walls, floor and ceiling in one asset) cannot be carded by the
    Lumen surface cache: split walls, floors and ceilings, or raise Max Lumen Mesh Cards (default 12)
    and re-check the Surface Cache view (Faucher 1e6oOiKh91U [00:06:09] [00:06:42]; Lumen doc, Surface
    Cache). meshes: [{"label", "min", "max"}]; rooms: {name: {"min", "max"}}."""
    cover = THRESHOLDS["room_shell_cover"] if cover is None else cover
    out = []
    for m in meshes:
        for rn, b in (rooms or {}).items():
            frac = []
            for i in range(3):
                span = b["max"][i] - b["min"][i]
                ov = min(m["max"][i], b["max"][i]) - max(m["min"][i], b["min"][i])
                frac.append(ov / span if span > 0 else 0.0)
            if min(frac) >= cover:
                out.append(_f("room_single_mesh", "warn", "%s spans room %s on every axis (%.0f%% minimum)" % (m.get("label"), rn, 100 * min(frac)),
                              "split walls, floors and ceilings (scenario-unreal-world-building), or raise Max Lumen Mesh Cards and check the Surface Cache view for pink",
                              "Faucher 1e6oOiKh91U [00:06:42]; Lumen doc, Surface Cache", m.get("label"), min(frac)))
    return out


def _box_dist(p, lo, hi):
    return math.sqrt(sum(max(lo[i] - p[i], 0.0, p[i] - hi[i]) ** 2 for i in range(3)))


def emissive_fixture_pairs(lights, emissives, radius_cm=None):
    """Emissive meshes with a real light at them: the path tracer double counts them unless one of the
    two is excluded (path tracer doc, Emissive Materials; rendering digest audit). emissives: [{"label",
    "location" or "min"/"max"}] (collect_emissive_meshes); lights: collect_lights dicts. Returns
    [(emissive_label, light_label, distance_cm)]."""
    radius_cm = THRESHOLDS["fixture_radius_cm"] if radius_cm is None else radius_cm
    pairs = []
    for e in emissives:
        lo = e.get("min") or e.get("location")
        hi = e.get("max") or e.get("location")
        if lo is None:
            continue
        for L in lights:
            if _kind(L) not in ("point", "spot", "rect") or L.get("location") is None:
                continue
            d = _box_dist(L["location"], lo, hi)
            if d <= radius_cm:
                pairs.append((e.get("label"), L.get("label"), round(d, 1)))
    return pairs


def cheat_inventory(lights, ppvs=(), materials=()):
    """Every non-physical choice, for the report and for the path tracer comparison (cheats do not appear there)."""
    inv = []
    for L in lights:
        t = _tags(L)
        if (L.get("indirect_lighting_intensity") or 1.0) > 1.0:
            inv.append({"what": "indirect_lighting_intensity", "subject": L.get("label"), "value": L["indirect_lighting_intensity"]})
        if L.get("channels") and tuple(L["channels"]) != (True, False, False):
            inv.append({"what": "lighting_channels", "subject": L.get("label"), "value": L["channels"]})
        if t.get("role") in ("fill", "rim", "bounce", "still_only"):
            inv.append({"what": "cheat_light:" + t["role"], "subject": L.get("label"), "value": L.get("intensity")})
        if _kind(L) == "directional" and L.get("atmosphere_sun_light_index") == 1 and (L.get("intensity") or 0) > SKY["moon_zenith_lux"] * 1.5:
            inv.append({"what": "art_directed_moon", "subject": L.get("label"), "value": L.get("intensity")})
    for p in ppvs:
        v = p.get("values", {})
        if v.get("lumen_diffuse_color_boost", 1.0) > 1.0:
            inv.append({"what": "diffuse_color_boost", "subject": p.get("label"), "value": v["lumen_diffuse_color_boost"]})
    for m in materials:
        inv.append({"what": "lumen_only_emissive_boost", "subject": m, "value": "Ray Tracing Quality Switch (Avowed); invisible to the path tracer"})
    return inv


def cvar_lint(cvars, context="mrg"):
    """cvars: {name: value} or {name: (value, reason)}. context "mrg" (a render) or "gameplay"."""
    out = []
    for name, val in cvars.items():
        value, reason = (val if isinstance(val, tuple) else (val, None))
        if name in DEPRECATED_CVARS:
            out.append(_f("cvar_deprecated", "fail", "%s: %s" % (name, DEPRECATED_CVARS[name]), "remove or replace", "deltas file", name))
        if name in DEPRECATED_VALUES and str(value) == DEPRECATED_VALUES[name][0]:
            out.append(_f("cvar_deprecated_value", "warn", "%s %s: %s" % (name, value, DEPRECATED_VALUES[name][1]), "remove", "deltas file", name))
        if context == "mrg" and name in CARGO_CULT_CVARS:
            out.append(_f("cvar_cargo_cult", "warn", "%s: the render already runs Cinematic scalability" % name, "remove",
                          "Faucher fVg5ihB8Wdc [00:03:00]", name))
        if context == "mrg" and name.startswith("sg."):
            out.append(_f("cvar_scalability_in_render", "info", "%s in a render: Global Game Overrides already sets scalability" % name, "remove unless proven",
                          "MRG doc, Game Overrides", name))
        if not reason:
            out.append(_f("cvar_reason", "warn", "%s has no written reason" % name, "one named problem per cvar, or remove",
                          "Faucher [00:03:00]; Campbell BKaAzhMHJZ0 [00:18:53]", name))
    return out


_INI_KEYS = {
    "r.DynamicGlobalIlluminationMethod": ("1", "Lumen GI"),
    "r.ReflectionMethod": ("1", "Lumen reflections"),
    "r.Shadow.Virtual.Enable": ("1", "Virtual Shadow Maps"),
    "r.GenerateMeshDistanceFields": ("True", "needed by software Lumen"),
    "r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange": ("True", "EV100 exposure, at project start"),
    "r.RayTracing": ("True", "Support Hardware Ray Tracing: MegaLights, path tracer, hit lighting (restart)"),
    "r.Lumen.HardwareRayTracing": ("True", "Use Hardware Ray Tracing when available"),
    "r.PathTracing": ("True", "path tracer shader permutations; off in projects that never path trace"),
    "r.MegaLights.EnableForProject": ("True", "MegaLights project switch [verify key name]"),
    "r.SkinCache.CompileShaders": ("True", "Support Compute Skin Cache (path tracer prompt)"),
    "r.SupportSkyAtmosphereAffectsHeightFog": ("True", "only when the atmosphere drives the height fog"),
}


def parse_ini(text):
    """{section: {key: value}} (last value wins; '+Key' entries collected as lists under 'Key+')."""
    sec, out = None, {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(";") or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            sec = line[1:-1]
            out.setdefault(sec, {})
            continue
        if "=" in line and sec is not None:
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k[:1] in "+-.!":
                out[sec].setdefault(k[1:] + "+", []).append(v)
            else:
                out[sec][k] = v
    return out


def render_settings_report(ini_text, wants=("lumen", "vsm", "megalights", "path_tracer", "extended_range")):
    """Read Config/DefaultEngine.ini [/Script/Engine.RendererSettings] and say what the plan needs."""
    rs = parse_ini(ini_text).get("/Script/Engine.RendererSettings", {})
    vals = {k: rs.get(k) for k in _INI_KEYS}
    out = []

    def truthy(v):
        return str(v).strip().lower() in ("1", "true")
    need = []
    if "lumen" in wants:
        need += ["r.DynamicGlobalIlluminationMethod", "r.ReflectionMethod", "r.GenerateMeshDistanceFields"]
    if "vsm" in wants:
        need += ["r.Shadow.Virtual.Enable"]
    if "megalights" in wants:
        need += ["r.RayTracing", "r.MegaLights.EnableForProject"]
    if "path_tracer" in wants:
        need += ["r.RayTracing", "r.PathTracing", "r.SkinCache.CompileShaders"]
    if "extended_range" in wants:
        need += ["r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange"]
    if "hwrt_lumen" in wants:
        need += ["r.RayTracing", "r.Lumen.HardwareRayTracing"]
    for k in dict.fromkeys(need):
        v = vals.get(k)
        want, why = _INI_KEYS[k]
        if v is None:
            out.append(_f("ini_missing", "warn", "%s not set in DefaultEngine.ini (engine or template default applies): %s" % (k, why),
                          "read it back at runtime, or set %s=%s" % (k, want), "deltas file (converted projects keep old settings)", k))
        elif truthy(v) != truthy(want) and str(v) != want:
            out.append(_f("ini_value", "warn", "%s=%s, plan needs %s (%s)" % (k, v, want, why), "set %s=%s and restart" % (k, want),
                          "Lumen, VSM, MegaLights, path tracer and exposure docs", k, v))
    if "path_tracer" not in wants and truthy(vals.get("r.PathTracing")):
        out.append(_f("ini_pathtracing_unused", "info", "Path Tracing shader permutations compiled but not planned", "disable to save shader compile time",
                      "path tracer doc", "r.PathTracing"))
    return {"values": vals, "findings": out}


def ini_patch(text, updates, section="/Script/Engine.RendererSettings"):
    """Return new ini text with keys set in `section` (existing lines replaced, others kept). Back the
    file up before writing it (project rule: version before overwrite)."""
    lines = text.splitlines()
    out, in_sec, seen, done = [], False, set(), False
    for line in lines:
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            if in_sec and not done:
                out += ["%s=%s" % (k, v) for k, v in updates.items() if k not in seen]
                done = True
            in_sec = s[1:-1] == section
            out.append(line)
            continue
        if in_sec and "=" in s and s.split("=", 1)[0].strip() in updates:
            k = s.split("=", 1)[0].strip()
            out.append("%s=%s" % (k, updates[k]))
            seen.add(k)
            continue
        out.append(line)
    if in_sec and not done:
        out += ["%s=%s" % (k, v) for k, v in updates.items() if k not in seen]
        done = True
    if not done:
        out += ["", "[%s]" % section] + ["%s=%s" % (k, v) for k, v in updates.items()]
    return "\n".join(out) + ("\n" if not out or out[-1] != "" else "")


def mrg_lint(plan):
    """Render configuration checklist before a final (demystifying-mrq, MRG doc, path tracer doc, Faucher)."""
    out = []
    r, ss, ts = plan.get("renderer"), int(plan.get("spatial_samples", 1)), int(plan.get("temporal_samples", 1))
    total = ss * ts
    if r == "deferred":
        if ss > 1 and ts > 1:
            out.append(_f("mrg_mixed_samples", "fail", "spatial %d x temporal %d on the deferred path" % (ss, ts),
                          "all temporal (motion blur) or all spatial (no blur)", "demystifying-mrq; Faucher [00:04:58]"))
        for n, c in (("spatial", ss), ("temporal", ts)):
            if c > 1 and c % 2 == 0:
                out.append(_f("mrg_even_samples", "warn", "%s samples %d are even" % (n, c), "odd counts (Frame Center shutter)",
                              "demystifying-mrq; Faucher [00:06:01]"))
        if total > 8 and plan.get("aa", "tsr") != "none":
            out.append(_f("mrg_aa", "warn", "%d total samples with AA %s" % (total, plan.get("aa")), "AA None above about 8 samples, or write the reason",
                          "MRG doc, Anti-Aliasing; Faucher [00:10:24]"))
        if not plan.get("motion_blur") and ss > 1 and plan.get("motion_blur_amount", 0.0) not in (0, 0.0):
            out.append(_f("mrg_still_blur", "warn", "spatial samples with Motion Blur Amount %s" % plan.get("motion_blur_amount"),
                          "Motion Blur Amount 0 for a still", "Faucher [00:06:46]"))
        if int(plan.get("warm_up_frames", 0)) <= 0:
            out.append(_f("mrg_warmup", "warn", "no warm-up on a Lumen render", "warm-up frames, then prove convergence with a 2x diff",
                          "Faucher 1e6oOiKh91U [00:09:56]; MRG doc"))
    elif r == "path_traced":
        if not plan.get("motion_blur") and ts != 1:
            out.append(_f("pt_still_temporal", "warn", "path-traced still with %d temporal samples" % ts, "all spatial, 1 temporal", "path tracer doc"))
        if plan.get("motion_blur"):
            if ss != 1:
                out.append(_f("pt_anim_spatial", "warn", "path-traced animation with %d spatial samples" % ss, "1 spatial, many temporal", "path tracer doc"))
            if not plan.get("reference_motion_blur"):
                out.append(_f("pt_ref_mb", "warn", "Reference Motion Blur off", "on for path-traced animation", "path tracer doc"))
            if plan.get("denoiser") == "nne":
                out.append(_f("pt_anim_denoiser", "warn", "spatial denoiser on animation flickers", "NFOR temporal denoiser, or off", "path tracer doc; Faucher [00:09:03]"))
    out += cvar_lint(plan.get("cvars") or {}, context="mrg")
    o = plan.get("output") or {}
    if o.get("format") == "exr" and o.get("bit_depth") not in (16, 32):
        out.append(_f("mrg_exr_depth", "warn", "EXR bit depth %s" % o.get("bit_depth"), "16-bit half for grading latitude", "Faucher fVg5ihB8Wdc [00:01:37]"))
    if plan.get("delivery") in ("graded", "comp") and not o.get("disable_tone_curve"):
        out.append(_f("mrg_tone_curve", "warn", "graded delivery with the tone curve baked", "Disable Tone Curve (or OCIO to a working space)",
                      "Faucher [00:02:30]; MRG transition doc"))
    if plan.get("game_overrides") not in ("connected", "disconnected"):
        out.append(_f("mrg_game_overrides", "info", "Global Game Overrides state not stated", "state it: it is the first suspect when a render differs from the viewport",
                      "MRG doc, Globals"))
    return out


def profilegpu_passes(text):
    """Tolerant parse of a ProfileGPU log dump: [(depth, name, ms)] [verify the 5.8 line format]."""
    rows = []
    rx = re.compile(r"^(?P<pre>.*?)(?P<ms>\d+(?:\.\d+)?)\s*ms\s+(?P<name>[A-Za-z].*?)\s*$")
    for line in text.splitlines():
        body = re.sub(r"^\[[^\]]*\]\[[^\]]*\]", "", line)
        body = re.sub(r"^\s*Log\w+:(?: Display:)? ?", "", body)
        m = rx.match(body)
        if not m:
            continue
        name = re.sub(r"\s+\d+\s*draws?.*$", "", m.group("name")).strip()
        depth = len(body) - len(body.lstrip(" "))
        rows.append((depth, name, float(m.group("ms"))))
    return rows


_PASS_KEYS = {"lumen": ("lumen",), "megalights": ("megalights",), "vsm_depths": ("rendervirtualshadowmaps", "shadowdepths"),
              "vsm_projection": ("virtualshadowmapprojection",), "path_tracing": ("pathtracing",),
              "volumetric_fog": ("volumetricfog",), "translucency": ("translucency",), "post": ("postprocessing",)}


def pass_budget(passes, fps=60, budgets=None):
    """Compare per-pass GPU times with the documented Lumen budget and the project's own budgets.
    passes: {name: ms} or profilegpu_passes() rows (the shallowest match per group is summed)."""
    rows = passes if isinstance(passes, list) else [(0, k, v) for k, v in passes.items()]
    groups = {}
    for g, keys in _PASS_KEYS.items():
        hits = [(d, n, ms) for d, n, ms in rows if any(k in n.lower().replace(" ", "") for k in keys)]
        if hits:
            dmin = min(d for d, _, _ in hits)
            groups[g] = sum(ms for d, _, ms in hits if d == dmin)
    budgets = dict(budgets or {})
    budgets.setdefault("lumen", BUDGETS["lumen_ms_60fps"] if fps >= 60 else BUDGETS["lumen_ms_30fps"])
    out = []
    for g, ms in sorted(groups.items()):
        b = budgets.get(g)
        if b is None:
            out.append(_f("budget_" + g, "info", "%s %.2f ms (no project budget set)" % (g, ms), "scenario-unreal-performance sets it", None, g, ms))
        else:
            st = "pass" if ms <= b else "fail"
            out.append(_f("budget_" + g, st, "%s %.2f ms vs %.2f ms" % (g, ms, b),
                          None if st == "pass" else "see references/procedures.md P12 (reduce, then re-measure)",
                          "Lumen doc: 4 ms at 60 fps, 8 ms at 30, 1080p console" if g == "lumen" else "project budget", g, ms))
    return {"groups": groups, "findings": out}


def exposure_warnings(log_text):
    """Lines of the 5.8 on-screen exposure-range warning echoed in the log [verify exact text]."""
    return [l for l in log_text.splitlines() if re.search(r"exposure", l, re.I) and re.search(r"range|clip", l, re.I)]


# --------------------------------------------------------------------------------------------------
# Frames (offline, numpy): EXR through ffmpeg, PNG through Pillow
# --------------------------------------------------------------------------------------------------
def _need_numpy():
    if np is None:
        raise RuntimeError("numpy is required for frame analysis")


def srgb_to_linear(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def _read_pfm(path):
    with open(path, "rb") as f:
        head = f.readline().decode().strip()
        w, h = map(int, f.readline().decode().split())
        scale = float(f.readline().decode().strip())
        data = np.fromfile(f, dtype="<f4" if scale < 0 else ">f4")
    ch = 3 if head == "PF" else 1
    img = data.reshape(h, w, ch)[::-1]
    return np.repeat(img, 3, axis=2) if ch == 1 else img


def _read_exr(path, layer=None):
    try:
        import OpenEXR  # noqa: F401  (optional, not required)
    except Exception:
        pass
    ff = shutil.which("ffmpeg")
    fp = shutil.which("ffprobe")
    if not ff or not fp:
        raise RuntimeError("EXR reading needs ffmpeg/ffprobe on PATH (or convert to .npy/.pfm)")
    pre = ["-layer", layer] if layer else []
    pr = subprocess.run([fp, "-v", "error"] + pre + ["-select_streams", "v:0", "-show_entries", "stream=pix_fmt,width,height",
                         "-of", "json", path], capture_output=True, text=True)
    info = json.loads(pr.stdout)["streams"][0]
    pix, w, h = info["pix_fmt"], int(info["width"]), int(info["height"])
    # decode in the native format: swscale clamps float conversions to [0, 1]
    nat = {"gbrpf16le": ("<f2", 3), "gbrapf16le": ("<f2", 4), "gbrpf32le": ("<f4", 3), "gbrapf32le": ("<f4", 4),
           "grayf16le": ("<f2", 1), "grayf32le": ("<f4", 1)}
    if pix not in nat:
        pix = "gbrpf32le"
    dt, ch = nat[pix]
    r = subprocess.run([ff, "-v", "error"] + pre + ["-i", path, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", pix, "-"],
                       capture_output=True)
    if r.returncode != 0:
        raise RuntimeError("ffmpeg failed on %s: %s" % (path, r.stderr.decode(errors="ignore")[-300:]))
    a = np.frombuffer(r.stdout, dtype=dt).astype(np.float32).reshape(ch, h, w)
    if ch == 1:
        return np.repeat(a[0][..., None], 3, axis=2)
    return np.stack([a[2], a[0], a[1]], axis=-1)  # planes are G, B, R(, A)


def load_image(path, layer=None):
    """(HxWx3 float32, kind): kind 'linear' for EXR/PFM/NPY, 'display' for PNG/JPG/TIFF (0..1)."""
    _need_numpy()
    if isinstance(path, np.ndarray):
        return path.astype(np.float32)[..., :3], "linear"
    ext = os.path.splitext(path)[1].lower()
    if ext == ".npy":
        return np.load(path).astype(np.float32)[..., :3], "linear"
    if ext == ".pfm":
        return _read_pfm(path).astype(np.float32), "linear"
    if ext == ".exr":
        return _read_exr(path, layer), "linear"
    from PIL import Image
    im = Image.open(path)
    mode_max = 65535.0 if im.mode.startswith("I;16") or im.mode == "I" else 255.0
    a = np.asarray(im.convert("RGB") if mode_max == 255.0 else im).astype(np.float32) / mode_max
    if a.ndim == 2:
        a = np.repeat(a[..., None], 3, axis=2)
    return a[..., :3], "display"


def luminance(rgb):
    """Rec.709 luminance (5.5 moved Unreal's luminance factors from NTSC to Rec.709)."""
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def region_mask(shape, spec):
    """Boolean HxW mask from {"box": [x0, y0, x1, y1]} (normalized 0..1, origin top-left), {"mask": png},
    or an array."""
    h, w = shape[:2]
    if isinstance(spec, np.ndarray):
        return spec.astype(bool)
    if spec is None:
        return np.ones((h, w), bool)
    if "mask" in spec:
        from PIL import Image
        m = np.asarray(Image.open(spec["mask"]).convert("L").resize((w, h))) > 127
        return m
    x0, y0, x1, y1 = spec["box"]
    m = np.zeros((h, w), bool)
    m[int(round(y0 * h)):max(int(round(y1 * h)), int(round(y0 * h)) + 1),
      int(round(x0 * w)):max(int(round(x1 * w)), int(round(x0 * w)) + 1)] = True
    return m


def _hsv(rgb):
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    d = mx - mn
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    dd = np.maximum(d, 1e-9)
    h = np.where(mx == r, ((g - b) / dd) % 6.0, np.where(mx == g, (b - r) / dd + 2.0, (r - g) / dd + 4.0)) * 60.0
    h = np.where(d > 1e-6, h, 0.0)
    return h, s, mx


def _display(img, kind):
    """Display-referred view for clip, crush and hue: the frame itself if tone-mapped, else a plain
    sRGB encode of the linear values (not Unreal's tone curve) [added approximation]."""
    return img if kind == "display" else linear_to_srgb(img)


def region_stats(img, kind, mask):
    lin = img if kind == "linear" else srgb_to_linear(img)
    disp = _display(img, kind)
    sel = mask & np.isfinite(luminance(lin))
    n = int(sel.sum())
    if n == 0:
        return {"pixels": 0}
    lum = luminance(lin)[sel]
    lg = np.log2(np.maximum(lum, 1e-8))
    d = disp[sel]
    h, s, v = _hsv(d)
    wt = s * v
    ang = np.radians(h)
    if wt.sum() > 1e-9:
        hue = float(np.degrees(np.arctan2((np.sin(ang) * wt).sum(), (np.cos(ang) * wt).sum())) % 360.0)
    else:
        hue = None
    rb = np.log2((lin[sel][:, 0] + 1e-6) / (lin[sel][:, 2] + 1e-6))
    if kind == "linear":
        clipped = float((lin[sel].max(axis=1) >= THRESHOLDS["linear_white"]).mean())
        crushed = float((lum < THRESHOLDS["linear_crush"]).mean())
    else:
        clipped = float((d.min(axis=1) >= THRESHOLDS["clip_display"]).mean())
        crushed = float((luminance(d) < THRESHOLDS["crush_display"]).mean())
    peak = float((lg >= np.median(lg) + THRESHOLDS["specular_peak_stops"]).mean())
    return {"pixels": n, "mean_lin": float(lum.mean()), "geo_mean_lin": float(2 ** lg.mean()),
            "log2_mean": float(lg.mean()), "log2_std": float(lg.std()), "clipped_frac": clipped,
            "crushed_frac": crushed, "hue_deg": hue, "sat_mean": float(s.mean()),
            "warmth_log2_rb": float(np.median(rb)), "bright_sat_keep": _bright_sat_keep(d), "peak_frac": peak}


def _bright_sat_keep(d):
    h, s, v = _hsv(d)
    bright = v >= 0.5
    if bright.sum() == 0:
        return None
    return float((s[bright] >= THRESHOLDS["neon_sat_min"]).mean())


def _hue_dist(a, b):
    x = abs(a - b) % 360.0
    return min(x, 360.0 - x)


def frame_report(path, brief=None, reference=None, log_text=None):
    """Lighting checks on one frame. brief: {"use": "gameplay"|"still", "ev100": float (the exposure the
    frame was rendered at, needed for EXR readings), "comp": 0, "regions": {name: {"box" or "mask",
    "role": grey_card|condition|neon|focal|shadow|playable|practical|ambient|subject|glossy,
    "condition": name, "stops": intent}}}. reference: a path-traced frame of the same camera (optional).
    log_text: the editor log since the capture (log_since); the 5.8 out-of-range exposure warning in it
    fails the frame (5.8 release notes: Lumen and Sky Light cached lighting would clip)."""
    _need_numpy()
    brief = brief or {}
    T = THRESHOLDS
    img, kind = load_image(path)
    findings = []
    if log_text is not None:
        warn_lines = exposure_warnings(log_text)
        findings.append(_f("exposure_range_warning", "fail" if warn_lines else "pass",
                           ("5.8 exposure-range warning: %s" % warn_lines[0][:160]) if warn_lines else "no exposure-range warning in the log",
                           "bring exposure back inside the supported range (EV100 clamps, light values), never raise the pre-exposure cvar blindly" if warn_lines else None,
                           "5.8 release notes (r.EyeAdaptation.CachedLightingPreExposure default 4); Lumen doc, Outdated"))
    generic = None
    rv = _review()
    if rv is not None and hasattr(rv, "image_checks") and isinstance(path, str):
        try:
            generic = rv.image_checks(path)
        except Exception as e:  # keep going with the lighting checks
            generic = {"error": repr(e)}
    if generic and not generic.get("error"):
        flag = generic.get("all_white_or_black") or generic.get("uniform") or generic.get("blank")
        if flag:
            findings.append(_f("frame_blank", "fail", "ue_review: frame is all white or all black", "check exposure, the camera and the render", "scenario-unreal-expert"))
    lin = img if kind == "linear" else srgb_to_linear(img)
    lum_all = luminance(lin)
    finite = np.isfinite(lum_all)
    if (~finite).any():
        findings.append(_f("nan_inf", "fail", "%d NaN or Inf pixels" % int((~finite).sum()), "find the material or cvar that emits them", "digest checklist"))
    if generic is None:  # fallback guard only; ue_review.image_checks is the shared check
        if float(np.nanstd(lum_all)) < T["uniform_std"] * max(float(np.nanmean(lum_all)), 1e-6):
            findings.append(_f("frame_blank", "fail", "frame is uniform (all white or black?)", "look at the frame; check exposure and the camera", "MCP talk lesson via scenario-unreal-expert"))
    regions = brief.get("regions") or {}
    stats = {}
    ev, comp = brief.get("ev100"), float(brief.get("comp", 0.0))
    for name, spec in regions.items():
        m = region_mask(img.shape, spec)
        st = region_stats(img, kind, m)
        stats[name] = st
        if not st.get("pixels"):
            findings.append(_f("region_empty", "warn", "region %s is empty" % name, "fix the box", None, name))
            continue
        role = spec.get("role")
        if kind == "linear" and ev is not None:
            L = luminance_from_pixel(st["mean_lin"], ev, comp)
            st["scene_luminance_cdm2"] = L
            st["reads_ev100"] = ev100_for_luminance(L)
            st["stops_vs_mid"] = math.log2(max(st["mean_lin"], 1e-12) / MID_GREY)
        if role == "grey_card":
            if kind != "linear":
                findings.append(_f("grey_card_needs_exr", "info", "grey card read on a tone-mapped frame", "render a linear EXR with Disable Tone Curve", None, name))
            else:
                intent = float(spec.get("stops", 0.0))
                d = math.log2(max(st["mean_lin"], 1e-12) / (MID_GREY * 2 ** intent))
                st["grey_card_error_stops"] = d
                ok = abs(d) <= T["grey_card_tolerance_stops"]
                findings.append(_f("grey_card", "pass" if ok else "warn", "grey card at %+.2f stops from intent" % d,
                                   None if ok else "adjust EV100 (not the lights) until the card sits at the intent", "exposure doc (B = Exposure x L); [added] tolerance",
                                   name, d))
        if role == "condition" and "reads_ev100" in st:
            target = CONDITIONS[spec["condition"]]["ev100"] if spec.get("condition") in CONDITIONS else spec.get("target_ev100")
            if target is not None:
                d = st["reads_ev100"] - target
                ok = abs(d) <= T["exposure_tolerance_stops"]
                findings.append(_f("condition_ev", "pass" if ok else "warn",
                                   "%s reads EV100 %.2f vs %s target %.2f (%+.2f)" % (name, st["reads_ev100"], spec.get("condition"), target, d),
                                   None if ok else "fix light values (lux, lumens) toward the condition, not the exposure", "Gobey chart; [added] tolerance", name, d))
        if role in ("subject", "focal") and st["clipped_frac"] > T["clipped_frac_subject"]:
            findings.append(_f("subject_clipped", "warn", "%s: %.1f%% clipped" % (name, 100 * st["clipped_frac"]), "lower the key or darken the surround", "[added]", name))
        if role in ("playable", "shadow") and st["crushed_frac"] > T["crushed_frac_playable"]:
            findings.append(_f("crushed_playable", "warn", "%s: %.1f%% crushed" % (name, 100 * st["crushed_frac"]),
                               "lift with the ladder: direct light, toe, local exposure, then cheats", "Argyriou [00:30:14]; Gobey [00:14:58]", name))
        if role == "shadow":
            ok = st["log2_std"] >= T["shadow_shape_min_std_stops"]
            findings.append(_f("shadow_shape", "pass" if ok else "warn", "%s: value variation %.2f stops" % (name, st["log2_std"]),
                               None if ok else "give the ambient gradients: balance the skylight, let light fall off", "Oakley rX0wZZxpB-U [00:07:34]; [added] metric", name))
        if role == "glossy":
            ok = st["peak_frac"] >= T["specular_min_frac"]
            findings.append(_f("specular_present", "pass" if ok else "warn", "%s: %.2f%% of pixels hold a highlight" % (name, 100 * st["peak_frac"]),
                               None if ok else "a glossy or wet surface lit only by Lumen indirect gets little specular: add or aim a direct light it can reflect",
                               "Faucher 0GYyHDuaPcg [00:10:28]; [added] metric", name, st["peak_frac"]))
        if role == "neon" and kind == "linear":
            findings.append(_f("neon_rolloff", "info", "%s: judge neon roll-off on the tone-mapped PNG, not the linear EXR" % name, None, None, name))
        elif role == "neon":
            keep = st.get("bright_sat_keep")
            if keep is not None:
                ok = keep >= T["neon_hue_keep_frac"]
                findings.append(_f("neon_rolloff", "pass" if ok else "warn", "%s: %.0f%% of bright pixels keep their hue" % (name, 100 * keep),
                                   None if ok else "lower the emissive (emissive_for_stops) or accept white cores; check bloom", "exposure doc (filmic desaturates bright emissive); [added] metric", name))
    prac = [n for n, s in regions.items() if s.get("role") == "practical" and stats.get(n, {}).get("pixels")]
    amb = [n for n, s in regions.items() if s.get("role") == "ambient" and stats.get(n, {}).get("pixels")]
    if prac and amb:
        w = float(np.mean([stats[n]["warmth_log2_rb"] for n in prac]) - np.mean([stats[n]["warmth_log2_rb"] for n in amb]))
        ok = w >= T["warm_cool_min"]
        findings.append(_f("warm_cool_split", "pass" if ok else "warn", "practicals warmer than ambient by %.2f (log2 R/B)" % w,
                           None if ok else "warmer practicals (1,900 to 3,000 K) or a cooler, subtle ambient", "Faucher 1LfiYtKDsac [00:19:33]; Gobey chart; [added] metric", prac + amb, w))
    foc = [n for n, s in regions.items() if s.get("role") == "focal" and stats.get(n, {}).get("pixels")]
    if foc:
        n = foc[0]
        rest = ~region_mask(img.shape, regions[n])
        rs = region_stats(img, kind, rest)
        if stats[n].get("hue_deg") is not None and rs.get("hue_deg") is not None:
            dh = _hue_dist(stats[n]["hue_deg"], rs["hue_deg"])
            st_ = "pass" if dh >= T["hue_contrast_pass_deg"] else ("warn" if dh >= T["hue_contrast_warn_deg"] else "warn")
            findings.append(_f("focal_hue_contrast", st_, "focal hue %.0f vs scene %.0f: %.0f degrees apart" % (stats[n]["hue_deg"], rs["hue_deg"], dh),
                               None if st_ == "pass" else "move the focal element to the opposite side of the colour wheel, or limit the scene's hue range",
                               "Oakley [00:09:19]; [added] thresholds", n, dh))
    report = {"frame": path if isinstance(path, str) else "<array>", "kind": kind, "generic": generic, "regions": stats,
              "findings": findings, "brief_regions": regions}
    if reference is not None:
        gt = compare_ground_truth(path, reference, regions)
        report["ground_truth"] = gt
        findings += gt["findings"]
    report["verdict"] = "fail" if any(f["status"] == "fail" for f in findings) else ("warn" if any(f["status"] == "warn" for f in findings) else "pass")
    return report


def albedo_check(path, region=None, renderer="path_traced"):
    """Diffuse albedo audit on a Base Color buffer capture (VIEW_MODES["base_color"]): albedo is
    lighting (Gobey nlbJwMoj1Dg [00:07:30]) and above 0.8 it lengthens path-traced renders and washes
    out (path tracer doc; Faucher X5zVhc5ahl0 [00:22:24]). The screenshot is treated as display-encoded
    [verify on the first run with a known 0.5 material]; pure black (sky, background) is excluded.
    High check on the brightest channel, low check on luminance [added]. Returns stats + findings;
    stats["albedo_max"] (99th percentile) feeds scene_lint."""
    img, kind = load_image(path)
    lin = img if kind == "linear" else srgb_to_linear(img)
    m = region_mask(img.shape, region) & np.isfinite(lin).all(axis=-1)
    mx = lin.max(axis=-1)
    m &= mx > 1e-4
    T = THRESHOLDS
    lim = T["albedo_max_path_traced"] if renderer == "path_traced" else T["albedo_max_lumen"]
    out = {"pixels": int(m.sum()), "limit": lim, "findings": []}
    if not out["pixels"]:
        out["findings"].append(_f("albedo_empty", "warn", "no base-colour pixels (wrong view mode?)", "check the Base Color buffer capture", None))
        return out
    v, lum = mx[m], luminance(lin)[m]
    out.update(albedo_max=float(np.percentile(v, 99)), high_frac=float((v > lim).mean()), low_frac=float((lum < T["albedo_min"]).mean()),
               median=float(np.median(lum)))
    if out["high_frac"] > T["albedo_high_frac_max"]:
        out["findings"].append(_f("albedo_high", "warn", "%.1f%% of base colour above %.1f (99th percentile %.2f)" % (100 * out["high_frac"], lim, out["albedo_max"]),
                                  "lower base colour to %.1f or less (scenario-unreal-materials); snow 0.8 to 0.9, nothing real is 1" % lim,
                                  "path tracer doc; Faucher X5zVhc5ahl0 [00:22:24]; 1e6oOiKh91U [00:13:35]; [added] share", None, out["high_frac"]))
    if out["low_frac"] > T["albedo_low_frac_max"]:
        out["findings"].append(_f("albedo_low", "warn", "%.1f%% of base colour below %.2f" % (100 * out["low_frac"], T["albedo_min"]),
                                  "near-black albedo makes shadows 'incredibly dark': check the textures before adding fill (scenario-unreal-materials)",
                                  "Gobey nlbJwMoj1Dg [00:07:30]; [added] bound", None, out["low_frac"]))
    return out


def compare_ground_truth(realtime, pathtraced, regions=None, diff_png=None):
    """Per-region stop difference realtime vs path tracer at the same camera (Faucher 0GYyHDuaPcg
    [00:07:43]; path tracer doc). Lumen-only cheats (indirect boost, Diffuse Color Boost, Lumen-only
    emissive) will show up here by design: list them from cheat_inventory before judging."""
    a, ka = load_image(realtime)
    b, kb = load_image(pathtraced)
    if a.shape != b.shape:
        raise ValueError("frames differ in size: %s vs %s" % (a.shape, b.shape))
    la = luminance(a if ka == "linear" else srgb_to_linear(a))
    lb = luminance(b if kb == "linear" else srgb_to_linear(b))
    regions = regions or {"frame": None}
    out, rows = [], {}
    for name, spec in regions.items():
        m = region_mask(a.shape, spec) & np.isfinite(la) & np.isfinite(lb)
        if not m.any():
            continue
        d = math.log2(max(float(la[m].mean()), 1e-9) / max(float(lb[m].mean()), 1e-9))
        rows[name] = d
        st = "fail" if abs(d) > THRESHOLDS["ground_truth_fail_stops"] else ("warn" if abs(d) > THRESHOLDS["ground_truth_warn_stops"] else "pass")
        out.append(_f("ground_truth", st, "%s: realtime %+.2f stops vs path tracer" % (name, d),
                      None if st == "pass" else ("missing bounce or leak: check Surface Cache, openings, blockers" if d < 0 else "extra light: cheats, leaks, emissive double count"),
                      "Faucher [00:07:43]; [added] thresholds", name, d))
    if diff_png:
        from PIL import Image
        r = np.log2(np.maximum(la, 1e-6) / np.maximum(lb, 1e-6))
        t = np.clip((r + 2.0) / 4.0, 0, 1)
        rgb = np.stack([t, 1 - np.abs(t - 0.5) * 2, 1 - t], -1)
        Image.fromarray((rgb * 255).astype(np.uint8)).save(diff_png)
    note = "tone-mapped inputs: approximate" if "display" in (ka, kb) else "linear inputs"
    return {"stops": rows, "findings": out, "note": note}


def temporal_flicker(frames, region=None):
    """Mean absolute change of log2 luminance between consecutive frames (static camera region)."""
    prev, diffs = None, []
    for f in frames:
        img, kind = load_image(f)
        lum = luminance(img if kind == "linear" else srgb_to_linear(img))
        m = region_mask(img.shape, region)
        lg = np.log2(np.maximum(lum, 1e-6))
        if prev is not None:
            diffs.append(float(np.abs(lg - prev)[m].mean()))
        prev = lg
    worst = max(diffs) if diffs else 0.0
    st = "pass" if worst <= THRESHOLDS["flicker_max_stops"] else "warn"
    return {"diffs": diffs, "worst": worst, "finding": _f("temporal_flicker", st, "worst frame-to-frame change %.3f stops" % worst,
                                                         None if st == "pass" else "denoiser flicker (NFOR for sequences) or Lumen warm-up", "Faucher X5zVhc5ahl0 [00:09:34]; [added]")}


def noise_sigma(path, region=None):
    """Robust sigma (stops) of the high-pass log luminance in a flat region: compare A/B setups, not absolute."""
    img, kind = load_image(path)
    lum = luminance(img if kind == "linear" else srgb_to_linear(img))
    lg = np.log2(np.maximum(lum, 1e-6))
    pad = np.pad(lg, 1, mode="edge")
    blur = sum(pad[dy:dy + lg.shape[0], dx:dx + lg.shape[1]] for dy in range(3) for dx in range(3)) / 9.0
    hp = (lg - blur)[region_mask(img.shape, region)]
    return float(1.4826 * np.median(np.abs(hp - np.median(hp))))


def red_fraction(path, region=None):
    """Share of strongly red pixels in a screenshot: the VSM Cached Page view paints invalidated pages
    red, so with a still camera it should be near 0 (VSM doc) [added metric]."""
    img, kind = load_image(path)
    d = _display(img, kind)
    m = region_mask(img.shape, region)
    red = (d[..., 0] > 0.6) & (d[..., 1] < 0.3) & (d[..., 2] < 0.3)
    return float(red[m].mean())


def rank_lights_in_dump(text, labels):
    """Format-agnostic reading of r.MegaLights.Visualize.LightComplexity.Dump: how often each known
    light label appears after the marker, most frequent first [added; verify the dump format]."""
    counts = {lab: len(re.findall(r"\b%s\b" % re.escape(lab), text)) for lab in labels}
    return sorted(((n, c) for n, c in counts.items() if c), key=lambda x: -x[1])


def write_report(report, out_dir, frame=None):
    """report.json, critique.md (table in the critique order) and annotated.png (region boxes)."""
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "report.json"), "w") as f:
        json.dump(report, f, indent=1, default=str)
    lines = ["| status | id | subject | message | fix | source |", "|---|---|---|---|---|---|"]
    for x in report["findings"]:
        lines.append("| %s | %s | %s | %s | %s | %s |" % (x["status"], x["id"], x.get("subject") or "", x["message"], x.get("fix") or "", x.get("src") or ""))
    with open(os.path.join(out_dir, "critique.md"), "w") as f:
        f.write("Verdict: %s (code screens, the eye decides)\n\n%s\n" % (report.get("verdict"), "\n".join(lines)))
    if frame and isinstance(frame, str) and np is not None:
        try:
            from PIL import Image, ImageDraw
            img, kind = load_image(frame)
            disp = (np.clip(_display(img, kind), 0, 1) * 255).astype(np.uint8)
            im = Image.fromarray(disp)
            dr = ImageDraw.Draw(im)
            h, w = disp.shape[:2]
            bad = {x["subject"] for x in report["findings"] if x["status"] in ("warn", "fail") and isinstance(x.get("subject"), str)}
            for name, spec in (report.get("brief_regions") or {}).items():
                if "box" in spec:
                    x0, y0, x1, y1 = spec["box"]
                    dr.rectangle([x0 * w, y0 * h, x1 * w, y1 * h], outline=(255, 60, 60) if name in bad else (60, 255, 60), width=2)
                    dr.text((x0 * w + 3, y0 * h + 3), name, fill=(255, 255, 0))
            im.save(os.path.join(out_dir, "annotated.png"))
        except Exception as e:  # annotation is a convenience
            report.setdefault("notes", []).append("annotation failed: %r" % e)
    return os.path.join(out_dir, "critique.md")


# --------------------------------------------------------------------------------------------------
# Editor layer (needs the `unreal` module). Not yet run in Unreal: names are [verify].
# --------------------------------------------------------------------------------------------------
def _ue():
    import unreal  # noqa: E402  (only inside the editor)
    return unreal


def _enum(value):
    """Resolve 'enum:Type.NAME' strings against the unreal module; other values pass through."""
    if isinstance(value, str) and value.startswith("enum:"):
        t, n = value[5:].split(".", 1)
        return getattr(getattr(_ue(), t), n)
    return value


def _vec(v):
    u = _ue()
    return u.Vector(float(v[0]), float(v[1]), float(v[2]))


def _rot(r):
    u = _ue()
    if isinstance(r, dict):
        return u.Rotator(pitch=float(r.get("pitch", 0)), yaw=float(r.get("yaw", 0)), roll=float(r.get("roll", 0)))
    return u.Rotator(pitch=float(r[0]), yaw=float(r[1]), roll=float(r[2]))  # keywords: the positional order is roll, pitch, yaw [verify]


def _color(c):
    u = _ue()
    return u.LinearColor(float(c[0]), float(c[1]), float(c[2]), 1.0)


def editor_world():
    u = _ue()
    return u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()


def console(cmd):
    """Run a console command in the editor world. Visual results appear after the next rendered frame:
    screenshot or read the log in a later call."""
    _ue().SystemLibrary.execute_console_command(editor_world(), cmd)
    return cmd


def cvar_value(name, kind="float"):
    lib = _ue().SystemLibrary
    fn = {"float": lib.get_console_variable_float_value, "int": lib.get_console_variable_int_value,
          "bool": lib.get_console_variable_bool_value}[kind]
    return fn(name)


def apply_cvars(cvars):
    """Set cvars ({name: value or (value, reason)}); returns the previous values for restore_cvars."""
    prev = {}
    for k, v in cvars.items():
        val = v[0] if isinstance(v, tuple) else v
        if val is None:
            continue
        try:
            prev[k] = cvar_value(k)
        except Exception:
            prev[k] = None
        console("%s %s" % (k, val))
    return prev


def restore_cvars(prev):
    for k, v in prev.items():
        if v is not None:
            console("%s %s" % (k, v))


def level_actors(cls=None):
    u = _ue()
    acts = u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
    return [a for a in acts if cls is None or isinstance(a, cls)]


def _label(a):
    try:
        return a.get_actor_label()
    except Exception:
        return a.get_name()


def get_or_spawn_ppv(label="PPV_Global", unbound=True, priority=0.0, folder="Lighting"):
    u = _ue()
    for a in level_actors(u.PostProcessVolume):
        if _label(a) == label:
            return a
    with u.ScopedEditorTransaction("ue_light spawn PPV"):
        a = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(u.PostProcessVolume, _vec((0, 0, 0)))
        a.set_actor_label(label)
        a.set_editor_property("unbound", bool(unbound))
        a.set_editor_property("priority", float(priority))
        try:
            a.set_folder_path(folder)
        except Exception:
            pass
    return a


def set_pp(target, values, struct_prop=None):
    """Write PostProcessSettings fields with their override flags (copy the struct, edit, write back).
    target: a PostProcessVolume ("settings") or a CineCameraComponent ("post_process_settings").
    Returns [(field, old, new)]. Values of None are skipped."""
    u = _ue()
    prop = struct_prop or ("settings" if isinstance(target, u.PostProcessVolume) else "post_process_settings")
    s = target.get_editor_property(prop)
    changes = []
    for k, v in values.items():
        if v is None:
            continue
        try:
            old = s.get_editor_property(k)
        except Exception:
            old = None
        s.set_editor_property("override_" + k, True)
        s.set_editor_property(k, _enum(v))
        changes.append((k, old, v))
    with u.ScopedEditorTransaction("ue_light set post process"):
        target.set_editor_property(prop, s)
    return changes


def read_pp(target, names, struct_prop=None):
    """{field: (overridden, value)} for the given PostProcessSettings fields."""
    u = _ue()
    prop = struct_prop or ("settings" if isinstance(target, u.PostProcessVolume) else "post_process_settings")
    s = target.get_editor_property(prop)
    out = {}
    for k in names:
        try:
            out[k] = (bool(s.get_editor_property("override_" + k)), s.get_editor_property(k))
        except Exception:
            out[k] = (None, None)
    return out


def apply_exposure(target, plan):
    return set_pp(target, pp_values_for_exposure(plan))


def apply_look(ppv, values):
    return set_pp(ppv, values)


def set_cine_camera_exposure(camera_actor, iso, shutter_s, aperture):
    """Still exposure on the CineCamera (its post process settings sit on top of the level PPVs), so the
    gameplay PPV stays untouched [added design]. Returns the EV100."""
    comp = camera_actor.get_cine_camera_component()
    comp.set_editor_property("current_aperture", float(aperture))
    set_pp(comp, {"auto_exposure_method": "enum:AutoExposureMethod.AEM_MANUAL",
                  "auto_exposure_apply_physical_camera_exposure": True,
                  "camera_iso": float(iso), "camera_shutter_speed": float(1.0 / shutter_s),
                  "depth_of_field_fstop": float(aperture)}, "post_process_settings")
    try:
        comp.set_editor_property("post_process_blend_weight", 1.0)
    except Exception:
        pass
    return ev100_from_camera(aperture, shutter_s, iso)


_LIGHT_CLASSES = {"point": "PointLight", "spot": "SpotLight", "rect": "RectLight", "directional": "DirectionalLight"}
_UNITS = {"lumens": "LUMENS", "candelas": "CANDELAS", "unitless": "UNITLESS"}
_MOBILITY = {"static": "STATIC", "stationary": "STATIONARY", "movable": "MOVABLE"}


def set_light_physical(comp, intensity=None, units=None, kelvin=None, color=None, **props):
    """Units before intensity; temperature through Use Temperature. Extra props go through
    set_editor_property (attenuation_radius, source_width, barn_door_angle, cast_shadows, ...)."""
    u = _ue()
    if units:
        comp.set_editor_property("intensity_units", getattr(u.LightUnits, _UNITS[units]))
    if intensity is not None:
        comp.set_editor_property("intensity", float(intensity))
    if kelvin:
        comp.set_editor_property("use_temperature", True)
        comp.set_editor_property("temperature", float(kelvin))
    if color is not None:
        comp.set_editor_property("light_color", _color(color))
    for k, v in props.items():
        if v is None:
            continue
        if k == "lighting_channels":
            set_lighting_channels(comp, v)
        elif k == "mobility":
            comp.set_editor_property("mobility", getattr(u.ComponentMobility, _MOBILITY[v]))
        elif isinstance(v, (tuple, list)) and len(v) == 3 and k.endswith(("color", "luminance")):
            comp.set_editor_property(k, _color(v))
        else:
            comp.set_editor_property(k, _enum(v))
    return comp


def _component_for(target, prefer=("LightComponent", "StaticMeshComponent", "PrimitiveComponent")):
    """The component to edit: a component passes through; an actor gives its first light, else mesh,
    else primitive component; a string is an actor label."""
    u = _ue()
    if isinstance(target, str):
        label = target
        target = next((a for a in level_actors() if _label(a) == label), None)
        if target is None:
            raise KeyError("no actor labelled %r" % label)
    if not hasattr(target, "get_component_by_class"):
        return target
    for cls in prefer:
        if hasattr(u, cls):
            c = target.get_component_by_class(getattr(u, cls))
            if c is not None:
                return c
    raise ValueError("no light, mesh or primitive component on %s" % _label(target))


def set_lighting_channels(target, channels):
    """Lighting channels (0, 1, 2) on a light or a mesh: copy the struct, edit, write back. A light
    affects only meshes sharing one of its channels (Faucher 1LfiYtKDsac [00:24:02]); see
    still_only_light_plan for the Lumen and path tracer caveats. Field names channel0..2 [verify]."""
    comp = _component_for(target)
    lc = comp.get_editor_property("lighting_channels")
    for i, on in enumerate(tuple(channels)[:3]):
        lc.set_editor_property("channel%d" % i, bool(on))
    with _ue().ScopedEditorTransaction("ue_light lighting channels"):
        comp.set_editor_property("lighting_channels", lc)
    return comp


def set_emissive_light_source(target, on=True):
    """Emissive Light Source on a mesh component: small emissive meshes stay in the Lumen Scene instead
    of being culled and left to screen traces (Lumen doc, troubleshooting). Property name [verify]."""
    comp = _component_for(target, ("StaticMeshComponent", "PrimitiveComponent"))
    with _ue().ScopedEditorTransaction("ue_light emissive light source"):
        comp.set_editor_property("emissive_light_source", bool(on))
    return comp


def spawn_light(kind, location, rotation=(0, 0, 0), label=None, folder="Lighting", tags=(), **light):
    """Spawn a light actor and set it physically. kind: point|spot|rect|directional. Returns the actor."""
    u = _ue()
    cls = getattr(u, _LIGHT_CLASSES[kind])
    eas = u.get_editor_subsystem(u.EditorActorSubsystem)
    with u.ScopedEditorTransaction("ue_light spawn %s" % kind):
        a = eas.spawn_actor_from_class(cls, _vec(location), _rot(rotation))
        if label:
            a.set_actor_label(label)
        try:
            a.set_folder_path(folder)
        except Exception:
            pass
        if tags:
            a.set_editor_property("tags", list(tags))
        comp = a.get_component_by_class(u.LightComponent)
        set_light_physical(comp, **light)
    return a


_READ = ["intensity", "intensity_units", "attenuation_radius", "source_radius", "source_length", "source_width",
         "source_height", "outer_cone_angle", "barn_door_angle", "barn_door_length", "cast_shadows", "max_draw_distance",
         "indirect_lighting_intensity", "volumetric_scattering_intensity", "cast_volumetric_shadow", "use_temperature",
         "temperature", "affects_world", "allow_mega_lights", "mega_lights_shadow_method", "atmosphere_sun_light",
         "atmosphere_sun_light_index", "real_time_capture", "cubemap_resolution", "lower_hemisphere_is_black",
         "light_source_angle"]


def _enum_name(v):
    s = str(v)
    return s.split(".")[-1].split(":")[0].strip("<> ").lower()


def collect_lights(fixture_radius_cm=None):
    """Plain dicts for light_lint (one per light component), with fixture proximity from actor tags
    ("fixture..." tag or static mesh actors whose label contains 'fixture', 'lamp', 'lantern', 'sign'),
    and the nearest fixture's label and half extents (fixture_label, fixture_extent) for the source
    shape check."""
    u = _ue()
    fixture_radius_cm = fixture_radius_cm or THRESHOLDS["fixture_radius_cm"]
    acts = level_actors()
    fixtures = []
    for a in acts:
        if isinstance(a, u.StaticMeshActor):
            lab = _label(a).lower()
            tags = [str(t).lower() for t in (a.get_editor_property("tags") or [])]
            if any(w in lab for w in ("fixture", "lamp", "lantern", "sign", "neon", "sconce", "pendant")) or any(t.startswith("fixture") for t in tags):
                o = a.get_actor_location()
                try:
                    _, e = a.get_actor_bounds(False)
                    ext = (abs(e.x), abs(e.y), abs(e.z))
                except Exception:
                    ext = None
                fixtures.append(((o.x, o.y, o.z), ext, _label(a)))
    out = []
    for a in acts:
        comps = []
        try:
            comps = a.get_components_by_class(u.LightComponentBase)
        except Exception:
            try:
                comps = a.get_components_by_class(u.LightComponent)
            except Exception:
                comps = []
        for c in comps:
            d = {"label": _label(a), "cls": type(c).__name__, "tags": [str(t) for t in (a.get_editor_property("tags") or [])]}
            for k in _READ:
                try:
                    v = c.get_editor_property(k)
                except Exception:
                    continue
                d[k] = _enum_name(v) if k in ("intensity_units", "mega_lights_shadow_method") else v
            if "intensity_units" in d:
                d["units"] = d.pop("intensity_units")
            elif "Directional" in d["cls"]:
                d["units"] = "lux"
            try:
                d["mobility"] = _enum_name(c.get_editor_property("mobility"))
            except Exception:
                pass
            try:
                lc = c.get_editor_property("lighting_channels")
                d["channels"] = (bool(lc.get_editor_property("channel0")), bool(lc.get_editor_property("channel1")), bool(lc.get_editor_property("channel2")))
            except Exception:
                pass
            loc = a.get_actor_location()
            rot = a.get_actor_rotation()
            d["location"] = (loc.x, loc.y, loc.z)
            d["rotation"] = {"pitch": rot.pitch, "yaw": rot.yaw, "roll": rot.roll}
            try:
                d["hidden_in_editor"] = bool(a.is_temporarily_hidden_in_editor())
            except Exception:
                pass
            if fixtures and "Directional" not in d["cls"] and "SkyLight" not in d["cls"]:
                dist, loc, ext, flab = min(((_dist(d["location"], f[0]),) + f for f in fixtures), key=lambda x: x[0])
                d["near_fixture"] = dist <= fixture_radius_cm
                if d["near_fixture"]:
                    d["fixture_label"], d["fixture_extent"] = flab, ext
            out.append(d)
    return out


def collect_mesh_bounds(tag=None, classes=("StaticMeshActor",)):
    """[{"label", "min", "max", "tags"}] for static mesh actors (optionally only those with `tag`), for
    room_shell_lint and emissive_fixture_pairs."""
    u = _ue()
    out = []
    for a in level_actors():
        if not any(hasattr(u, c) and isinstance(a, getattr(u, c)) for c in classes):
            continue
        tags = [str(t).lower() for t in (a.get_editor_property("tags") or [])]
        if tag and tag not in tags:
            continue
        o, e = a.get_actor_bounds(False)
        out.append({"label": _label(a), "location": (o.x, o.y, o.z), "min": (o.x - e.x, o.y - e.y, o.z - e.z),
                    "max": (o.x + e.x, o.y + e.y, o.z + e.z), "tags": tags})
    return out


def collect_emissive_meshes(words=("neon", "sign", "bulb", "tube", "emissive", "screen")):
    """Emissive fixture meshes by convention: tag 'emissive' (or 'fixture:neon'), or a label containing
    one of `words` [added heuristic: material graphs cannot be read reliably]. For emissive_fixture_pairs
    and Emissive Light Source."""
    out = []
    for m in collect_mesh_bounds():
        lab = m["label"].lower()
        if "emissive" in m["tags"] or "fixture:neon" in m["tags"] or any(w in lab for w in words):
            out.append(m)
    return out


def _materials_of(actor):
    u = _ue()
    mats = []
    for comp in actor.get_components_by_class(u.StaticMeshComponent):
        try:
            mats += [m for m in comp.get_materials() if m is not None]
        except Exception:
            pass
    return mats


def _base_material(m):
    try:
        return m.get_base_material()
    except Exception:
        return m


def collect_masked_casters(min_count=1):
    """Labels of static mesh actors whose materials use Masked blend mode (grilles, plants, bead
    curtains): MegaLights ray tracing ignores their masks by default (MegaLights doc, Alpha Masking).
    Material API names [verify]."""
    u = _ue()
    out = []
    for a in level_actors(u.StaticMeshActor):
        for m in _materials_of(a):
            try:
                bm = _norm(_enum_name(_base_material(m).get_editor_property("blend_mode")))
            except Exception:
                continue
            if "masked" in bm:
                out.append(_label(a))
                break
    return out


def collect_glass_materials(paths):
    """Material dicts for glass_lint from asset paths (instances resolve to their base material).
    Property names blend_mode, shading_model, translucency_lighting_mode, refraction_method [verify]."""
    u = _ue()
    out = []
    for p in paths:
        m = _base_material(u.load_asset(p))
        d = {"name": p}
        for key, prop in (("blend_mode", "blend_mode"), ("shading_model", "shading_model"),
                          ("lighting_mode", "translucency_lighting_mode"), ("refraction_method", "refraction_method")):
            try:
                d[key] = _enum_name(m.get_editor_property(prop))
            except Exception:
                d[key] = None
        out.append(d)
    return out


_PP_FIELDS = ["auto_exposure_method", "auto_exposure_bias", "auto_exposure_min_brightness", "auto_exposure_max_brightness",
              "auto_exposure_apply_physical_camera_exposure", "local_exposure_highlight_contrast_scale",
              "local_exposure_shadow_contrast_scale", "film_slope", "film_toe", "film_shoulder", "film_black_clip",
              "film_white_clip", "white_temp", "color_gain", "color_grading_intensity", "lumen_scene_lighting_quality",
              "lumen_final_gather_quality", "lumen_scene_detail", "lumen_ray_lighting_mode", "lumen_diffuse_color_boost",
              "lumen_front_layer_translucency_reflections", "motion_blur_amount", "path_tracing_max_bounces",
              "path_tracing_samples_per_pixel", "path_tracing_max_path_intensity", "path_tracing_enable_emissive_materials",
              "path_tracing_enable_reference_atmosphere", "path_tracing_enable_denoiser",
              "path_tracing_include_indirect_emissive"]  # Lighting Components > Indirect Emissive [verify name]


def collect_ppvs():
    """[{label, unbound, priority, values: {overridden fields only}}] for ppv_lint."""
    u = _ue()
    out = []
    for a in level_actors(u.PostProcessVolume):
        r = read_pp(a, _PP_FIELDS)
        vals = {}
        for k, (ov, v) in r.items():
            if ov:
                if hasattr(v, "r") and hasattr(v, "g"):
                    v = (v.r, v.g, v.b)
                elif hasattr(v, "x") and hasattr(v, "w"):
                    v = (v.x, v.y, v.z, v.w)
                elif not isinstance(v, (int, float, bool, str)):
                    v = _enum_name(v).upper()
                vals[k] = v
        out.append({"label": _label(a), "unbound": bool(a.get_editor_property("unbound")),
                    "priority": float(a.get_editor_property("priority")), "values": vals})
    return out


def collect_rooms(tag="room"):
    """{name: {"min", "max"}} from actors tagged 'room' (volumes placed by scenario-unreal-world-building)."""
    out = {}
    for a in level_actors():
        tags = [str(t).lower() for t in (a.get_editor_property("tags") or [])]
        if tag in tags:
            o, e = a.get_actor_bounds(False)
            out[_label(a)] = {"min": (o.x - e.x, o.y - e.y, o.z - e.z), "max": (o.x + e.x, o.y + e.y, o.z + e.z)}
    return out


def build_exterior_rig(rig, folder="Lighting/Exterior"):
    """Spawn the exterior_rig_plan() actors and set them. Returns {label: actor}. Existing actors of the
    same labels are reused, never deleted."""
    u = _ue()
    eas = u.get_editor_subsystem(u.EditorActorSubsystem)
    existing = {_label(a): a for a in level_actors()}
    made = {}

    def get(cls_name, label, rot=(0, 0, 0)):
        if label in existing:
            return existing[label]
        a = eas.spawn_actor_from_class(getattr(u, cls_name), _vec((0, 0, 0)), _rot(rot))
        a.set_actor_label(label)
        try:
            a.set_folder_path(folder)
        except Exception:
            pass
        return a
    with u.ScopedEditorTransaction("ue_light exterior rig"):
        made["SkyAtmosphere"] = get("SkyAtmosphere", "SkyAtmosphere")
        for L in rig["lights"]:
            a = get("DirectionalLight", L["label"], L["rotation"])
            a.set_actor_rotation(_rot(L["rotation"]), False)
            comp = a.get_component_by_class(u.DirectionalLightComponent)
            props = {k: L[k] for k in ("light_source_angle", "atmosphere_sun_light", "atmosphere_sun_light_index",
                                        "volumetric_scattering_intensity") if k in L}
            set_light_physical(comp, intensity=L["intensity"], color=L.get("light_color"), mobility=L.get("mobility"), **props)
            if "allow_mega_lights" in L:
                try:
                    comp.set_editor_property("allow_mega_lights", bool(L["allow_mega_lights"]))
                except Exception:
                    pass
            made[L["label"]] = a
        sl = get("SkyLight", "SkyLight")
        slc = sl.get_component_by_class(u.SkyLightComponent)
        slc.set_editor_property("mobility", u.ComponentMobility.MOVABLE)
        slc.set_editor_property("real_time_capture", True)
        slc.set_editor_property("lower_hemisphere_is_black", False)
        made["SkyLight"] = sl
        fog = get("ExponentialHeightFog", "HeightFog")
        fc = fog.get_component_by_class(u.ExponentialHeightFogComponent)
        for k, v in rig["fog"].items():
            if k in ("class", "needs_project_setting"):
                continue
            fc.set_editor_property(k, _color(v) if isinstance(v, tuple) else v)
        made["HeightFog"] = fog
        if rig.get("clouds"):
            made["VolumetricCloud"] = get("VolumetricCloud", "VolumetricCloud")
    return made


def view_from(camera_label):
    """Put the level viewport at a bookmark camera (CameraActor or CineCameraActor label) [verify API;
    5.8 also adds per-viewport camera functions on LevelEditorSubsystem]."""
    u = _ue()
    cam = next((a for a in level_actors() if _label(a) == camera_label), None)
    if cam is None:
        raise KeyError("no camera labelled %r" % camera_label)
    u.get_editor_subsystem(u.UnrealEditorSubsystem).set_level_viewport_camera_info(cam.get_actor_location(), cam.get_actor_rotation())
    return cam


def set_mi_scalar(mi_path, param, value):
    """Set a scalar on a material instance (for example the neon's EmissiveIntensity after exposure is
    calibrated). The parameter name comes from scenario-unreal-materials' master material."""
    u = _ue()
    mi = u.load_asset(mi_path)
    u.MaterialEditingLibrary.set_material_instance_scalar_parameter_value(mi, param, float(value))
    return mi


CALIBRATOR_MESH = "/Engine/EditorMeshes/ColorCalibrator/SM_ColorCalibrator"  # chrome, grey spheres, chart [verify path]


def spawn_calibrator(location, label="Probe_Calibrator", hidden_in_game=True):
    """Chrome and grey probes at the subject, placed BEFORE any light (Faucher BGoaPyfZlYg [00:01:34]:
    the chrome ball shows what the environment reflects; Gobey: Macbeth chart for albedo). Hidden in
    game so the final render skips it; editor screenshots still show it. Reuses an actor with the same
    label (moved to `location`), never duplicates."""
    u = _ue()
    for a in level_actors():
        if _label(a) == label:
            a.set_actor_location(_vec(location), False, False)
            return a
    mesh = u.load_asset(CALIBRATOR_MESH)
    a = u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_object(mesh, _vec(location))
    a.set_actor_label(label)
    a.set_actor_hidden_in_game(bool(hidden_in_game))
    return a


_EXECUTOR = None  # module-level: the executor must not be garbage collected mid-render (scripting doc)
_KEEP = []  # the transient queue, job and callback stay referenced for the same reason


def queue_mrg_still(sequence_path, map_path, graph_path, variables, job_name="LightingStill", on_done=None):
    """Render one Movie Render Graph job with exposed-variable overrides (never node defaults: they dirty
    the shared graph), in PIE, from a transient queue so the user's queued jobs are never touched (same
    choice as ue_review.render_still, which sets only output folder and frame range). Asynchronous:
    the log gets UE_LIGHT_MRG_DONE; wait for it in a later call. Job and variable calls follow the MRG
    scripting doc (5.7 reference); `executor.execute(queue)` on a transient queue is [verify]."""
    global _EXECUTOR
    u = _ue()
    if not hasattr(u, "MoviePipelineQueue"):
        raise RuntimeError("MoviePipelineQueue missing: enable the Movie Render Queue plugin (never clear the user's queue)")
    queue = u.MoviePipelineQueue()
    job = queue.allocate_new_job(u.MoviePipelineExecutorJob)
    job.set_editor_property("sequence", u.SoftObjectPath(sequence_path))
    job.set_editor_property("map", u.SoftObjectPath(map_path))
    job.set_editor_property("job_name", job_name)
    graph = u.load_asset(graph_path)
    job.set_graph_preset(graph)
    va = job.get_or_create_variable_overrides(graph)
    found = set()
    for v in graph.get_variables():
        n = str(v.get_member_name())
        if n in variables:
            val = variables[n]
            s = ("true" if val else "false") if isinstance(val, bool) else str(val)
            va.set_value_serialized_string(v, s)
            va.set_variable_assignment_enable_state(v, True)
            found.add(n)
    missing = sorted(set(variables) - found)

    def _done(executor, success):
        u.log("UE_LIGHT_MRG_DONE success=%s" % success)
        if on_done:
            on_done(executor, success)
    _EXECUTOR = u.MoviePipelinePIEExecutor()
    _EXECUTOR.on_executor_finished_delegate.add_callable_unique(_done)
    _KEEP.extend([queue, job, _done])
    _EXECUTOR.execute(queue)
    return {"job": job_name, "variables_set": sorted(found), "variables_missing": missing}


def log_mark(tag):
    """Write a marker to the log; log_since(tag) later returns what followed (dumps, warnings)."""
    _ue().log("UE_LIGHT_MARK %s" % tag)
    return tag


def _log_file():
    u = _ue()
    d = u.Paths.project_log_dir()
    logs = [os.path.join(d, f) for f in os.listdir(d) if f.endswith(".log")]
    return max(logs, key=os.path.getmtime) if logs else None


def log_since(tag, path=None):
    path = path or _log_file()
    if not path:
        return ""
    with open(path, errors="ignore") as f:
        text = f.read()
    i = text.rfind("UE_LIGHT_MARK %s" % tag)
    return text[i:] if i >= 0 else ""


_PROBE_PROPS = {
    "PointLightComponent": ["intensity", "intensity_units", "attenuation_radius", "source_radius", "source_length", "use_temperature",
                            "temperature", "cast_shadows", "max_draw_distance", "indirect_lighting_intensity",
                            "volumetric_scattering_intensity", "allow_mega_lights", "mega_lights_shadow_method", "lighting_channels",
                            "affects_world", "cast_raytraced_shadow"],
    "SpotLightComponent": ["outer_cone_angle", "inner_cone_angle"],
    "RectLightComponent": ["source_width", "source_height", "barn_door_angle", "barn_door_length"],
    "DirectionalLightComponent": ["light_source_angle", "atmosphere_sun_light", "atmosphere_sun_light_index", "cast_cloud_shadows"],
    "SkyLightComponent": ["real_time_capture", "cubemap_resolution", "sky_distance_threshold", "lower_hemisphere_is_black", "source_type"],
    "ExponentialHeightFogComponent": ["enable_volumetric_fog", "volumetric_fog_scattering_distribution", "fog_inscattering_luminance",
                                      "directional_inscattering_luminance", "fog_density", "fog_height_falloff"],
    "CineCameraComponent": ["current_aperture", "post_process_settings", "post_process_blend_weight"],
    "StaticMeshComponent": ["emissive_light_source", "lighting_channels", "cast_shadow"],
    "Material": ["blend_mode", "shading_model", "translucency_lighting_mode", "refraction_method"],
}
_PROBE_CLASSES = ["PostProcessVolume", "PostProcessSettings", "AutoExposureMethod", "LightUnits", "ComponentMobility",
                  "LumenRayLightingModeOverride", "MegaLightsShadowMethod", "SkyAtmosphere", "VolumetricCloud", "ExponentialHeightFog",
                  "RectLight", "MoviePipelineQueueSubsystem", "MoviePipelinePIEExecutor", "MovieGraphConfig", "MoviePipelineExecutorJob",
                  "CineCameraActor", "ScopedEditorTransaction", "EditorActorSubsystem", "UnrealEditorSubsystem",
                  "BlendMode", "TranslucencyLightingMode", "RefractionMode", "Material", "LightingChannels"]
_PROBE_CVARS = ["r.DynamicGlobalIlluminationMethod", "r.ReflectionMethod", "r.Shadow.Virtual.Enable", "r.RayTracing",
                "r.Lumen.HardwareRayTracing", "r.MegaLights.EnableForProject", "r.MegaLights.Allow", "r.MegaLights.DirectionalLights",
                "r.MegaLights.DirectionalLightSampleFraction", "r.PathTracing", "r.EyeAdaptation.CachedLightingPreExposure",
                "r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange", "r.AntiAliasingMethod", "r.Lumen.TraceMeshSDFs",
                "r.TemporalAASamples", "r.TemporalAA.NumSamples", "r.Shadow.Virtual.Stats", "r.Shadow.Virtual.ShowStats",
                "r.MegaLights.DownsampleMode", "r.PathTracing.Denoiser.Name", "r.PathTracing.TemporalDenoiser.Name",
                "sg.GlobalIlluminationQuality", "sg.ReflectionQuality", "r.SupportSkyAtmosphereAffectsHeightFog",
                "r.PathTracing.EnableEmissive", "r.PathTracing.VisibleLights", "r.MegaLights.HardwareRayTracing.EvaluateMaterialMode",
                "r.BufferVisualizationTarget"]


def probe():
    """Answer the [verify] list in the installed editor: classes, enums, property names, cvar values,
    PostProcessSettings fields. Nothing is changed. Returns a dict (write it to JSON and read it)."""
    u = _ue()
    res = {"engine": None, "classes": {}, "props": {}, "pp_fields": {}, "cvars": {}, "enums": {}}
    try:
        res["engine"] = u.SystemLibrary.get_engine_version()
    except Exception as e:
        res["engine"] = repr(e)
    for c in _PROBE_CLASSES:
        res["classes"][c] = hasattr(u, c)
    for cls, props in _PROBE_PROPS.items():
        if not hasattr(u, cls):
            res["props"][cls] = "class missing"
            continue
        try:
            obj = u.get_default_object(getattr(u, cls))
        except Exception as e:
            res["props"][cls] = "no CDO: %r" % e
            continue
        res["props"][cls] = {}
        for p in props:
            try:
                obj.get_editor_property(p)
                res["props"][cls][p] = True
            except Exception:
                res["props"][cls][p] = False
    try:
        pps = u.PostProcessSettings()
        fields = set(_PP_FIELDS) | set(pp_values_for_exposure(exposure_plan("gameplay"))) | set(look_values(True))
        fields |= {"local_exposure_detail_strength", "histogram_log_min", "histogram_log_max", "camera_iso",
                   "camera_shutter_speed", "depth_of_field_fstop", "lumen_scene_view_distance", "lumen_max_trace_distance"}
        for fld in sorted(fields):
            ok = True
            try:
                pps.get_editor_property(fld)
                pps.get_editor_property("override_" + fld)
            except Exception:
                ok = False
            res["pp_fields"][fld] = ok
    except Exception as e:
        res["pp_fields"] = "PostProcessSettings failed: %r" % e
    for c in _PROBE_CVARS:
        try:
            res["cvars"][c] = cvar_value(c)
        except Exception as e:
            res["cvars"][c] = "err %r" % e
    for en in ("AutoExposureMethod", "LightUnits", "LumenRayLightingModeOverride", "MegaLightsShadowMethod",
               "BlendMode", "TranslucencyLightingMode", "RefractionMode"):
        if hasattr(u, en):
            res["enums"][en] = [n for n in dir(getattr(u, en)) if n.isupper()]
    res["movie_graph_classes"] = sorted(n for n in dir(u) if n.startswith("MovieGraph"))[:400]
    return res


def lighting_manifest(path, context=None):
    """Handoff JSON for scenario-unreal-cinematics and scenario-unreal-performance: lights, PPVs, lint, cheats, cvars read back."""
    lights = collect_lights()
    ppvs = collect_ppvs()
    rooms = collect_rooms()
    ctx = dict(context or {})
    ctx.setdefault("rooms", rooms)
    emissives = _safe(collect_emissive_meshes)
    data = {"lights": lights, "ppvs": ppvs, "rooms": rooms,
            "light_lint": light_lint(lights, ctx), "ppv_lint": ppv_lint(ppvs, ctx),
            "cheats": cheat_inventory(lights, ppvs), "cvars": {c: _safe(cvar_value, c) for c in _PROBE_CVARS},
            "emissive_light_pairs": emissive_fixture_pairs(lights, emissives) if isinstance(emissives, list) else emissives,
            "masked_casters": _safe(collect_masked_casters)}
    with open(path, "w") as f:
        json.dump(data, f, indent=1, default=str)
    return path


def _safe(fn, *a):
    try:
        return fn(*a)
    except Exception as e:
        return "err %r" % e


# --------------------------------------------------------------------------------------------------
# CLI (offline)
# --------------------------------------------------------------------------------------------------
def _frac(s):
    if "/" in s:
        a, b = s.split("/")
        return float(a) / float(b)
    return float(s)


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(prog="ue_light", description="scenario-unreal-lighting-rendering offline tools")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("exposure", help="EV100 from a camera, or a camera for an EV100")
    p.add_argument("--ev", type=float)
    p.add_argument("--iso", type=float)
    p.add_argument("--shutter", default="1/48")
    p.add_argument("--aperture", type=float)
    p = sub.add_parser("units", help="convert a light intensity")
    p.add_argument("value", type=float)
    p.add_argument("units")
    p.add_argument("kind")
    p.add_argument("--cone", type=float, default=44.0)
    p = sub.add_parser("frame", help="lighting checks on a frame")
    p.add_argument("image")
    p.add_argument("--brief")
    p.add_argument("--reference")
    p.add_argument("--out")
    p = sub.add_parser("compare", help="realtime vs path tracer per region")
    p.add_argument("realtime")
    p.add_argument("pathtraced")
    p.add_argument("--brief")
    p.add_argument("--diff")
    p = sub.add_parser("still-plan")
    p.add_argument("--renderer", default="path_traced")
    p.add_argument("--quality", default="final")
    p.add_argument("--delivery", default="direct")
    p.add_argument("--motion-blur", action="store_true")
    p.add_argument("--glass", action="store_true")
    p = sub.add_parser("lint-lights")
    p.add_argument("lights_json")
    p.add_argument("--context")
    p = sub.add_parser("lint-ini")
    p.add_argument("ini")
    p.add_argument("--wants", default="lumen,vsm,megalights,path_tracer,extended_range")
    p = sub.add_parser("budget")
    p.add_argument("log")
    p.add_argument("--fps", type=int, default=60)
    p = sub.add_parser("albedo", help="albedo audit on a Base Color buffer capture")
    p.add_argument("image")
    p.add_argument("--renderer", default="path_traced")
    a = ap.parse_args(argv)
    if a.cmd == "exposure":
        if a.ev is not None:
            r = camera_for_ev100(a.ev, _frac(a.shutter), iso=a.iso, aperture=a.aperture)
        else:
            r = {"ev100": ev100_from_camera(a.aperture, _frac(a.shutter), a.iso)}
    elif a.cmd == "units":
        cd = to_candela(a.value, a.units, a.kind, a.cone)
        r = {"candelas": cd, "lumens": candela_to_lumens(cd, a.kind, a.cone), "unitless": cd * UNITLESS_PER_CANDELA}
    elif a.cmd == "frame":
        brief = json.loads(Path(a.brief).read_text()) if a.brief else {}
        r = frame_report(a.image, brief, a.reference)
        r["brief_regions"] = brief.get("regions")
        if a.out:
            write_report(r, a.out, a.image)
    elif a.cmd == "compare":
        brief = json.loads(Path(a.brief).read_text()) if a.brief else {}
        r = compare_ground_truth(a.realtime, a.pathtraced, brief.get("regions"), a.diff)
    elif a.cmd == "still-plan":
        pl = still_plan(a.renderer, a.quality, a.delivery, a.motion_blur, a.glass)
        r = {"plan": pl, "lint": mrg_lint(pl), "variables": mrg_variables(pl)}
    elif a.cmd == "lint-lights":
        r = light_lint(json.loads(Path(a.lights_json).read_text()), json.loads(Path(a.context).read_text()) if a.context else None)
    elif a.cmd == "lint-ini":
        r = render_settings_report(Path(a.ini).read_text(), tuple(a.wants.split(",")))
    elif a.cmd == "budget":
        r = pass_budget(profilegpu_passes(Path(a.log).read_text(errors="ignore")), a.fps)
    elif a.cmd == "albedo":
        r = albedo_check(a.image, renderer=a.renderer)
    print(json.dumps(r, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
