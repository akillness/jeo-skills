"""
ut_world: the level and environment artist's runner-side toolkit (scenario-unity-world-building skill).

Imports the shared toolkit from <skills>/scenario-unity-expert/scripts (ut_env, ut_run, ut_review, ut_stat);
never copies it. Adds the world-building jobs and their gates:

    import sys; sys.path.insert(0, "<skills>/scenario-unity-world-building/scripts")
    import ut_world
    P = ut_world.project("<root>/tests/projects/unity-world-building")   # clone of Base3D_URP + packages + kit
    t = ut_world.build_island(P)                   # TerrainData route: heights, erosion, splat, trees, details, road
    b = ut_world.build_village(P)                  # ProBuilder blockout from a plan in metres + NavMesh reachability
    k = ut_world.build_kit(P)                      # modular prefab kit on a 2.5 m grid, bulk replace, clutter scatter
    v = ut_world.setup_views(P)                    # bookmarks, tour anchors, landmark sightlines, fog
    c = ut_world.capture(P)                        # AgentCapture.CaptureViews of the bookmarks + top-down, reviewed
    s = ut_world.split_streaming(P)                # core + chunk scenes, build list by path
    r = ut_world.streaming_tests(P)                # PlayMode tests with timings (loads, unloads, queue stall)
    e = ut_world.editmode_tests(P)                 # generators: determinism, seams, erosion, A* road, WFC x500
    p = ut_world.tour_profile(P, target_fps=60)    # AgentProfile over the ProfileTour + per-anchor budget check
    a = ut_world.audit(P, mobile=True)             # terrain audit in a fresh editor (findings format)
    ut_world.raw_roundtrip(P)                      # 16-bit RAW heightmap export + import (DCC route)
    ut_world.set_terrain_settings(P, detail_distance=60)   # per-tile settings (incl. non-batchable), before/after
    ut_world.set_tree_lods(P, cull=0.045)          # the distance lever for LOD Group trees
  v0.2 (refactor after the blind grade):
    g = ut_world.audit_guidance(P)                 # coast sectors, walk-back, empty arcs, false peaks, landmark from sea
    ut_world.add_coast_content(P, g["gate"]["arcs"])   # placeholder POIs at the empty-arc midpoints, then re-audit
    n = ut_world.kit_nav_gate(P)                   # door leaves cut the NavMesh, modifiers, roof and upper-floor islands, links
    y = ut_world.build_gym(P, metrics)             # gym lanes: doors x camera boom, ramps, steps, stairs (height mesh), gaps
    ut_world.gym_is_stale(P, metrics)              # rebuild the gym whenever the controller changes
    ut_world.polyshape_rebuild(P)                  # ProBuilder: rebuilding a PolyShape drops later edits; replay a recipe
    q = ut_world.capture_pops(P)                   # pop size at detail, LOD and cull distances, fog off and on
    r = ut_world.scene_report(P, memory_budget_mb=512)   # stream at all? counts, variety, memory estimate
    ut_world.build_proxies(P)                      # merged stand-ins for unloaded chunks (no pop across the island)
    s = ut_world.stream_probe(P)                   # development Player: Integrate marker vs budget, hitches, memory
    ut_world.compare_runs(before_csv, after_csv)   # Profile Analyzer style: ~200 frames per side, medians, U test
    ut_world.mark_generated(repo, [scene])         # git skip-worktree on regenerated scenes (Alba)

Every job prints one AGENT_RESULT line (AgentJob); every helper returns that envelope plus gate
verdicts. System python3 3.9+, stdlib only.
Run in Unity 6000.3.21f1 on macOS (Apple Silicon) on 2026-09-24: tests/code/unity-world-building/.
"""

__version__ = "0.1"  # scenario-unity-world-building v0.1 (2026-09-24, refactor after the Y2 blind grade)

import glob
import json
import math
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL_DIR)
CORE = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
if CORE not in sys.path:
    sys.path.insert(0, CORE)

import ut_env  # noqa: E402
import ut_review  # noqa: E402
import ut_run  # noqa: E402
import ut_stat  # noqa: E402

AGENTKIT_WORLD = os.path.join(HERE, "AgentKit")                 # -> Assets/Editor/AgentKit/World
RUNTIME_SRC = os.path.join(HERE, "Runtime", "World")            # -> Assets/AgentKitRuntime/World
RUNTIME_DST = os.path.join("Assets", "AgentKitRuntime", "World")

# Pinned package versions (6000.3.21f1 registry defaults, checked in packages-lock.json)
PACKAGES = {
    "com.unity.probuilder": "6.1.2",     # ProBuilder API (ShapeGenerator, EditorMeshUtility.Optimize)
    "com.unity.splines": "2.9.0",        # road splines
    "com.unity.ai.navigation": "2.0.14",  # NavMeshSurface reachability gate (already in the URP template)
}

ISLAND = "Assets/World/Scenes/World_Island.unity"
CORE_SCENE = "Assets/World/Scenes/World_Core.unity"
CHUNKS = ["Assets/World/Scenes/World_Chunk_Village.unity", "Assets/World/Scenes/World_Chunk_KitTown.unity"]


