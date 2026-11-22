// REQUIRES: com.unity.cinemachine
// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). Cinemachine 3 rigs from data, probes and audit.
//
// CM3 (namespace Unity.Cinemachine): one Unity Camera with a CinemachineBrain; every CinemachineCamera is a
// lightweight controller whose Position Control, Rotation Control, Noise and extensions are ordinary
// components (CM3.1 manual, "What's new"). Menu templates (Follow, FreeLook, Third Person Aim) are just
// component sets, so an agent builds them with AddComponent. Install the package with an explicit 3.1.x
// version first (AnimPackages.Add): the 6000.3.21f1 editor manifest lists 2.10.7.
//
// Jobs:
//   AgentKit.Animation.AnimCinemachine.SetupCameras  args: scene, brain{update, blend_update, default_blend[style, s],
//        custom_blends[[from, to, style, s]]}, rigs[{name, type: follow|third_person|freelook|fixed, target,
//        look_at, priority, offset, damping, distance, side, arm, position, fov, blend_hint ("None" or "A, B" flags),
//        deoccluder{collide_against[layers], transparent_layers[layers], ignore_tag, radius, strategy, damping,
//        damping_when_occluded, min_occlusion_time}, camera_offset[x,y,z]}], save (true)
//   AgentKit.Animation.AnimCinemachine.CameraProbe   args: scene, fps, seconds, events[{t, priorities{name: p}}],
//        move_target{name, velocity[x,y,z]}, captures[t...], target, obstacles[{name, position, scale, layer, trigger}],
//        occlusion_layers[layers], series (per-frame target screen position for jitter)
//   AgentKit.Animation.AnimCinemachine.AuditCameras  args: scene
// Unity calls: CinemachineBrain (UpdateMethod, BlendUpdateMethod, DefaultBlend, CustomBlends, ManualUpdate(frame, dt),
// ActiveVirtualCamera, IsBlending), CinemachineCamera (Target.TrackingTarget, Priority, Lens, BlendHint),
// CinemachineFollow, CinemachineRotationComposer, CinemachineThirdPersonFollow, CinemachineOrbitalFollow,
// CinemachineInputAxisController, CinemachineHardLookAt, CinemachineBlenderSettings.
// Run in Unity 6000.3.21f1 with Cinemachine 3.1.7 on 2026-09-24: tests/code/unity-animation/test_live_animation.py::test_06.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Unity.Cinemachine;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AgentKit.Animation
{
    public static class AnimCinemachine
    {
        static void OpenScene()
        {
            var scene = AgentJob.Str("scene", AnimSampler.DefaultScene);
            if (EditorSceneManager.GetActiveScene().path != scene) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
        }

        static Transform Find(string path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            var go = AnimUtil.Require(GameObject.Find(path), "object '" + path + "' not in the scene");
            return go.transform;
        }

        static T GetOrAdd<T>(GameObject go) where T : Component => AnimUtil.GetOrAdd<T>(go);

        static CinemachineBlendDefinition Blend(List<object> d, string style = "EaseInOut", float t = 2f)
        {
            if (d != null && d.Count >= 2) { style = d[0].ToString(); t = (float)AgentJson.ToDouble(d[1]); }
            return new CinemachineBlendDefinition((CinemachineBlendDefinition.Styles)Enum.Parse(typeof(CinemachineBlendDefinition.Styles), style), t);
        }

        public static CinemachineBrain EnsureBrain(Dictionary<string, object> b)
        {
            var cam = AnimUtil.Require(Camera.main, "no Main Camera in the scene");
            var brain = GetOrAdd<CinemachineBrain>(cam.gameObject);
            Undo.RecordObject(brain, "Agent: brain");
            // Smart Update + Late Update blends: the recommended pair, first thing to check on jitter (CM3.1 Brain doc)
            brain.UpdateMethod = (CinemachineBrain.UpdateMethods)Enum.Parse(typeof(CinemachineBrain.UpdateMethods), b.TryGetValue("update", out var u) ? u.ToString() : "SmartUpdate");
            brain.BlendUpdateMethod = (CinemachineBrain.BrainUpdateMethods)Enum.Parse(typeof(CinemachineBrain.BrainUpdateMethods), b.TryGetValue("blend_update", out var bu) ? bu.ToString() : "LateUpdate");
            brain.DefaultBlend = Blend(b.TryGetValue("default_blend", out var db) ? db as List<object> : null);
            if (b.TryGetValue("custom_blends", out var cbo) && cbo is List<object> cbl && cbl.Count > 0)
            {
                var path = b.TryGetValue("custom_blends_asset", out var cp) ? cp.ToString() : "Assets/AnimLab/CM_Blends.asset";
                var asset = AssetDatabase.LoadAssetAtPath<CinemachineBlenderSettings>(path);
                if (asset == null) { asset = ScriptableObject.CreateInstance<CinemachineBlenderSettings>(); AssetDatabase.CreateAsset(asset, path); }
                asset.CustomBlends = cbl.Cast<List<object>>().Select(x => new CinemachineBlenderSettings.CustomBlend
                {
                    From = x[0].ToString(), To = x[1].ToString(), Blend = Blend(x.Skip(2).ToList()),
                }).ToArray();
                EditorUtility.SetDirty(asset);
                brain.CustomBlends = asset;
            }
            return brain;
        }

        public static void SetupCameras()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var brain = EnsureBrain(AgentJob.Dict("brain"));
                var made = new List<object>();
                foreach (var ro in AgentJob.List("rigs"))
                {
                    var r = (Dictionary<string, object>)ro;
                    var name = r["name"].ToString();
                    var go = AnimUtil.FindOrCreate(name);   // get-or-create: rerunning never duplicates
                    var cam = GetOrAdd<CinemachineCamera>(go);
                    var target = Find(r.TryGetValue("target", out var t) ? t?.ToString() : null);
                    var lookAt = Find(r.TryGetValue("look_at", out var la) ? la?.ToString() : null);
                    cam.Target.TrackingTarget = target;
                    if (lookAt != null) { cam.Target.LookAtTarget = lookAt; cam.Target.CustomLookAtTarget = true; }
                    cam.Priority = r.TryGetValue("priority", out var p) ? (int)AgentJson.ToDouble(p) : 0;
                    if (r.TryGetValue("fov", out var fov)) cam.Lens.FieldOfView = (float)AgentJson.ToDouble(fov);
                    // Blend hints shape the path of a blend (CM3.1 series XTVzs4B1d7I [00:13:32]): a blend between cameras on
                    // opposite sides of the target lerps THROUGH it and flips; CylindricalPosition orbits around it instead.
                    // Flags combine ("CylindricalPosition, IgnoreTarget"); "None" clears them.
                    if (r.TryGetValue("blend_hint", out var bh))
                        cam.BlendHint = bh == null || bh.ToString() == "None" || bh.ToString() == "" ? 0
                            : (CinemachineCore.BlendHints)Enum.Parse(typeof(CinemachineCore.BlendHints), bh.ToString());
                    var type = r.TryGetValue("type", out var ty) ? ty.ToString() : "follow";
                    var damping = r.TryGetValue("damping", out var dm) ? AgentJson.ToVector3(dm, Vector3.one) : Vector3.one;
                    switch (type)
                    {
                        case "follow":   // Follow template: CinemachineFollow + CinemachineRotationComposer
                        {
                            var f = GetOrAdd<CinemachineFollow>(go);
                            f.FollowOffset = r.TryGetValue("offset", out var off) ? AgentJson.ToVector3(off, new Vector3(0, 1.5f, -4f)) : new Vector3(0, 1.5f, -4f);
                            f.TrackerSettings.BindingMode = Unity.Cinemachine.TargetTracking.BindingMode.LockToTargetWithWorldUp;
                            f.TrackerSettings.PositionDamping = damping;   // some damping: zero follows every jolt (CM3.1 series XTVzs4B1d7I [00:05:19])
                            var rc = GetOrAdd<CinemachineRotationComposer>(go);
                            rc.Damping = new Vector2(0.5f, 0.5f);
                            break;
                        }
                        case "third_person":   // over the shoulder: Third Person Follow, rotation owned by the character controller
                        {
                            var tp = GetOrAdd<CinemachineThirdPersonFollow>(go);
                            tp.CameraDistance = r.TryGetValue("distance", out var d) ? (float)AgentJson.ToDouble(d) : 2.5f;
                            tp.CameraSide = r.TryGetValue("side", out var s) ? (float)AgentJson.ToDouble(s) : 0.6f;
                            tp.VerticalArmLength = r.TryGetValue("arm", out var a) ? (float)AgentJson.ToDouble(a) : 0.4f;
                            tp.ShoulderOffset = r.TryGetValue("shoulder", out var so) ? AgentJson.ToVector3(so, new Vector3(0.4f, 0f, 0f)) : new Vector3(0.4f, 0f, 0f);
                            tp.Damping = damping * 0.1f;
                            tp.AvoidObstacles.Enabled = true;
                            tp.AvoidObstacles.IgnoreTag = r.TryGetValue("ignore_tag", out var it) ? it.ToString() : "Player";   // the player is not an obstacle
                            tp.AvoidObstacles.CameraRadius = 0.2f;
                            break;
                        }
                        case "freelook":   // FreeLook template: Orbital Follow + Rotation Composer + input
                        {
                            var of = GetOrAdd<CinemachineOrbitalFollow>(go);
                            of.OrbitStyle = CinemachineOrbitalFollow.OrbitStyles.ThreeRing;
                            GetOrAdd<CinemachineRotationComposer>(go);
                            GetOrAdd<CinemachineInputAxisController>(go);   // without it the orbit takes no input
                            break;
                        }
                        case "fixed":   // shot camera: no Position Control, so it can be placed, animated or scripted
                        {
                            if (r.TryGetValue("position", out var pos)) go.transform.position = AgentJson.ToVector3(pos, go.transform.position);
                            if (lookAt != null || target != null) GetOrAdd<CinemachineHardLookAt>(go);
                            break;
                        }
                        default: throw new ArgumentException("unknown rig type " + type);
                    }
                    if (r.TryGetValue("deoccluder", out var dob) && dob is Dictionary<string, object> dd) ConfigureDeoccluder(GetOrAdd<CinemachineDeoccluder>(go), dd);
                    if (r.TryGetValue("camera_offset", out var cof)) GetOrAdd<CinemachineCameraOffset>(go).Offset = AgentJson.ToVector3(cof, Vector3.zero);
                    EditorUtility.SetDirty(go);
                    made.Add(new Dictionary<string, object>
                    {
                        { "name", name }, { "type", type }, { "priority", (int)cam.Priority },
                        { "components", go.GetComponents<Component>().Select(c => (object)c.GetType().Name).ToList() },
                    });
                }
                if (AgentJob.Bool("save", true)) EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene());
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "brain", brain.gameObject.name }, { "update", brain.UpdateMethod.ToString() }, { "blend_update", brain.BlendUpdateMethod.ToString() },
                    { "default_blend", brain.DefaultBlend.Style + " " + brain.DefaultBlend.Time }, { "rigs", made },
                    { "cinemachine", UnityEditor.PackageManager.PackageInfo.FindForAssembly(typeof(CinemachineBrain).Assembly)?.version },
                };
            });
        }

        public static int Layers(object names, int def)
        {
            if (names == null) return def;
            if (names is string sname) return sname == "Everything" ? ~0 : LayerMask.GetMask(sname);
            var list = ((List<object>)names).Select(x => x.ToString()).ToArray();
            return list.Length == 1 && list[0] == "Everything" ? ~0 : LayerMask.GetMask(list);
        }

        /// <summary>Deoccluder (CM3 CinemachineCollider): pulls the camera in front of obstacles hiding the target.
        /// Only non-trigger colliders on Collide Against count (the raycasts ignore triggers); Transparent Layers never
        /// block the view but, if also in Collide Against, still keep the camera from sitting inside them (package
        /// source 3.1.7). Glass goes on a layer in BOTH; the player is skipped by Ignore Tag (u0a1F6BlczE [00:10:45], [00:12:26]).</summary>
        public static void ConfigureDeoccluder(CinemachineDeoccluder d, Dictionary<string, object> c)
        {
            d.CollideAgainst = Layers(c.TryGetValue("collide_against", out var ca) ? ca : null, 1);
            d.TransparentLayers = Layers(c.TryGetValue("transparent_layers", out var tl) ? tl : null, 0);
            d.IgnoreTag = c.TryGetValue("ignore_tag", out var it) && it != null ? it.ToString() : "Player";
            var a = d.AvoidObstacles;
            a.Enabled = true;
            a.CameraRadius = c.TryGetValue("radius", out var rr) ? (float)AgentJson.ToDouble(rr) : 0.2f;
            a.Strategy = c.TryGetValue("strategy", out var st) ? (CinemachineDeoccluder.ObstacleAvoidance.ResolutionStrategy)Enum.Parse(typeof(CinemachineDeoccluder.ObstacleAvoidance.ResolutionStrategy), st.ToString())
                                                          : CinemachineDeoccluder.ObstacleAvoidance.ResolutionStrategy.PullCameraForward;
            a.MaximumEffort = 4;
            a.Damping = c.TryGetValue("damping", out var dm) ? (float)AgentJson.ToDouble(dm) : 0.4f;   // back out after a correction
            a.DampingWhenOccluded = c.TryGetValue("damping_when_occluded", out var dwo) ? (float)AgentJson.ToDouble(dwo) : 0.2f;   // more: smoother, but clips
            a.MinimumOcclusionTime = c.TryGetValue("min_occlusion_time", out var mot) ? (float)AgentJson.ToDouble(mot) : 0f;
            d.AvoidObstacles = a;
            EditorUtility.SetDirty(d);
        }

        /// <summary>Deterministic camera run: the Brain in Manual Update, stepped with a fixed delta time.
        /// Records the live camera, blend state, framing of the target, flip and swing-through metrics, occlusion
        /// (a linecast camera to target per frame) and renders frames. Temporary obstacles are spawned for the run and
        /// removed after it (the scene is not saved).</summary>
        public static void CameraProbe()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var brain = AnimUtil.Require(Camera.main.GetComponent<CinemachineBrain>(), "no CinemachineBrain on the Main Camera");
                var keep = brain.UpdateMethod;
                brain.UpdateMethod = CinemachineBrain.UpdateMethods.ManualUpdate;
                float fps = AgentJob.Float("fps", 60f), seconds = AgentJob.Float("seconds", 4f);
                var target = Find(AgentJob.Str("target", "Hero/CameraTarget"));
                var mover = AgentJob.Dict("move_target");
                var moveT = mover.Count > 0 ? Find(mover["name"].ToString()) : null;
                var vel = mover.Count > 0 ? AgentJson.ToVector3(mover["velocity"], Vector3.zero) : Vector3.zero;
                var events = AgentJob.List("events").Cast<Dictionary<string, object>>().OrderBy(e => AgentJson.ToDouble(e["t"])).ToList();
                var captures = new HashSet<int>(AgentJob.List("captures").Select(c => Mathf.RoundToInt((float)AgentJson.ToDouble(c) * fps)));
                var outDir = AgentJob.OutDir("camera");
                var rows = new List<object>();
                var shots = new List<object>();
                int ei = 0, n = Mathf.RoundToInt(seconds * fps);
                float minUp = 1f, maxJump = 0f, minDist = float.MaxValue;
                int occluded = 0, inside = 0;
                var spawned = new List<GameObject>();
                foreach (var oo in AgentJob.List("obstacles"))
                {
                    var o = (Dictionary<string, object>)oo;
                    var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    box.name = o.TryGetValue("name", out var on) ? on.ToString() : "AgentObstacle";
                    box.transform.position = AgentJson.ToVector3(o.TryGetValue("position", out var op) ? op : null, Vector3.zero);
                    box.transform.localScale = AgentJson.ToVector3(o.TryGetValue("scale", out var os) ? os : null, Vector3.one);
                    if (o.TryGetValue("layer", out var ol) && ol != null) box.layer = LayerMask.NameToLayer(ol.ToString());
                    box.GetComponent<Collider>().isTrigger = o.TryGetValue("trigger", out var ot) && ot is bool otb && otb;
                    spawned.Add(box);
                }
                if (spawned.Count > 0) Physics.SyncTransforms();
                var occList = AgentJob.List("occlusion_layers");
                int occMask = occList.Count > 0 ? Layers(occList, ~0) : ~(1 << 2);   // default: every layer but Ignore Raycast
                bool series = AgentJob.Bool("series", false);
                var vpSeries = new List<object>();
                Vector3? prevPos = null;
                var start = moveT ? moveT.position : Vector3.zero;
                // optional: animate a character while the camera runs (root motion off: move_target moves it)
                var animArgs = AgentJob.Dict("animate");
                Animator anim = null;
                if (animArgs.Count > 0)
                {
                    anim = AnimSampler.FindTarget(animArgs["target"].ToString());
                    anim.applyRootMotion = false;
                    anim.Rebind();
                    anim.Update(0f);
                    foreach (var kv in animArgs.TryGetValue("params", out var ap) ? (Dictionary<string, object>)ap : new Dictionary<string, object>())
                    {
                        if (kv.Value is bool bv) anim.SetBool(kv.Key, bv); else anim.SetFloat(kv.Key, (float)AgentJson.ToDouble(kv.Value));
                    }
                }
                try
                {
                    for (int i = 0; i <= n; i++)
                    {
                        float t = i / fps;
                        while (ei < events.Count && AgentJson.ToDouble(events[ei]["t"]) <= t + 1e-6)
                        {
                            foreach (var kv in (Dictionary<string, object>)events[ei]["priorities"])
                            {
                                var vc = GameObject.Find(kv.Key).GetComponent<CinemachineCamera>();
                                vc.Priority = (int)AgentJson.ToDouble(kv.Value);
                                // A new Priority is read in the camera's own Update(), which never runs in a batch job or an
                                // editor script: without Prioritize() the Brain keeps the old live camera (observed 2026-09-24).
                                vc.Prioritize();
                            }
                            ei++;
                        }
                        if (moveT) moveT.position = start + vel * t;
                        if (anim && i > 0) anim.Update(1f / fps);
                        brain.ManualUpdate(i + 1, 1f / fps);
                        var c = Camera.main.transform;
                        var vp = Camera.main.WorldToViewportPoint(target.position);
                        float up = Vector3.Dot(c.up, Vector3.up);
                        minUp = Mathf.Min(minUp, up);
                        float dist = (target.position - c.position).magnitude;
                        minDist = Mathf.Min(minDist, dist);   // a blend that dips toward zero swings through the target
                        bool occ = Physics.Linecast(c.position, target.position, out var hit, occMask, QueryTriggerInteraction.Ignore) && !hit.transform.IsChildOf(target.root);
                        if (occ) occluded++;
                        if (Physics.CheckSphere(c.position, 0.1f, occMask, QueryTriggerInteraction.Ignore)) inside++;
                        if (series) vpSeries.Add(new List<object> { Math.Round(vp.x, 5), Math.Round(vp.y, 5) });
                        if (prevPos.HasValue && i > 1) maxJump = Mathf.Max(maxJump, (c.position - prevPos.Value).magnitude * fps);
                        prevPos = c.position;
                        if (i % Mathf.Max(1, Mathf.RoundToInt(fps / 10)) == 0 || captures.Contains(i))
                            rows.Add(new Dictionary<string, object>
                            {
                                { "t", Math.Round(t, 3) }, { "live", brain.ActiveVirtualCamera?.Name }, { "blending", brain.IsBlending },
                                { "cam_pos", c.position }, { "target_vp", new Vector2(vp.x, vp.y) }, { "target_dist", Math.Round(vp.z, 3) },
                                { "up_dot", Math.Round(up, 4) }, { "occluded", occ },
                            });
                        if (captures.Contains(i))
                        {
                            var png = Path.Combine(outDir, "cam_" + t.ToString("0.00") + ".png");
                            AgentCapture.RenderCamera(Camera.main, AgentJob.Int("width", 640), AgentJob.Int("height", 360), png, 4);
                            shots.Add(png);
                        }
                    }
                }
                finally
                {
                    brain.UpdateMethod = keep;
                    if (moveT) moveT.position = start;
                    foreach (var g in spawned) UnityEngine.Object.DestroyImmediate(g);
                }
                return new Dictionary<string, object>
                {
                    { "rows", rows }, { "pngs", shots }, { "min_up_dot", Math.Round(minUp, 4) },
                    { "max_camera_speed", Math.Round(maxJump, 3) }, { "min_target_distance", Math.Round(minDist, 4) },
                    { "occluded_frames", occluded }, { "inside_geometry_frames", inside }, { "frames", n + 1 },
                    { "vp_series", series ? vpSeries : null }, { "fps", fps },
                };
            });
        }

        public static void AuditCameras()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var f = new AgentAudit.Findings();
                var scene = EditorSceneManager.GetActiveScene().path;
                var cams = UnityEngine.Object.FindObjectsByType<CinemachineVirtualCameraBase>(FindObjectsInactive.Include, FindObjectsSortMode.None);
                int glassLayers = 0;
                for (int li = 0; li < 32; li++)
                {
                    var ln = LayerMask.LayerToName(li);
                    if (!string.IsNullOrEmpty(ln) && System.Text.RegularExpressions.Regex.IsMatch(ln, "(?i)glass|window|transparent"))
                        if (UnityEngine.Object.FindObjectsByType<Collider>(FindObjectsSortMode.None).Any(col => col.gameObject.layer == li && !col.isTrigger)) glassLayers |= 1 << li;
                }
                var brains = UnityEngine.Object.FindObjectsByType<CinemachineBrain>(FindObjectsSortMode.None);
                if (cams.Length > 0 && brains.Length == 0)
                    f.Add("error", "cm.no_brain", scene, "CinemachineCameras but no CinemachineBrain on a Unity camera", "add CinemachineBrain to the Main Camera");
                foreach (var b in brains)
                {
                    if (b.UpdateMethod != CinemachineBrain.UpdateMethods.SmartUpdate)
                        f.Add("info", "cm.brain_update", b.name, "Update Method " + b.UpdateMethod + " (Smart Update is the recommended default)", "SmartUpdate unless physics-synced or manually driven");
                    if (b.BlendUpdateMethod == CinemachineBrain.BrainUpdateMethods.FixedUpdate && b.UpdateMethod != CinemachineBrain.UpdateMethods.FixedUpdate)
                        f.Add("warn", "cm.blend_fixed", b.name, "Fixed Update blends without Fixed Update cameras judder", "BlendUpdateMethod = LateUpdate");
                }
                var rows = new List<object>();
                foreach (var c in cams)
                {
                    var tn = c.GetType().Name;
                    if (tn == "CinemachineVirtualCamera" || tn == "CinemachineFreeLook")
                        f.Add("error", "cm.cm2_component", c.name, tn + " is a deprecated CM2 class", "retype references to CinemachineVirtualCameraBase, then the Cinemachine Upgrader (Upgrade Entire Project)");
                    var procPos = c.GetComponent<CinemachineFollow>() || c.GetComponent<CinemachineOrbitalFollow>() || c.GetComponent<CinemachineThirdPersonFollow>() || c.GetComponent<CinemachinePositionComposer>();
                    var parent = c.transform.parent;
                    if (procPos && parent != null && (parent.GetComponentInParent<Animator>() || parent.GetComponentInParent<Rigidbody>()) && !parent.GetComponent<CinemachineSplineCart>())
                        f.Add("warn", "cm.procedural_parented_to_mover", c.name, "procedural camera parented to a moving object (CM3.1 series XTVzs4B1d7I [00:03:42])", "unparent; use a tracking target");
                    var fo = c.GetComponent<CinemachineFollow>();
                    if (fo && fo.TrackerSettings.PositionDamping == Vector3.zero)
                        f.Add("info", "cm.zero_damping", c.name, "follow damping is zero: every target jolt reaches the camera", "some damping unless intended");
                    var orb = c.GetComponent<CinemachineOrbitalFollow>();
                    if (orb && !c.GetComponent<CinemachineInputAxisController>())
                        f.Add("warn", "cm.orbit_no_input", c.name, "Orbital Follow without an input axis controller takes no input", "add CinemachineInputAxisController");
                    var tp = c.GetComponent<CinemachineThirdPersonFollow>();
                    if (tp && tp.AvoidObstacles.Enabled && string.IsNullOrEmpty(tp.AvoidObstacles.IgnoreTag))
                        f.Add("warn", "cm.avoid_no_ignore_tag", c.name, "obstacle avoidance without an Ignore Tag counts the player as an obstacle", "IgnoreTag = the player's tag");
                    var deo = c.GetComponent<CinemachineDeoccluder>();
                    if (deo && deo.AvoidObstacles.Enabled && string.IsNullOrEmpty(deo.IgnoreTag))
                        f.Add("warn", "cm.deoccluder_no_ignore_tag", c.name, "Deoccluder without an Ignore Tag: the player's own colliders count as obstacles", "IgnoreTag = the player's tag (u0a1F6BlczE [00:10:45])");
                    if (deo && deo.TransparentLayers == 0 && glassLayers != 0 && (deo.CollideAgainst & glassLayers) != 0)
                        f.Add("info", "cm.deoccluder_glass_blocks", c.name, "Deoccluder collides with layers named like glass or windows but has no Transparent Layers: the camera jumps in front of every window",
                              "add those layers to TransparentLayers (keep them in Collide Against so the camera still cannot enter them)");
                    // FreeLook (Orbital Follow) + Camera Offset + Deoccluder: the offset extension fights the Deoccluder
                    // (Unity CM3.1 series u0a1F6BlczE [00:02:41]): over-the-shoulder with collision = Third Person Follow
                    if (orb && deo && c.GetComponent<CinemachineCameraOffset>())
                        f.Add("warn", "cm.freelook_offset_deoccluder", c.name, "Orbital Follow + Camera Offset + Deoccluder: the offset does not work well with the Deoccluder (over-the-shoulder clips or pops)",
                              "over-the-shoulder with collision: Third Person Follow (built-in avoidance) or Position Composer + Pan Tilt");
                    // Any procedural Position Control overrides animation and script movement (XTVzs4B1d7I [00:03:10])
                    if (procPos && c.GetComponent<Animator>())
                        f.Add("warn", "cm.procedural_overrides_animation", c.name, "camera has a procedural Position Control AND an Animator: the Position Control overrides the keyframed motion",
                              "animated camera: Position Control and Rotation Control empty (or animate the target instead)");
                    if (c is CinemachineStateDrivenCamera sd && sd.Instructions != null)
                        foreach (var ins in sd.Instructions)
                            if (ins.MinDuration <= 0f)
                                f.Add("warn", "cm.state_driven_min_zero", c.name, "instruction with Min 0: flickering states thrash the camera", "Min about 1 s");
                    rows.Add(new Dictionary<string, object> { { "name", c.name }, { "type", tn }, { "priority", c is CinemachineCamera cc ? (int)cc.Priority : 0 } });
                }
                return new Dictionary<string, object> { { "scene", scene }, { "cameras", rows }, { "findings", f.items }, { "counts", f.Counts() } };
            });
        }
    }
}
