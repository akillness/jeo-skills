"""
ut_gameplay: runner-side helpers of the scenario-unity-gameplay skill (physics, AI navigation, crowds,
audio, netcode scoping). Imports the shared toolkit (ut_env, ut_run, ut_stat) from scenario-unity-expert;
never copies it. System python3 3.9+, stdlib only.

    import sys; sys.path.insert(0, "<skills>/scenario-unity-expert/scripts"); sys.path.insert(0, "<skills>/scenario-unity-gameplay/scripts")
    import ut_env, ut_run, ut_stat, ut_gameplay as gp
    P = ut_env.base_project("3d", "<project>/tests/projects/my-game")
    gp.install(P)                                   # core AgentKit + Gameplay jobs + runtime assembly
    r = ut_run.run_method(P, "AgentKit.Gameplay.GameScenes...")   # see references/procedures.md

Run in Unity 6000.3.21f1 on macOS (Apple Silicon) on 2026-09-24:
tests/code/unity-gameplay/test_offline.py and test_live_gameplay.py.
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24, refactor after the Y8 blind grade)

import glob
import json
import math
import os
import re
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL_DIR)
EXPERT_SCRIPTS = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
import sys  # noqa: E402

if EXPERT_SCRIPTS not in sys.path:
    sys.path.insert(0, EXPERT_SCRIPTS)
import ut_env  # noqa: E402

AGENTKIT_SRC = os.path.join(HERE, "AgentKit")          # editor jobs -> Assets/Editor/AgentKit/Gameplay/
RUNTIME_SRC = os.path.join(HERE, "Runtime")            # runtime assembly -> Assets/AgentKit.Gameplay/Runtime/
RUNTIME_DST = os.path.join("Assets", "AgentKit.Gameplay", "Runtime")
METRICS_TAG = "GAMEPLAY_METRICS "


# ============================================================================ install
def install_runtime(project, src=RUNTIME_SRC):
    """Copy the runtime C# (MonoBehaviours cannot live in an Editor folder) with its asmdef
    AgentKit.Gameplay.Runtime (references Unity.Burst, Unity.Collections, Unity.Mathematics) to
    <project>/Assets/AgentKit.Gameplay/Runtime/. Only changed files are written."""
    root = ut_env.find_project(project)["root"]
    dst = os.path.join(root, RUNTIME_DST)
    written = []
    # a file renamed or split in the skill would leave its old copy compiling next to the new one
    # (duplicate classes abort every batch job): park stale copies outside Assets, never delete them
    wanted = {os.path.basename(p) for p in glob.glob(os.path.join(src, "*")) if p.endswith((".cs", ".asmdef"))}
    if os.path.isdir(dst):
        for old in glob.glob(os.path.join(dst, "*")):
            base = os.path.basename(old)
            stem = base[:-5] if base.endswith(".meta") else base
            if stem.endswith((".cs", ".asmdef")) and stem not in wanted:
                park = os.path.join(root, "Library", "AgentKit", "stale_runtime")
                os.makedirs(park, exist_ok=True)
                shutil.move(old, os.path.join(park, base))
                written.append("parked " + base)
    for path in glob.glob(os.path.join(src, "*")):
        if not (path.endswith(".cs") or path.endswith(".asmdef")):
            continue
        out = os.path.join(dst, os.path.basename(path))
        with open(path, "rb") as f:
            data = f.read()
        if os.path.isfile(out):
            with open(out, "rb") as f:
                if f.read() == data:
                    continue
        os.makedirs(dst, exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)
        written.append(os.path.relpath(out, root))
    return written


def install(project):
    """Core AgentKit (scenario-unity-expert) + Gameplay editor jobs + runtime assembly. Unity compiles
    them on the next batch job; a compile error in ANY of them aborts every job of the project."""
    out = ut_env.install_agentkit(project)
    out += ut_env.install_agentkit(project, src=AGENTKIT_SRC)
    out += install_runtime(project)
    return out


# ============================================================================ numbers
def voxel_size(agent_radius, voxels_per_radius=3.0):
    """AI Navigation 2.0 manual: 3 voxels per agent radius by default, 1 to 2 for big open areas,
    4 to 6 for tight interiors, more than 8 rarely helps. Voxel height is half the width."""
    if voxels_per_radius <= 0:
        raise ValueError("voxels_per_radius must be > 0")
    return agent_radius / float(voxels_per_radius)


def voxels_per_radius_for(context):
    """'open' -> 1.5, 'default' -> 3, 'interior' -> 5 (manual ranges 1-2, 3, 4-6)."""
    return {"open": 1.5, "default": 3.0, "interior": 5.0}[context]


def linear_to_db(v):
    """Volume slider 0..1 -> mixer dB: 20*log10(v), floored at 0.0001 = -80 dB (DU7cgVsU2rM [00:14:30])."""
    return 20.0 * math.log10(min(1.0, max(0.0001, float(v))))


def db_to_linear(db):
    return 10.0 ** (float(db) / 20.0)


def discrete_tunnel_speed(thickness, radius, fixed_dt=0.02, contact_offset=0.01):
    """Speed above which a Discrete body CAN pass a wall between two steps: per-step travel larger
    than wall thickness + body diameter (+ both contact offsets). Whether a given shot tunnels also
    depends on its phase; measured values sit around this line (procedures.md, CCD ladder)."""
    return (thickness + 2.0 * radius + 2.0 * contact_offset) / float(fixed_dt)


def catchup_steps(frame_ms, fixed_dt=0.02, max_dt=1.0 / 3.0):
    """Fixed steps Unity runs in one frame of frame_ms, and the game-time / real-time ratio.
    The Maximum Allowed Timestep caps the time simulated per frame: fewer steps, slower world."""
    dt = frame_ms / 1000.0
    simulated = min(dt, max_dt)
    steps = int(simulated / fixed_dt + 1e-9)
    return {"steps": steps, "time_ratio": round(simulated / dt, 3) if dt > 0 else 1.0,
            "capped": dt > max_dt}


def mixer_update_mode_needed(pauses_with_timescale_zero):
    return "UnscaledTime" if pauses_with_timescale_zero else "Normal"


def rolloff_gain(distance, min_distance=1.0, max_distance=500.0, mode="Logarithmic"):
    """Distance gain of a 3D AudioSource as MEASURED at the listener in 6000.3.21f1
    (AudioSpatialTests.RolloffBeyondMaxDistanceMeasured, min 1, max 10): Logarithmic = min/d and it
    keeps attenuating past Max Distance (0.05 at 20 m, 0.025 at 40 m: the 6.3 Manual's "ignored" is
    right, the script reference's "stops attenuation" is not, for Logarithmic); Linear falls to 0 at
    Max Distance (0.89 at 2 m, 0.56 at 5 m, 0 at 10 m). Custom curves: read the curve."""
    d = max(float(distance), 1e-6)
    if mode == "Logarithmic":
        return 1.0 if d <= min_distance else min_distance / d
    if mode == "Linear":
        if d <= min_distance:
            return 1.0
        return max(0.0, 1.0 - (d - min_distance) / float(max_distance - min_distance))
    raise ValueError("mode: Logarithmic or Linear (custom curves: evaluate the curve)")


# ============================================================================ decision gates
JOB_RULES = [
    "TransformAccessArray from your own list, rebuilt only when the set changes; never FindObjectsByType<Transform> (ZkvK0mX-id4 [00:32:10])",
    "copy transforms out in a tiny read-only job (ScheduleReadOnly), then math on NativeArrays [00:33:49]",
    "never touch those transforms on the main thread while the job runs: the write waits for the job (measured: 21.7 to 38.4 ms, the job's length, vs 0.003 ms outside the array) [00:26:42]",
    "Complete() before reading, even if the job looks finished [00:36:30]; schedule early, complete late [00:37:34]",
    "fill main-thread waits (WaitForJobGroupID, read with JobWaitMeter) with Burst .Run() work: measured 6 to 10 ms saved of 21 to 26 [00:39:15]",
]


def dots_gate(entity_count, main_thread_ai_ms, frame_budget_ms, workers_idle=True,
              needs_determinism=False, team_knows_ecs=False, main_thread_wait_ms=0.0):
    """When DOTS is worth it (Survival Kids, Unite 2025; Entities 1.4 manual). Order: measure,
    fix algorithms and update order (one hub, sorted by type), then Burst jobs on hot loops (no
    Entities), and full ECS only at scale or for determinism. main_thread_wait_ms: the
    WaitForJobGroupID time per frame (JobWaitMeter); a wait is room for Burst .Run() work.
    Returns {"level", "why", "notes"}; level in "managed", "managed+sorted-updates",
    "burst-jobs", "entities"."""
    share = main_thread_ai_ms / float(frame_budget_ms) if frame_budget_ms else 0.0
    notes = []
    if main_thread_wait_ms > 0.1:
        notes.append("main thread waits %.2f ms per frame on jobs: move main-thread Burst work (.Run) into that wait before adding workers" % main_thread_wait_ms)
    if needs_determinism or (entity_count >= 10000 and team_knows_ecs):
        return {"level": "entities", "why": "thousands of entities or deterministic simulation; budget baking, subscenes and no ECS skinned animation or NavMeshAgent", "notes": notes}
    if share < 0.05:
        return {"level": "managed", "why": "AI under 5%% of the frame (%.2f of %.2f ms): not the bottleneck" % (main_thread_ai_ms, frame_budget_ms), "notes": notes}
    if share < 0.15 or not workers_idle:
        return {"level": "managed+sorted-updates", "why": "tick from one UpdateHub at a fixed rate, sorted by type (Survival Kids: -12% mean, worst frame 2.18 -> 1.43 ms; measured here, UpdateOrderBenchmark at 1,000 and 10,000 objects over two runs: mean 7 to 14% lower, worst tick lower in 3 of 4)", "notes": notes}
    return {"level": "burst-jobs", "why": "main-thread-bound with idle workers: Burst jobs over NativeArrays, TransformAccessArray copies, no Entities",
            "notes": notes + JOB_RULES}


# Measured in 6000.3.21f1 Editor on this Mac (ProximityBenchmark, two runs, 2026-09-24): brute force
# costs a constant per item-query pair, 7.0 to 8.3 ns managed and 1.2 to 1.5 ns Burst (the upper values
# are used); a per-call Burst grid (cell = radius) took 0.03 to 0.04 ms at 1,000 x 20 and 0.30 to
# 1.29 ms at 10,000 x 200 (managed 14.0 to 14.7 ms, Burst brute force 2.4 to 2.7 ms).
PAIR_MS_MANAGED = 8.0e-6
PAIR_MS_BURST = 1.5e-6


def proximity_gate(items, queries_per_frame, frame_budget_ms=16.667, share=0.05, moving_colliders=True):
    """How to answer "is anything near me?" (Survival Kids [00:43:04]-[00:47:25]). Triggers on
    moving objects pay transform sync for each collider: never the answer at scale. Brute force over
    your own list is fine while items x queries stays small; then a Burst job; then a spatial
    structure (grid or KD tree) rebuilt every frame in a job. Returns {"method", "estimate_ms", "why"}."""
    pairs = float(items) * float(queries_per_frame)
    managed = pairs * PAIR_MS_MANAGED
    burst = pairs * PAIR_MS_BURST
    limit = share * frame_budget_ms
    why = "managed brute force about %.3f ms, Burst brute force about %.3f ms for %d x %d (measured constants, Editor; re-measure with ProximityBenchmark on target)" % (managed, burst, items, queries_per_frame)
    if managed <= limit:
        out = {"method": "own list + sqrMagnitude (managed loop)", "estimate_ms": round(managed, 4), "why": why}
    elif burst <= limit:
        out = {"method": "Burst brute-force job over NativeArrays", "estimate_ms": round(burst, 4), "why": why}
    else:
        out = {"method": "spatial grid or KD tree rebuilt per frame in a Burst job", "estimate_ms": None, "why": why}
    if moving_colliders:
        out["why"] += "; do not use trigger colliders for this: each moving collider costs transform sync"
    return out


def netcode_fit(competitive=False, needs_rollback=False, needs_lag_comp=False, players=8,
                host_may_leave=False, physics_heavy=False):
    """Scoping NGO 2.x before a design commits (NGO 2.7 manual): no full client prediction and
    reconciliation, no server rewind; client anticipation only. Returns {"stack", "authority", "notes"}."""
    notes = []
    if needs_rollback or needs_lag_comp or (competitive and players > 16):
        stack = "Netcode for Entities (prediction and lag compensation built in) or a third-party stack"
        notes.append("NGO would mean hand-building prediction/reconciliation on AnticipatedNetworkVariable/OnReanticipate and server rewind yourself")
    else:
        stack = "Netcode for GameObjects 2.x"
    if competitive:
        authority = "server authority; client sends inputs by [Rpc(SendTo.Server)] on ticks, server validates"
    elif host_may_leave:
        authority = "distributed authority (survives the host leaving); write against HasAuthority"
    else:
        authority = "server authority by default, owner authority only for what the server cannot correct"
    if physics_heavy:
        notes.append("authority instance non-kinematic, others kinematic (NetworkRigidbody); apply RPC-driven body changes in FixedUpdate, RPCs run in EarlyUpdate")
    notes.append("RPC vs NetworkVariable: would a late joiner need it? yes -> NetworkVariable")
    notes.append("update rate above fire rate (10 Hz fails at 750 RPM)")
    return {"stack": stack, "authority": authority, "notes": notes}


def ai_structure(behaviors, interruptions=0, goal_chaining=False):
    """LlamAcademy (CZvfuNfdc1M): 1-2 behaviours unstructured; FSM while transitions stay few
    (they grow toward N^2); behaviour tree for priorities and fallbacks; GOAP only for chained goals."""
    if goal_chaining:
        return "GOAP (cap plan depth, few blackboard facts, never replan every frame)"
    if behaviors <= 2 and interruptions == 0:
        return "single MonoBehaviour with explicit states"
    if behaviors <= 8 and interruptions <= 3:
        return "code FSM (enum + switch or state classes), ticked by a director"
    return "behaviour tree (code-first nodes, Edit Mode truth-table tests) or Unity Behavior 1.0.16 via a human/computer-use step"


# ============================================================================ results
def parse_metrics(test_result, tag=METRICS_TAG):
    """{test name: metrics dict} from the NUnit case outputs of ut_run.run_tests (tests log one
    line 'GAMEPLAY_METRICS {json}'). Also reads the XML directly when the 2000-char output cut
    the line."""
    out = {}
    for c in test_result.get("cases", []):
        text = c.get("output") or ""
        for line in text.splitlines():
            i = line.find(tag)
            if i >= 0:
                try:
                    out[c["name"]] = json.loads(line[i + len(tag):])
                except ValueError:
                    pass
    xml = test_result.get("results")
    if xml and os.path.isfile(xml):
        with open(xml, errors="replace") as f:
            txt = f.read()
        for m in re.finditer(r'<test-case[^>]*\bname="([^"]+)".*?</test-case>', txt, re.S):
            body = m.group(0)
            j = body.find(tag)
            if j < 0 or m.group(1) in out:
                continue
            end = body.find("\n", j)
            raw = body[j + len(tag): end if end > 0 else None]
            raw = raw.split("]]>")[0].strip()
            try:
                out[m.group(1)] = json.loads(raw.replace("&quot;", '"'))
            except ValueError:
                pass
    return out


def read_ai_budget(project):
    """The AIBudgetMeter JSON written when Play mode ends (Library/AgentKit/gameplay/ai_budget.json)."""
    root = ut_env.find_project(project)["root"]
    p = os.path.join(root, "Library", "AgentKit", "gameplay", "ai_budget.json")
    if not os.path.isfile(p):
        return None
    with open(p) as f:
        return json.load(f)


def crowd_row(label, profile_envelope, ai_budget, target_ms=16.667):
    """One comparable row per crowd variant: whole-frame CPU numbers from AgentProfile + our AI slice."""
    res = profile_envelope.get("result") or {}
    def g(col, k):
        v = res.get(col)
        return v.get(k) if isinstance(v, dict) else None
    row = {"label": label, "frames": res.get("frames"),
           "cpu_frame_p50": g("cpu_frame_ms", "p50"), "cpu_frame_p95": g("cpu_frame_ms", "p95"),
           "cpu_frame_max": g("cpu_frame_ms", "max"),   # the worst frame: report it next to p95 (Survival Kids judges the worst frame)
           "main_thread_p50": g("main_thread_ms", "p50"), "main_thread_p95": g("main_thread_ms", "p95"),
           "gc_p50": g("gc_alloc_bytes", "p50"), "draw_calls_p50": g("draw_calls", "p50"),
           "ai_mean_ms": (ai_budget or {}).get("mean_ms"), "ai_p95_ms": (ai_budget or {}).get("p95_ms"),
           "ai_ticks": (ai_budget or {}).get("ticks"), "budget_ms": target_ms}
    if row["cpu_frame_p95"] is not None:
        row["within_budget_p95"] = row["cpu_frame_p95"] <= target_ms
    return row


# ============================================================================ static code audit
CODE_RULES = [
    # (code, severity, regex, message, fix)
    ("api.rigidbody_velocity", "error", r"\b(?:rb|rigidbody|body|_rb|m_Rb|m_Rigidbody)\w*\.velocity\b",
     "Rigidbody.velocity is linearVelocity in Unity 6", "linearVelocity"),
    ("api.rigidbody_drag", "error", r"\.(?:angularDrag|drag)\b\s*=", "drag/angularDrag are linearDamping/angularDamping in Unity 6", "linearDamping / angularDamping"),
    ("api.physic_material", "error", r"\bPhysicMaterial\b", "PhysicMaterial is PhysicsMaterial in Unity 6", "PhysicsMaterial"),
    ("api.auto_simulation", "error", r"Physics\.autoSimulation", "Physics.autoSimulation is gone", "Physics.simulationMode = SimulationMode.Script"),
    ("api.auto_sync", "warn", r"Physics\.autoSyncTransforms", "deprecated in 6.3: hidden sync before every query", "Physics.SyncTransforms() where needed"),
    ("physics.simulate_deltatime", "error", r"Physics\.Simulate\(\s*Time\.deltaTime", "variable-step manual simulation: unstable, tunnels at low fps", "fixed step (Time.fixedDeltaTime) in an accumulator"),
    ("physics.alloc_query", "info", r"Physics\.(?:RaycastAll|SphereCastAll|CapsuleCastAll|BoxCastAll|OverlapSphere|OverlapBox|OverlapCapsule)\(",
     "allocating query: GC in hot paths", "NonAlloc with a sized buffer (check the returned count) or RaycastCommand.ScheduleBatch"),
    ("api.find_object_of_type", "warn", r"FindObjectOfType\s*<|FindObjectsOfType\s*<", "obsolete in Unity 6", "FindFirstObjectByType / FindObjectsByType(FindObjectsSortMode.None)"),
    ("audio.play_clip_at_point", "warn", r"AudioSource\.PlayClipAtPoint\(", "a GameObject per call and no mixer routing (sliders never reach it)", "pooled emitters routed to a mixer group"),
    ("input.legacy", "error", r"\bInput\.(?:GetAxis|GetAxisRaw|GetButton|GetButtonDown|GetKey|GetKeyDown|GetMouseButton|GetMouseButtonDown|mousePosition)\b",
     "legacy Input Manager: 6.3 templates run the Input System only", "Input System actions (InputSystem.actions.FindAction)"),
    ("netcode.ngo1_rpc", "warn", r"\[(?:ServerRpc|ClientRpc)\b", "NGO 1.x RPC attributes", "[Rpc(SendTo.Server)] / [Rpc(SendTo.ClientsAndHost)]"),
    ("netcode.owner_authority", "warn", r"OnIsServerAuthoritative\s*\(\s*\)\s*(?:=>|\{\s*return)\s*false",
     "owner-authoritative transform: fine for casual co-op, cheatable in competitive modes", "server authority + input RPCs, or NetworkTransform authority mode by design"),
    ("netcode.update_override", "error", r"override\s+(?:protected\s+|public\s+)?void\s+Update\s*\(\s*\).*NetworkTransform|class\s+\w+\s*:\s*NetworkTransform[\s\S]{0,400}?override\s+\w*\s*void\s+Update\s*\(",
     "NetworkTransform.Update cannot be overridden in NGO 2.x", "override OnUpdate (non-authority only)"),
    ("nav.setdestination_update", "info", r"void\s+Update\s*\(\s*\)\s*\{[^}]{0,300}SetDestination\(",
     "SetDestination every frame", "repath on target moved > threshold or on an interval"),
    ("physics.auto_sync_on", "error", r"Physics\.autoSyncTransforms\s*=\s*true",
     "turns on a hidden sync before every query (deprecated in 6.3)", "Physics.SyncTransforms() once, after moving colliders by transform and before querying"),
    ("jobs.taa_find_objects", "error", r"FindObjectsByType\s*<\s*Transform\s*>",
     "TransformAccessArray filled from a scene-wide search (Survival Kids: tanks performance)", "keep your own list; rebuild the array only when the set changes"),
]

# (code, severity, regex that must be present, regex that must be absent, message, fix): whole-file checks
FILE_RULES = [
    ("jobs.schedule_no_complete", "warn", r"\.(?:Schedule|ScheduleReadOnly|ScheduleParallel|ScheduleBatch)\s*\(", r"\.Complete\s*\(",
     "jobs scheduled but no Complete() in the file", "Complete() the handle before reading results, even if the job looks finished"),
    ("physics.raycastcommand_legacy", "info", r"new\s+RaycastCommand\s*\(", r"QueryParameters",
     "RaycastCommand without QueryParameters (pre-2022 constructor)", "new RaycastCommand(from, dir, new QueryParameters(mask, false, QueryTriggerInteraction.Ignore, false), distance)"),
    ("domain.static_instance_no_reset", "warn", r"\bstatic\s+[\w<>\[\]]+\s+Instance\b", r"SubsystemRegistration",
     "static singleton with no reset: stale with Enter Play Mode without domain reload (6.6 default for new projects)",
     "[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)] static void ResetStatics() { Instance = null; }"),
]


def code_audit(project, extra_dirs=None):
    """Regex audit of Assets/**/*.cs (and Packages/manifest.json) for the gameplay traps an agent
    meets in tutorial code. Heuristic: read the lines it reports. Returns {"findings", "counts"}."""
    root = ut_env.find_project(project)["root"]
    files = glob.glob(os.path.join(root, "Assets", "**", "*.cs"), recursive=True)
    for d in extra_dirs or []:
        files += glob.glob(os.path.join(d, "**", "*.cs"), recursive=True)
    findings = []
    for path in files:
        if "/Editor/AgentKit/" in path.replace(os.sep, "/"):
            continue
        with open(path, errors="replace") as f:
            # blank // comments (same length, so line numbers hold): a comment that names a trap is not the trap
            txt = re.sub(r"//[^\n]*", lambda m: " " * len(m.group(0)), f.read())
        for code, sev, rx, msg, fix in CODE_RULES:
            for m in re.finditer(rx, txt):
                line = txt.count("\n", 0, m.start()) + 1
                findings.append({"severity": sev, "code": code, "path": "%s:%d" % (os.path.relpath(path, root), line),
                                 "message": msg, "fix": fix})
        for code, sev, present, absent, msg, fix in FILE_RULES:    # comments already blanked
            m = re.search(present, txt)
            if m and not re.search(absent, txt):
                line = txt.count("\n", 0, m.start()) + 1
                findings.append({"severity": sev, "code": code, "path": "%s:%d" % (os.path.relpath(path, root), line),
                                 "message": msg, "fix": fix})
        # NonAlloc called as a statement: the returned count is thrown away, so the loop runs on the buffer
        for i, raw in enumerate(txt.splitlines(), 1):
            stmt = raw.strip()
            if re.match(r"Physics\.\w+NonAlloc\s*\(", stmt):
                findings.append({"severity": "warn", "code": "physics.nonalloc_count_ignored", "path": "%s:%d" % (os.path.relpath(path, root), i),
                                 "message": "NonAlloc result count ignored: stale or dropped hits (extras are silently discarded)",
                                 "fix": "int n = Physics...NonAlloc(...); loop i < n; log when n == buffer.Length (Queries.*)"})
    man = os.path.join(root, "Packages", "manifest.json")
    if os.path.isfile(man):
        with open(man) as f:
            deps = json.load(f).get("dependencies", {})
        for pkg in ("com.unity.services.lobby", "com.unity.services.relay", "com.unity.services.matchmaker",
                    "com.unity.services.multiplay", "com.unity.multiplayer.widgets"):
            if pkg in deps:
                findings.append({"severity": "warn", "code": "netcode.deprecated_package", "path": "Packages/manifest.json",
                                 "message": pkg + " is deprecated in 6.3", "fix": "com.unity.services.multiplayer (Sessions)"})
        ngo = deps.get("com.unity.netcode.gameobjects", "")
        if ngo.startswith("1."):
            findings.append({"severity": "warn", "code": "netcode.ngo1", "path": "Packages/manifest.json",
                             "message": "NGO %s: 1.x is deprecated in 6.3 (2.13.0 bundled)" % ngo, "fix": "2.x"})
    counts = {s: sum(1 for f in findings if f["severity"] == s) for s in ("error", "warn", "info")}
    return {"findings": findings, "counts": counts, "files": len(files)}


def summarize_audit(envelope):
    """Short text lines from an AuditGameplayScene envelope (errors first)."""
    res = (envelope or {}).get("result") or {}
    rank = {"error": 0, "warn": 1, "info": 2}
    lines = []
    for f in sorted(res.get("findings", []), key=lambda x: rank.get(x["severity"], 3)):
        lines.append("%s %s %s: %s" % (f["severity"].upper(), f["code"], f["path"], f["message"]))
    return lines


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-unity-gameplay helpers")
    ap.add_argument("cmd", choices=["install", "audit-code"])
    ap.add_argument("project")
    a = ap.parse_args()
    if a.cmd == "install":
        print("\n".join(install(a.project)) or "up to date")
    else:
        print(json.dumps(code_audit(a.project), indent=2))