# ============================================================================ project setup
def pin_packages(project, packages=None):
    """Add or pin packages in Packages/manifest.json before the editor starts (Unity resolves on
    launch). Explicit versions: the editor manifest's defaults can lag the Manual (6.3 traps).
    Returns {name: (old, new)} for what changed."""
    root = ut_env.find_project(project)["root"]
    path = os.path.join(root, "Packages", "manifest.json")
    with open(path) as f:
        m = json.load(f)
    changed = {}
    for name, ver in (packages or PACKAGES).items():
        old = m["dependencies"].get(name)
        if old != ver:
            m["dependencies"][name] = ver
            changed[name] = (old, ver)
    if changed:
        m["dependencies"] = dict(sorted(m["dependencies"].items()))
        with open(path, "w") as f:
            json.dump(m, f, indent=2)
    return changed


def resolved_versions(project, names=None):
    """Versions Unity actually resolved (Packages/packages-lock.json), after one editor start."""
    root = ut_env.find_project(project)["root"]
    path = os.path.join(root, "Packages", "packages-lock.json")
    if not os.path.isfile(path):
        return {}
    with open(path) as f:
        deps = json.load(f).get("dependencies", {})
    return {n: deps.get(n, {}).get("version") for n in (names or PACKAGES)}


def install(project):
    """Core AgentKit (ut_env.install_agentkit) + this skill's Editor jobs + the runtime assembly
    (WorldNoise, WorldStreamer, ProfileTour, Wfc; asmdef AgentKit.World.Runtime, auto-referenced).
    Returns the files written."""
    root = ut_env.find_project(project)["root"]
    written = ut_env.install_agentkit(root)
    written += ut_env.install_agentkit(root, src=AGENTKIT_WORLD)
    dst = os.path.join(root, RUNTIME_DST)
    os.makedirs(dst, exist_ok=True)
    for fn in sorted(os.listdir(RUNTIME_SRC)):
        if not fn.endswith((".cs", ".asmdef")):
            continue
        s, d = os.path.join(RUNTIME_SRC, fn), os.path.join(dst, fn)
        with open(s, "rb") as fs:
            data = fs.read()
        if os.path.isfile(d):
            with open(d, "rb") as fd:
                if fd.read() == data:
                    continue
        with open(d, "wb") as fd:
            fd.write(data)
        written.append(os.path.relpath(d, root))
    return written


def project(dest, kind="3d"):
    """APFS clone of the base project (ut_env.base_project), packages pinned, kit installed."""
    p = ut_env.base_project(kind, dest)
    pin_packages(p)
    install(p)
    return p


# ============================================================================ jobs
def _job(project, method, args=None, graphics=False, timeout=1800, quit=True):
    r = ut_run.run_method(project, method, args or {}, graphics=graphics, timeout=timeout, quit=quit)
    if not r.get("ok"):
        r.setdefault("error", "job failed")
    return r


def build_island(project, **args):
    """WorldTerrain.BuildIsland: resolutions first, fBm + erosion + levellers + road, splat rules,
    LOD trees, instanced details. Gate: heightmap 2^n+1, detail patch 16, trees and grass > 0."""
    a = {"scene": ISLAND}
    a.update(args)
    r = _job(project, "AgentKit.World.WorldTerrain.BuildIsland", a, timeout=2400)
    res = r.get("result") or {}
    r["gate"] = {
        "pow2_plus_1": bool(res.get("heightmap_pow2_plus_1")),
        "detail_patch_16": res.get("detail_per_patch") == 16,
        "trees": (res.get("trees") or 0) > 0,
        "grass": ((res.get("detail_instances") or {}).get("grass") or 0) > 0,
        "distinct_seeds": len(set(res.get("detail_seeds") or [])) == len(res.get("detail_seeds") or []),
    }
    r["gate"]["ok"] = r.get("ok", False) and all(r["gate"].values())
    return r


def raw_roundtrip(project, scene=ISLAND, raw="Library/AgentKit/island_1025.raw"):
    """ExportRaw (16-bit little-endian) then ImportRaw into a new TerrainData: the heightmap-file
    route (World Machine, Gaea, Houdini, Terrain Settings > Import Raw). Gate: identical hash."""
    e = _job(project, "AgentKit.World.WorldTerrain.ExportRaw", {"scene": scene, "path": raw})
    i = _job(project, "AgentKit.World.WorldTerrain.ImportRaw", {"path": raw}) if e.get("ok") else {"ok": False, "result": None}
    er, ir = e.get("result") or {}, i.get("result") or {}
    return {"ok": bool(e.get("ok") and i.get("ok")), "export": er, "import": ir,
            "gate": {"ok": bool(er) and bool(ir) and er.get("hash") == ir.get("hash") and er.get("resolution") == ir.get("resolution")},
            "errors": [e.get("error"), i.get("error")]}


def set_terrain_settings(project, scene=ISLAND, **settings):
    """WorldTerrain.SetTerrainSettings: per-tile values (tree_distance, detail_distance, pixel_error,
    basemap_distance, detail_density, cast_shadows) with before/after on record."""
    a = {"scene": scene}
    a.update(settings)
    return _job(project, "AgentKit.World.WorldTerrain.SetTerrainSettings", a)


def set_tree_lods(project, lod0=0.18, cull=0.045, scene=ISLAND):
    """WorldTerrain.SetTreeLods: the distance lever for LOD Group trees (treeDistance is ignored)."""
    return _job(project, "AgentKit.World.WorldTerrain.SetTreeLods", {"scene": scene, "lod0": lod0, "cull": cull})


def audit_terrain(project, scene=ISLAND, mobile=False, erosion=True):
    return _job(project, "AgentKit.World.WorldTerrain.AuditTerrain", {"scene": scene, "mobile": mobile, "erosion": erosion})


def build_village(project, **args):
    """WorldBlockout.BuildVillage: ProBuilder greybox from a plan in metres, metrics from the agent,
    prefab per building, NavMesh reachability. Gate: every door fits the agent, every building
    reachable from the plaza, blockout audit without errors."""
    a = {"scene": ISLAND}
    a.update(args)
    r = _job(project, "AgentKit.World.WorldBlockout.BuildVillage", a)
    res = r.get("result") or {}
    nav = res.get("navmesh") or {}
    r["gate"] = {
        "doors_fit_agent": all(d.get("fits_agent") for d in res.get("doors") or [{}]),
        "all_reachable": bool(nav.get("all_reachable")),
        "audit_no_errors": ((res.get("audit") or {}).get("counts") or {}).get("error", 1) == 0,
        "uv2_everywhere": ((res.get("audit") or {}).get("probuilder_meshes") or 0) > 0 and (res.get("audit") or {}).get("with_uv2") == (res.get("audit") or {}).get("probuilder_meshes"),
    }
    r["gate"]["ok"] = r.get("ok", False) and all(r["gate"].values())
    return r


def build_kit(project, **args):
    """WorldKit.BuildKitTown: kit prefabs (2.5 m grid, corner pivots) + Prefab Variants, houses from
    a plan: generic walls first, bulk replace with door and window walls (placement recorded as an
    override first, then restored: v0.2), clutter by raycast, each house saved as a compound prefab.
    Gate: audit without errors, no hovering clutter, replacements happened, variants exist, no two
    pieces on one slot, every perimeter cell walled."""
    a = {"scene": ISLAND}
    a.update(args)
    r = _job(project, "AgentKit.World.WorldKit.BuildKitTown", a)
    res = r.get("result") or {}
    au = res.get("audit") or {}
    r["gate"] = {
        "audit_no_errors": (au.get("counts") or {}).get("error", 1) == 0,
        "audit_no_warnings": (au.get("counts") or {}).get("warn", 1) == 0,
        "no_hovering": au.get("hovering", 1) == 0,
        "replaced": (res.get("replaced") or 0) > 0,
        "variants": (res.get("variants") or 0) >= 6,
        "clutter_placed": ((res.get("clutter") or {}).get("placed") or 0) > 0,
        "no_stacked_pieces": au.get("stacked", 1) == 0,          # v0.2: a replace that loses its transform stacks pieces
        "no_missing_walls": au.get("missing_walls", 1) == 0,     # and leaves perimeter holes the grid checks miss
    }
    r["gate"]["ok"] = r.get("ok", False) and all(r["gate"].values())
    return r


def audit_kit(project, scene=ISLAND, root="KitTown"):
    """WorldKit.AuditKitTown on a kit already in the scene: grid, storeys, yaw, prefab links, hovering and
    overlapping clutter, stacked pieces, perimeter cells without a wall."""
    return _job(project, "AgentKit.World.WorldKit.AuditKitTown", {"scene": scene, "root": root})


def setup_views(project, **args):
    """WorldScenes.SetupViews: AgentView_* bookmarks, TourAnchor_* + ProfileTour, landmark
    sightlines, spawn facing the landmark, fog. Gate: every anchor is guided (sees a landmark, or
    stands on the main path), the spawn sees a landmark and faces it (dot >= 0.7, e-book)."""
    a = {"scene": ISLAND}
    a.update(args)
    r = _job(project, "AgentKit.World.WorldScenes.SetupViews", a)
    res = r.get("result") or {}
    g = res.get("guided") or "0/1"
    n_g, n_all = (int(x) for x in g.split("/"))
    r["gate"] = {"every_anchor_guided": n_g == n_all and n_all > 0, "spawn_sees_landmark": bool(res.get("spawn_sees_landmark")),
                 "spawn_faces_landmark": (res.get("spawn_facing_landmark_dot") or 0) >= 0.7,
                 "bookmarks": len(res.get("bookmarks") or []) >= 5}
    r["gate"]["ok"] = r.get("ok", False) and all(r["gate"].values())
    return r


def set_atmosphere(project, fog=True, density=0.0015, scene=ISLAND):
    return _job(project, "AgentKit.World.WorldScenes.SetAtmosphere", {"scene": scene, "fog": fog, "fog_density": density})


TOPDOWN = {"name": "Z_TopDown", "position": [500, 250, 500], "rotation": [90, 0, 0], "ortho_size": 520, "far": 600}


def capture(project, scene=ISLAND, width=1280, height=720, extra_views=None, sheet=None, label=None):
    """AgentKit.AgentCapture.CaptureViews on the AgentView_* bookmarks plus a top-down orthographic
    view (graphics on; AgentCapture renders a warm-up frame first). Runs ut_review on every PNG and
    builds a contact sheet you must OPEN and look at. Gate: no blank, black, white or magenta frame."""
    views = [TOPDOWN] + list(extra_views or [])
    c = ut_run.run_method(project, "AgentKit.AgentCapture.CaptureViews",
                          {"scene": scene, "views": views, "scene_bookmarks": True, "width": width, "height": height},
                          graphics=True, timeout=1200)
    if not c.get("ok"):
        return c
    rev = ut_review.review_capture(c, sheet=sheet)
    c["review"] = rev
    flags = []
    for fr in rev["frames"]:
        ch = fr["checks"]
        for k in ("all_white", "all_black", "uniform", "magenta", "blank"):
            if ch.get(k):
                flags.append((os.path.basename(fr["path"]), k))
    c["gate"] = {"ok": not flags, "flags": flags, "sheet": rev.get("sheet"), "label": label}
    return c


def split_streaming(project, **args):
    """WorldScenes.SplitForStreaming: core + chunk scenes, build list by path, WorldStreamer.
    Gate: no light in chunks, core active, no duplicate scene names in the build list."""
    r = _job(project, "AgentKit.World.WorldScenes.SplitForStreaming", args)
    res = r.get("result") or {}
    r["gate"] = {
        "no_lights_in_chunks": all(c.get("lights_in_chunk") == 0 for c in res.get("chunks") or [{}]),
        "core_active": res.get("active_scene") == CORE_SCENE,
        "unique_scene_names": res.get("duplicate_scene_names") == [],
    }
    r["gate"]["ok"] = r.get("ok", False) and all(r["gate"].values())
    return r


# ============================================================================ tests and profiling
TEST_FILTER = "AgentWorld"


def editmode_tests(project):
    """EditMode tests of the generators (determinism, clamps, seams, erosion bounds, A* road, WFC x500).
    ut_run.run_tests (never -quit). Reads the JSON side reports the tests write."""
    r = ut_run.run_tests(project, "EditMode", filter=TEST_FILTER)
    root = ut_env.find_project(project)["root"]
    for name in ("world_erosion_test", "world_wfc_test"):
        path = os.path.join(root, "Library", "AgentKit", name + ".json")
        if os.path.isfile(path):
            with open(path) as f:
                r[name] = json.load(f)
    return r


def streaming_tests(project):
    """PlayMode streaming tests (two chunks loaded and unloaded with timings, held-activation queue
    stall, WorldStreamer by distance). Returns the NUnit summary plus the timings JSON."""
    r = ut_run.run_tests(project, "PlayMode", filter=TEST_FILTER)
    path = os.path.join(ut_env.find_project(project)["root"], "Library", "AgentKit", "world_streaming_timings.json")
    if os.path.isfile(path):
        with open(path) as f:
            r["timings"] = json.load(f)
    return r


def tour_budget(report, budget_ms=None, margin=1.0):
    """Per-anchor verdicts from a ProfileTour report (pure function): p95 against the budget, the
    worst heading kept (Alba: direction-dependent spikes). Returns {"verdict", "anchors", "worst"}."""
    budget = budget_ms or report.get("budgetMs") or 16.667
    rows, worst = [], None
    for a in report.get("anchors", []):
        v = "pass" if a["p95Ms"] <= budget * margin else ("warn" if a["p95Ms"] <= budget * 1.5 else "fail")
        row = {"anchor": a["name"], "p50_ms": round(a["p50Ms"], 3), "p95_ms": round(a["p95Ms"], 3), "max_ms": round(a["maxMs"], 3),
               "arrival_max_ms": round(a.get("arrivalMaxMs", 0), 3), "worst_yaw": a.get("worstYaw"),
               "max_batches": a.get("maxBatches"), "max_triangles": a.get("maxTriangles"), "verdict": v}
        rows.append(row)
        if worst is None or row["p95_ms"] > worst["p95_ms"]:
            worst = row
    order = {"pass": 0, "warn": 1, "fail": 2}
    verdict = max((r["verdict"] for r in rows), key=lambda x: order[x]) if rows else "fail"
    return {"verdict": verdict, "budget_ms": budget, "anchors": rows, "worst": worst}


def tour_profile(project, scene=ISLAND, target_fps=60.0, frames=None, warmup=60, width=1920, height=1080, timeout=1200):
    """AgentKit.AgentProfile.PlayModeTimings over a scene holding a ProfileTour (SetupViews adds it):
    AgentProfile records every frame of the tour to CSV (ut_stat.budget_check on cpu_frame_ms), the
    tour writes per-anchor stats (tour_budget). Editor Play mode: iteration numbers, not the verdict
    for a device (run the same tour in a development player for that)."""
    root = ut_env.find_project(project)["root"]
    tour_json = os.path.join(root, "Library", "AgentKit", "tour", "profile_tour.json")
    if os.path.isfile(tour_json):
        os.makedirs(os.path.join(root, "Library", "AgentKit", "tour", "archive"), exist_ok=True)
        shutil.move(tour_json, os.path.join(root, "Library", "AgentKit", "tour", "archive", "profile_tour_%d.json" % int(os.path.getmtime(tour_json))))
    n = frames or (6 * 8 * 12 + 24)
    r = ut_run.run_method(project, "AgentKit.AgentProfile.PlayModeTimings",
                          {"scene": scene, "frames": n, "warmup": warmup, "target_fps": target_fps, "width": width, "height": height},
                          graphics=True, quit=False, timeout=timeout)
    out = {"ok": r.get("ok"), "envelope": r, "error": r.get("error")}
    res = r.get("result") or {}
    budget = 1000.0 / target_fps
    if res.get("csv") and os.path.isfile(res["csv"]):
        cols = ut_stat.read_frame_csv(res["csv"])
        col = "cpu_frame_ms" if "cpu_frame_ms" in cols else "main_thread_ms"
        frames_ms = cols.get(col, [])
        out["csv"] = res["csv"]
        out["column"] = col
        out["budget"] = ut_stat.budget_check(frames_ms, budget, skip=5)
    if os.path.isfile(tour_json):
        with open(tour_json) as f:
            rep = json.load(f)
        out["tour"] = tour_budget(rep, budget)
        out["tour_json"] = tour_json
    else:
        out["tour"] = None
        out["error"] = (out.get("error") or "") + " no tour report (ProfileTour missing, or the run ended before one tour)"
    return out


def audit(project, scene=ISLAND, mobile=False):
    """Terrain audit (findings format) on the scene as a fresh editor loads it."""
    return audit_terrain(project, scene=scene, mobile=mobile)


# ============================================================================ v0.2: guidance, gym, navigation
def audit_guidance(project, scene=ISLAND, **args):
    """WorldGuidance.AuditGuidance: the island's edge as a swimmer meets it (climb out, walk back,
    nearest point of interest), landmark seen from the coast, every POI walks back to the spawn,
    false peaks. Gate (job side): every POI walks back and the longest empty coast arc <= max_empty_arc
    (default 300 m [added]); water-only pockets, a landmark seen from under half the coast and false
    peaks come back as gate["warnings"]. gate["arcs"] holds the midpoints of the arcs over the limit,
    to feed add_coast_content (then re-audit: each POI splits an arc)."""
    a = {"scene": scene}
    a.update(args)
    r = _job(project, "AgentKit.World.WorldGuidance.AuditGuidance", a)
    res = r.get("result") or {}
    g = dict(res.get("gate") or {"ok": False})
    g["arcs"] = [arc["midpoint"] for arc in res.get("empty_arcs") or [] if arc.get("length_m", 0) > a.get("max_empty_arc", 300)]
    g["longest_empty_arc_m"] = res.get("longest_empty_arc_m")
    g["ok"] = bool(r.get("ok")) and bool(g.get("ok"))
    r["gate"] = g
    return r


def add_coast_content(project, points, scene=ISLAND):
    """WorldGuidance.AddCoastContent: a placeholder blockout POI (cairn, POI_Cove_n) at each point."""
    return _job(project, "AgentKit.World.WorldGuidance.AddCoastContent", {"scene": scene, "points": [list(p) for p in points]})


def kit_nav_gate(project, scene=ISLAND, **args):
    """WorldNav.KitNavGate: closed door leaves baked as geometry cut the NavMesh; NavMeshModifier
    ignoreFromBuild restores the doors; every ground floor sampled on a 0.5 m grid must be >= 90 %
    reachable (clutter splits rooms); roofs are walkable islands until overridden to Not Walkable;
    upper floors stay islands until a NavMeshLink (stairs) joins them; overlapping surfaces are
    disabled for the gate and reported. Gate from the job."""
    a = {"scene": scene}
    a.update(args)
    r = _job(project, "AgentKit.World.WorldNav.KitNavGate", a)
    r["gate"] = (r.get("result") or {}).get("gate") or {"ok": False}
    r["gate"]["ok"] = bool(r.get("ok")) and bool(r["gate"].get("ok"))
    return r


GYM_METRICS = {"radius": 0.4, "height": 1.8, "slope": 45.0, "step": 0.3, "jump": 2.5,
               "cam_pivot": 1.6, "cam_shoulder": 0.5, "cam_boom": 3.5, "cam_pitch": 20.0, "cam_radius": 0.2}


def _gym_state(project):
    return os.path.join(ut_env.find_project(project)["root"], "Library", "AgentKit", "gym_metrics.json")


def gym_is_stale(project, metrics=None):
    """True when the gym was never built or was built for other controller metrics (the e-book: rebuild
    or retest the gym whenever the character controller changes). Pure file check, no Unity."""
    path = _gym_state(project)
    if not os.path.isfile(path):
        return True
    with open(path) as f:
        last = json.load(f)
    want = dict(GYM_METRICS)
    want.update(metrics or {})
    return any(abs(float(last.get(k, -1e9)) - float(v)) > 1e-6 for k, v in want.items())


def build_gym(project, metrics=None):
    """WorldGym.BuildGym: a gym scene measured lane by lane with the controller's metrics (NavMesh with
    those metrics, a CharacterController pushed up ramps and steps, a camera boom swept through each
    doorway, jump links for gaps within the jump distance, Build Height Mesh error on stairs).
    Records the metrics so gym_is_stale can tell when the controller changed."""
    m = dict(GYM_METRICS)
    m.update(metrics or {})
    r = _job(project, "AgentKit.World.WorldGym.BuildGym", {"metrics": m})
    if r.get("ok"):
        path = _gym_state(project)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(m, f, indent=1)
    return r


def polyshape_rebuild(project):
    """WorldGym.PolyShapeRebuild: rebuilding a PolyShape from its footprint drops a later Extrude
    (the GUI trap of re-entering the tool); replaying the recipe restores it."""
    return _job(project, "AgentKit.World.WorldGym.PolyShapeRebuild", {})


# ============================================================================ v0.2: popping, reports, proxies
def capture_pops(project, scene=ISLAND, width=960, height=540, fog_density=0.0015, sheet=True):
    """WorldTerrain.CapturePops (graphics) then ut_review.compare on each near/far pair: the changed
    fraction is what pops when the camera crosses the detail distance, the tree LOD0 to LOD1 switch and
    the tree cull, fog off and fog on. OPEN the sheet. Returns {"boundaries": [{boundary, distance_m,
    clear: {changed_fraction, mean_abs_diff}, fog: {...}}], "sheet"}."""
    r = ut_run.run_method(project, "AgentKit.World.WorldTerrain.CapturePops",
                          {"scene": scene, "width": width, "height": height, "fog_density": fog_density},
                          graphics=True, timeout=1200)
    res = r.get("result") or {}
    rows, pngs = [], []
    for b in res.get("boundaries") or []:
        row = {"boundary": b.get("boundary"), "distance_m": b.get("distance_m"), "error": b.get("error")}
        shots = b.get("shots") or {}
        for fog in ("clear", "fog"):
            n, f = shots.get(fog + "_near"), shots.get(fog + "_far")
            if n and f and os.path.isfile(n) and os.path.isfile(f):
                c = ut_review.compare(n, f)
                row[fog] = {k: c.get(k) for k in ("changed_fraction", "mean_abs_diff")}
                pngs += [n, f]
        rows.append(row)
    out = {"ok": bool(r.get("ok")), "envelope": r, "boundaries": rows, "lod": {k: res.get(k) for k in ("lod_bias", "tree_lod_bias_multiplier", "tree_lod_size_m", "lod_thresholds")}}
    if sheet and pngs:
        out["sheet"] = ut_review.contact_sheet(pngs, os.path.join(os.path.dirname(pngs[0]), "pops_sheet.png"), cols=4,
                                               labels=[os.path.basename(p)[4:-4] for p in pngs]).get("path")
    return out


def scene_report(project, scenes=None, memory_budget_mb=None):
    """WorldStreaming.SceneReport: per scene counts, set-dressing variety and an Editor estimate of
    asset memory (shared assets once). Decide "stream at all?" before splitting (Alba stayed resident)."""
    a = {}
    if scenes:
        a["scenes"] = list(scenes)
    if memory_budget_mb:
        a["memory_budget_mb"] = memory_budget_mb
    return _job(project, "AgentKit.World.WorldStreaming.SceneReport", a)


def build_proxies(project, min_size=1.2):
    """WorldStreaming.BuildProxies: one merged stand-in per chunk in the core scene (WorldStreamer shows
    it while the chunk is unloaded)."""
    return _job(project, "AgentKit.World.WorldStreaming.BuildProxies", {"min_size": min_size})


def set_proxies(project, on=True):
    return _job(project, "AgentKit.World.WorldStreaming.SetProxies", {"on": on})


# ============================================================================ v0.2: streaming in a Player
PRIORITY_BUDGET_MS = {"Low": 2.0, "BelowNormal": 4.0, "Normal": 10.0, "High": 50.0}   # 6.3 Scripting API


def probe_verdict(report, target_fps=60.0, hitch_factor=2.0, mem_tolerance=0.05):
    """Pure verdict on a StreamProbe JSON: per priority, the Integrate marker's max ms per frame against
    the priority budget, frames over it, hitches (frames over hitch_factor x the frame budget, the
    ut_stat convention), load time; memory after unload + sweep back within mem_tolerance [added] of
    the baseline. Returns {"verdict", "priorities": {...}, "memory": {...}}."""
    frame_budget = 1000.0 / target_fps
    pri = {}
    for ld in report.get("loads") or []:
        p = pri.setdefault(ld["priority"], {"budget_ms": PRIORITY_BUDGET_MS.get(ld["priority"]), "loads": [],
                                            "max_integrate_ms": 0.0, "frames_over_budget": 0, "max_frame_ms": 0.0, "hitch_loads": 0})
        p["loads"].append({"scene": os.path.basename(ld["scene"]), "load_ms": round(ld["loadMs"], 1), "frames": ld["frames"],
                           "max_integrate_ms": round(ld["maxIntegrateMs"], 3), "max_frame_ms": round(ld["maxFrameMs"], 2),
                           "controls_max_ms": {c["marker"]: round(c["maxMs"], 3) for c in ld.get("controls") or []}})
        p["max_integrate_ms"] = max(p["max_integrate_ms"], ld["maxIntegrateMs"])
        p["frames_over_budget"] += ld["framesOverBudget"]
        p["max_frame_ms"] = max(p["max_frame_ms"], ld["maxFrameMs"])
        if ld["maxFrameMs"] > hitch_factor * frame_budget:
            p["hitch_loads"] += 1
    for name, p in pri.items():
        b = p["budget_ms"] or 0
        p["within_budget"] = p["max_integrate_ms"] <= b * 1.1 if b else None
        p["max_integrate_ms"] = round(p["max_integrate_ms"], 3)
        p["max_frame_ms"] = round(p["max_frame_ms"], 2)
    mem = {m["stage"]: round(m["totalUsedMb"], 1) for m in report.get("memory") or []}
    base = mem.get("baseline_core")
    back = {k: (base is not None and v <= base * (1 + mem_tolerance)) for k, v in mem.items() if k.startswith("swept_")}
    low = pri.get("Low", {})
    # a marker that never produced a sample proves nothing: without samples the verdict is "no-marker-data"
    sampled = any(ld.get("maxIntegrateMs", 0) > 0 for ld in report.get("loads") or [])
    ok = bool(report.get("integrateRecorderValid")) and not report.get("error") and bool(low.get("within_budget")) and all(back.values()) and bool(back)
    verdict = ("pass" if sampled else "no-marker-data") if ok else "fail"
    return {"verdict": verdict, "marker_sampled": sampled, "profiler_enabled": report.get("profilerEnabled"), "priorities": pri, "memory_mb": mem, "memory_back_to_baseline": back,
            "integrate_recorder_valid": report.get("integrateRecorderValid"), "markers_seen": report.get("markersSeen"), "error": report.get("error")}


def stream_probe(project, priorities=("Low", "High"), out="Builds/StreamProbe/StreamProbe.app", timeout=300, build_timeout=3600, snapshots=False):
    """Measure streaming where backgroundLoadingPriority applies: WorldStreaming.MakeStreamProbeScene,
    a macOS development build (probe scene first, core, chunks), then the Player run headless
    (-batchmode -logFile ... -streamProbeOut ...) until it quits. Returns the build summary, the probe
    JSON and probe_verdict. snapshots=True adds Memory Profiler snapshots (baseline, after the last
    sweep) for a Compare in the Memory Profiler window. The device verdict still needs the same probe on
    the target hardware."""
    root = ut_env.find_project(project)["root"]
    mk = _job(project, "AgentKit.World.WorldStreaming.MakeStreamProbeScene", {"priorities": list(priorities)})
    if not mk.get("ok"):
        return {"ok": False, "step": "scene", "envelope": mk}
    scenes = (mk.get("result") or {}).get("build_scenes")
    b = ut_run.build(project, "macos", out=out, development=True, scenes=scenes, timeout=build_timeout)
    if not b.get("ok"):
        return {"ok": False, "step": "build", "envelope": b}
    app = os.path.join(root, out)
    exes = glob.glob(os.path.join(app, "Contents", "MacOS", "*"))
    if not exes:
        return {"ok": False, "step": "run", "error": "no executable in " + app, "build": b.get("result")}
    run_dir = os.path.join(root, "Library", "AgentKit", "stream_probe")
    os.makedirs(run_dir, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    js, log = os.path.join(run_dir, "probe_%s.json" % stamp), os.path.join(run_dir, "player_%s.log" % stamp)
    t0 = time.time()
    cmd = [exes[0], "-batchmode", "-logFile", log, "-streamProbeOut", js]
    if snapshots:
        cmd += ["-streamProbeSnapshots", os.path.join(run_dir, "snapshots_%s" % stamp)]
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        code = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.terminate()                                   # graceful first
        try:
            code = proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()
            code = "killed"
    out_d = {"ok": False, "build": {k: (b.get("result") or {}).get(k) for k in ("result", "total_size_mb", "total_time_s", "output_path", "scenes")},
             "player_exit": code, "player_seconds": round(time.time() - t0, 1), "log": log, "json": js}
    if os.path.isfile(js):
        with open(js) as f:
            rep = json.load(f)
        out_d["report"] = rep
        out_d["verdict"] = probe_verdict(rep)
        out_d["ok"] = not rep.get("error")
    else:
        out_d["error"] = "the player wrote no probe JSON (see the player log)"
    return out_d


# ============================================================================ v0.2: offline helpers
def _median(v):
    v = sorted(v)
    n = len(v)
    return (v[n // 2] if n % 2 else 0.5 * (v[n // 2 - 1] + v[n // 2])) if n else None


def _pct(v, q):
    v = sorted(v)
    if not v:
        return None
    k = (len(v) - 1) * q
    f = int(math.floor(k))
    c = min(f + 1, len(v) - 1)
    return v[f] + (v[c] - v[f]) * (k - f)


def _mann_whitney_p(a, b):
    """Two-sided Mann-Whitney U p-value, normal approximation with tie correction (stdlib only)."""
    n1, n2 = len(a), len(b)
    if n1 < 8 or n2 < 8:
        return None
    allv = sorted([(x, 0) for x in a] + [(x, 1) for x in b])
    ranks, i, ties = [0.0] * len(allv), 0, 0.0
    while i < len(allv):
        j = i
        while j + 1 < len(allv) and allv[j + 1][0] == allv[i][0]:
            j += 1
        r = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[k] = r
        t = j - i + 1
        ties += t ** 3 - t
        i = j + 1
    r1 = sum(r for r, (_, g) in zip(ranks, allv) if g == 0)
    u1 = r1 - n1 * (n1 + 1) / 2.0
    mu = n1 * n2 / 2.0
    n = n1 + n2
    sigma = math.sqrt(n1 * n2 / 12.0 * ((n + 1) - ties / (n * (n - 1))))
    if sigma == 0:
        return 1.0
    z = (u1 - mu) / sigma
    return round(math.erfc(abs(z) / math.sqrt(2.0)), 6)


def compare_runs(before, after, frames=200, skip=10, columns=None, alpha=0.01, min_change_pct=1.0):
    """Profile Analyzer style before/after (Alba, YOtDVv5-0A4 [00:17:00]: capture about 200 frames, change
    one thing, capture 200 more, compare the statistics rather than eyeballing logs). before/after:
    AgentProfile CSV paths or {column: [values]}. Uses the last `frames` values after `skip` per side.
    Per column: median, mean, p95, max, IQR, delta of medians, Mann-Whitney p [added]; "changed" when
    p < alpha and the median moved by at least min_change_pct %. Returns {"columns": {...}, "changed": [...]}."""
    def load(x):
        if isinstance(x, dict):
            return x
        return ut_stat.read_frame_csv(x)
    A, B = load(before), load(after)
    cols = columns or [c for c in A if c in B and c not in ("frame", "time", "t")]
    res, changed = {}, []
    for c in cols:
        a = [float(v) for v in (A.get(c) or [])[skip:] if v is not None][-frames:]
        b = [float(v) for v in (B.get(c) or [])[skip:] if v is not None][-frames:]
        if len(a) < 8 or len(b) < 8:
            continue
        ma, mb = _median(a), _median(b)
        p = _mann_whitney_p(a, b)
        pct = 100.0 * (mb - ma) / ma if ma else None
        row = {"n": [len(a), len(b)], "median": [round(ma, 4), round(mb, 4)], "mean": [round(sum(a) / len(a), 4), round(sum(b) / len(b), 4)],
               "p95": [round(_pct(a, 0.95), 4), round(_pct(b, 0.95), 4)], "max": [round(max(a), 4), round(max(b), 4)],
               "iqr": [round(_pct(a, 0.75) - _pct(a, 0.25), 4), round(_pct(b, 0.75) - _pct(b, 0.25), 4)],
               "median_delta": round(mb - ma, 4), "median_change_pct": round(pct, 2) if pct is not None else None, "p_value": p}
        row["changed"] = p is not None and p < alpha and pct is not None and abs(pct) >= min_change_pct
        if row["changed"]:
            changed.append(c)
        res[c] = row
    return {"frames_per_side": frames, "columns": res, "changed": changed}


def mark_generated(repo, paths, on=True):
    """git update-index --skip-worktree (on) or --no-skip-worktree (off) for regenerated files, Alba's
    hygiene for the generated scene (YOtDVv5-0A4 [00:09:52]): the file stays checked in, everyone can
    regenerate locally without committing noise. Unmark before committing an intended regeneration or
    pulling a new version of the file. Returns {"ok", "skip_worktree": [paths now flagged]}."""
    try:
        top = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=repo, capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError, NotADirectoryError):
        return {"ok": False, "reason": "not a git repository: " + str(repo)}
    rel = [os.path.relpath(os.path.join(repo, p) if not os.path.isabs(p) else p, top) for p in paths]
    r = subprocess.run(["git", "update-index", "--skip-worktree" if on else "--no-skip-worktree"] + rel, cwd=top, capture_output=True, text=True)
    if r.returncode != 0:
        return {"ok": False, "reason": r.stderr.strip()}
    ls = subprocess.run(["git", "ls-files", "-v"] + rel, cwd=top, capture_output=True, text=True).stdout.splitlines()
    return {"ok": True, "skip_worktree": [ln[2:] for ln in ls if ln.startswith("S ")], "repo": top}


def fill_coast(project, scene=ISLAND, max_rounds=6, **args):
    """The A Short Hike fix as a loop: audit, put placeholder content at every over-long empty arc,
    re-audit, until the gate passes or max_rounds. Returns {"ok", "rounds": [...], "final": envelope}."""
    rounds = []
    g = audit_guidance(project, scene=scene, **args)
    for i in range(max_rounds):
        rounds.append({"longest_empty_arc_m": g["gate"].get("longest_empty_arc_m"), "arcs_over": len(g["gate"].get("arcs") or []), "ok": g["gate"].get("ok")})
        if g["gate"].get("ok") or not g["gate"].get("arcs"):
            break
        add_coast_content(project, g["gate"]["arcs"], scene=scene)
        g = audit_guidance(project, scene=scene, **args)
    else:
        rounds.append({"longest_empty_arc_m": g["gate"].get("longest_empty_arc_m"), "arcs_over": len(g["gate"].get("arcs") or []), "ok": g["gate"].get("ok")})
    return {"ok": bool(g["gate"].get("ok")), "rounds": rounds, "final": g}
