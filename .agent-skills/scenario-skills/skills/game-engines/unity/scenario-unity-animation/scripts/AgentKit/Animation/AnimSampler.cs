// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). The animator's eyes: a lit lab scene, and
// deterministic sampling of an Animator (states, blend trees, layers) with bone data and captures.
//
// Why: every expert in the sources judges animation by watching it play (feet, blends, masks). An agent
// cannot scrub the Animator window, so it steps the Animator by hand in edit mode (Animator.Rebind, then
// Animator.Update(dt) in fixed steps), records bones as numbers, and renders frames it then looks at.
//
// Jobs:
//   AgentKit.Animation.AnimSampler.BuildLab      args: model, controller, scene, textures[], name
//   AgentKit.Animation.AnimSampler.SampleStates  args: scene, target, samples[{name, params{}, triggers[], layer_weights{},
//                                                 seconds, fps, events[{t, params{}, triggers[]}], trace, controller | clip}],
//                                                 bones[HumanBodyBones], capture{width, height, offset, look_height}, root_motion (false)
//        rows carry state, next_state, in_transition and Animator.gravityWeight; trace adds one row per frame.
//   AgentKit.Animation.AnimSampler.LocomotionMetrics args: scene, target, params{}, seconds, fps, warmup, clip, script_speed
//        clip: play one clip alone (a probe controller) to measure its root drift and where the baked pose sits
// Unity calls: PrefabUtility.InstantiatePrefab (model prefab of the FBX), Animator.runtimeAnimatorController,
// Animator.Rebind / Update / SetFloat / SetBool / SetTrigger / SetLayerWeight, GetCurrentAnimatorStateInfo,
// GetBoneTransform(HumanBodyBones), AgentCapture.CaptureView (RenderPipeline.SubmitRenderRequest).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-animation/test_live_animation.py::test_04, test_05.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace AgentKit.Animation
{
    public static class AnimSampler
    {
        public const string DefaultScene = "Assets/AnimLab/AnimLab.unity";

        // ------------------------------------------------------------------ lab scene
        public static void BuildLab()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene", DefaultScene);
                var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
                var dir = Path.GetDirectoryName(scenePath).Replace('\\', '/');
                Directory.CreateDirectory(AgentJob.ResolvePath(dir + "/Materials"));

                // checker ground: foot sliding and root-motion drift are readable against a grid
                var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
                ground.name = "Ground";
                ground.transform.localScale = new Vector3(6, 1, 6);
                ground.GetComponent<Renderer>().sharedMaterial = CheckerMaterial(dir + "/Materials");

                var sun = GameObject.Find("Directional Light");
                if (sun) sun.transform.rotation = Quaternion.Euler(40f, -30f, 0f);

                var model = AssetDatabase.LoadAssetAtPath<GameObject>(AgentJob.Str("model"));
                if (model == null) throw new FileNotFoundException("model not found: " + AgentJob.Str("model"));
                var hero = (GameObject)PrefabUtility.InstantiatePrefab(model, scene);
                hero.name = AgentJob.Str("name", "Hero");
                hero.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
                var anim = AnimUtil.GetOrAdd<Animator>(hero);
                var ctrl = AgentJob.Str("controller");
                if (!string.IsNullOrEmpty(ctrl)) anim.runtimeAnimatorController = AssetDatabase.LoadAssetAtPath<RuntimeAnimatorController>(ctrl);
                anim.applyRootMotion = true;
                anim.cullingMode = AnimatorCullingMode.CullUpdateTransforms;   // [added] root-motion movers keep moving offscreen
                var mats = AgentJob.List("textures").Select(t => LitFromTexture(dir + "/Materials", t.ToString())).ToList();
                int mi = 0;
                foreach (var r in hero.GetComponentsInChildren<Renderer>())
                {
                    var arr = r.sharedMaterials;
                    for (int i = 0; i < arr.Length; i++) arr[i] = mats.Count > 0 ? mats[Math.Min(mi++, mats.Count - 1)] : LitColor(dir + "/Materials", "M_Hero", new Color(0.55f, 0.6f, 0.7f));
                    r.sharedMaterials = arr;
                }
                // camera target at chest height: cameras follow a proxy, never the mesh pivot (Unity CM3.1 series)
                var target = new GameObject("CameraTarget");
                target.transform.SetParent(hero.transform, false);
                target.transform.localPosition = new Vector3(0, 1.5f, 0);

                var cam = Camera.main;
                cam.transform.position = new Vector3(2.2f, 1.6f, 3.4f);
                cam.transform.LookAt(new Vector3(0, 1.0f, 0));
                cam.fieldOfView = 40f;
                AgentCapture.SaveBookmark("Front", new Vector3(0.9f, 1.4f, 3.6f), new Vector3(0, 1.0f, 0), 40f);
                AgentCapture.SaveBookmark("Side", new Vector3(3.8f, 1.2f, 0.2f), new Vector3(0, 1.0f, 0), 40f);
                EditorSceneManager.SaveScene(scene, scenePath);
                return new Dictionary<string, object>
                {
                    { "scene", scenePath }, { "hero", hero.name }, { "avatar", anim.avatar ? anim.avatar.name : null },
                    { "avatar_human", anim.avatar && anim.avatar.isHuman }, { "controller", ctrl },
                    { "renderers", hero.GetComponentsInChildren<Renderer>().Length },
                    { "height", Math.Round(Bounds(hero).size.y, 3) },
                };
            });
        }

        static Bounds Bounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            var b = rs.Length > 0 ? rs[0].bounds : new Bounds(go.transform.position, Vector3.zero);
            foreach (var r in rs) b.Encapsulate(r.bounds);
            return b;
        }

        static Material CheckerMaterial(string dir)
        {
            var texPath = dir + "/T_Checker.png";
            if (!File.Exists(AgentJob.ResolvePath(texPath)))
            {
                var t = new Texture2D(256, 256, TextureFormat.RGBA32, false);
                for (int y = 0; y < 256; y++)
                    for (int x = 0; x < 256; x++)
                        t.SetPixel(x, y, ((x / 32 + y / 32) & 1) == 0 ? new Color(0.62f, 0.62f, 0.6f) : new Color(0.38f, 0.39f, 0.4f));
                t.Apply();
                File.WriteAllBytes(AgentJob.ResolvePath(texPath), t.EncodeToPNG());
                UnityEngine.Object.DestroyImmediate(t);
                AssetDatabase.ImportAsset(texPath, ImportAssetOptions.ForceSynchronousImport);
            }
            var m = LitColor(dir, "M_Checker", Color.white);
            m.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(texPath));
            m.SetTextureScale("_BaseMap", new Vector2(15, 15));   // 60 m plane, 32 px squares: 0.5 m per square
            EditorUtility.SetDirty(m);
            return m;
        }

        static Material LitColor(string dir, string name, Color c)
        {
            var path = dir + "/" + name + ".mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) { m = new Material(Shader.Find("Universal Render Pipeline/Lit")); AssetDatabase.CreateAsset(m, path); }
            m.SetColor("_BaseColor", c);
            m.SetFloat("_Smoothness", 0.25f);
            EditorUtility.SetDirty(m);
            return m;
        }

        static Material LitFromTexture(string dir, string texPath)
        {
            var m = LitColor(dir, "M_" + Path.GetFileNameWithoutExtension(texPath), Color.white);
            m.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(texPath));
            EditorUtility.SetDirty(m);
            return m;
        }

        // ------------------------------------------------------------------ sampling
        /// <summary>Find the Animator to sample and force Culling Mode to Always Animate. Observed 2026-09-24:
        /// with Cull Update Transforms or Cull Completely, Animator.Update in a batch job writes NO transform
        /// (no camera has rendered the character, so its renderers count as invisible): every bone stays at the
        /// bind pose, captures show a T-pose, and later samples animate only after a capture made the renderer
        /// visible. The scene is not saved by the sampling jobs, so the game setting is untouched.</summary>
        public static Animator FindTarget(string name)
        {
            var go = GameObject.Find(name);
            if (go == null) throw new ArgumentException("target '" + name + "' not in the open scene");
            var a = AnimUtil.Require(go.GetComponent<Animator>(), name + " has no Animator");
            if (a.runtimeAnimatorController == null) throw new ArgumentException(name + " Animator has no controller");
            a.cullingMode = AnimatorCullingMode.AlwaysAnimate;
            // Several captures in one editor update: skinning must be recomputed per render, or the mesh shows a
            // stale pose (bones moved, mesh did not; observed 2026-09-24).
            foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>())
            {
                smr.forceMatrixRecalculationPerRender = true;
                smr.updateWhenOffscreen = true;
            }
            return a;
        }

        static void OpenScene()
        {
            var scene = AgentJob.Str("scene", DefaultScene);
            if (EditorSceneManager.GetActiveScene().path != scene) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
        }

        /// <summary>Reset the Animator and step it with the given parameters: deterministic in edit mode.
        /// events: [{t, params{}, triggers[]}] applied when the clock reaches t (later params replace earlier ones),
        /// to fire a trigger in the middle of a transition (interruption probes).</summary>
        public static void Step(Animator a, Dictionary<string, object> pars, List<object> triggers, Dictionary<string, object> weights,
                                float seconds, float fps, Action<float> perFrame = null, List<object> events = null)
        {
            a.Rebind();
            a.Update(0f);
            var live = new Dictionary<string, object>(pars ?? new Dictionary<string, object>());
            ApplyParams(a, live, weights);
            foreach (var t in triggers ?? new List<object>()) a.SetTrigger(t.ToString());
            var evs = (events ?? new List<object>()).Cast<Dictionary<string, object>>().OrderBy(e => AgentJson.ToDouble(e["t"])).ToList();
            int ei = 0;
            int n = Mathf.Max(1, Mathf.RoundToInt(seconds * fps));
            float dt = 1f / fps;
            for (int i = 0; i < n; i++)
            {
                while (ei < evs.Count && AgentJson.ToDouble(evs[ei]["t"]) <= i * dt + 1e-6)
                {
                    if (evs[ei].TryGetValue("params", out var ep) && ep is Dictionary<string, object> epd)
                        foreach (var kv in epd) live[kv.Key] = kv.Value;
                    if (evs[ei].TryGetValue("triggers", out var et) && et is List<object> etl)
                        foreach (var t in etl) a.SetTrigger(t.ToString());
                    ei++;
                }
                ApplyParams(a, live, weights);
                a.Update(dt);
                perFrame?.Invoke((i + 1) * dt);
            }
        }

        /// <summary>A one-state controller playing a single clip, reused across calls (its asset is updated in place).
        /// Lets any clip be measured on the lab character without touching the game's controller.</summary>
        public static RuntimeAnimatorController ProbeController(string motionRef)
        {
            var clip = AnimUtil.Require(AnimControllerBuilder.LoadMotion(motionRef) as AnimationClip, "not a clip: " + motionRef);
            var dir = AgentJob.Str("probe_dir", "Assets/AgentKitProbes");
            Directory.CreateDirectory(AgentJob.ResolvePath(dir));
            var path = dir + "/ClipProbe.controller";
            var ac = AssetDatabase.LoadAssetAtPath<AnimatorController>(path);
            if (ac == null) return AnimatorController.CreateAnimatorControllerAtPathWithClip(path, clip);
            ac.layers[0].stateMachine.states[0].state.motion = clip;
            EditorUtility.SetDirty(ac);
            return ac;
        }

        public static string NextStateName(Animator a, int layer)
        {
            if (!a.IsInTransition(layer)) return null;
            var info = a.GetNextAnimatorStateInfo(layer);
            var ac = a.runtimeAnimatorController as AnimatorController;
            if (ac == null) return info.shortNameHash.ToString();
            foreach (var cs in ac.layers[layer].stateMachine.states)
                if (cs.state.nameHash == info.shortNameHash) return cs.state.name;
            return info.shortNameHash.ToString();
        }

        static void ApplyParams(Animator a, Dictionary<string, object> pars, Dictionary<string, object> weights)
        {
            foreach (var kv in pars ?? new Dictionary<string, object>())
            {
                var p = a.parameters.FirstOrDefault(x => x.name == kv.Key) ?? throw new ArgumentException("unknown parameter " + kv.Key);
                if (p.type == AnimatorControllerParameterType.Float) a.SetFloat(kv.Key, (float)AgentJson.ToDouble(kv.Value));
                else if (p.type == AnimatorControllerParameterType.Int) a.SetInteger(kv.Key, (int)AgentJson.ToDouble(kv.Value));
                else if (p.type == AnimatorControllerParameterType.Bool) a.SetBool(kv.Key, kv.Value is bool b && b);
            }
            foreach (var kv in weights ?? new Dictionary<string, object>())
                a.SetLayerWeight(a.GetLayerIndex(kv.Key), (float)AgentJson.ToDouble(kv.Value));
        }

        public static string CurrentStateName(Animator a, int layer)
        {
            var info = a.GetCurrentAnimatorStateInfo(layer);
            var ac = a.runtimeAnimatorController as AnimatorController;
            if (ac == null) return info.shortNameHash.ToString();
            foreach (var cs in ac.layers[layer].stateMachine.states)
                if (cs.state.nameHash == info.shortNameHash) return cs.state.name;
            return info.shortNameHash.ToString();
        }

        static Dictionary<string, object> Bones(Animator a, List<object> names)
        {
            var d = new Dictionary<string, object>();
            foreach (var n in names)
            {
                var hb = (HumanBodyBones)Enum.Parse(typeof(HumanBodyBones), n.ToString());
                var t = a.GetBoneTransform(hb);
                if (t == null) continue;
                d[n.ToString()] = new Dictionary<string, object> { { "local_rot", t.localRotation }, { "pos", t.position } };
            }
            return d;
        }

        public static void SampleStates()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var a = FindTarget(AgentJob.Str("target", "Hero"));
                a.applyRootMotion = AgentJob.Bool("root_motion", false);   // pose sheets stay in place
                var cap = AgentJob.Dict("capture");
                bool capture = cap.Count > 0;
                if (capture) AgentCapture.RequireGraphics();
                int w = cap.TryGetValue("width", out var cw) ? (int)AgentJson.ToDouble(cw) : 640;
                int h = cap.TryGetValue("height", out var ch) ? (int)AgentJson.ToDouble(ch) : 480;
                var offset = cap.TryGetValue("offset", out var co) ? AgentJson.ToVector3(co, new Vector3(1.6f, 1.3f, 2.8f)) : new Vector3(1.6f, 1.3f, 2.8f);
                float lookH = cap.TryGetValue("look_height", out var lh) ? (float)AgentJson.ToDouble(lh) : 0.95f;
                var outDir = AgentJob.OutDir("samples");
                var bones = AgentJob.List("bones");
                var results = new List<object>();
                var gameController = a.runtimeAnimatorController;
                foreach (var so in AgentJob.List("samples"))
                {
                    var s = (Dictionary<string, object>)so;
                    var name = s.TryGetValue("name", out var n) ? n.ToString() : "sample" + results.Count;
                    // per-sample controller: a probe controller asset, or a single clip (ProbeController)
                    if (s.TryGetValue("controller", out var cpath) && cpath != null)
                        a.runtimeAnimatorController = AnimUtil.Require(AssetDatabase.LoadAssetAtPath<RuntimeAnimatorController>(cpath.ToString()), "no controller at " + cpath);
                    else if (s.TryGetValue("clip", out var cref) && cref != null)
                        a.runtimeAnimatorController = ProbeController(cref.ToString());
                    else a.runtimeAnimatorController = gameController;
                    bool trace = s.TryGetValue("trace", out var tro) && tro is bool tb && tb;
                    var traceRows = new List<object>();
                    var traceBones = trace ? bones.Take(1).Select(x => a.GetBoneTransform((HumanBodyBones)Enum.Parse(typeof(HumanBodyBones), x.ToString()))).FirstOrDefault() : null;
                    Quaternion? prevRot = null;
                    float sfps = s.TryGetValue("fps", out var fps) ? (float)AgentJson.ToDouble(fps) : 60f;
                    Step(a, s.TryGetValue("params", out var p) ? p as Dictionary<string, object> : null,
                         s.TryGetValue("triggers", out var tr) ? tr as List<object> : null,
                         s.TryGetValue("layer_weights", out var lw) ? lw as Dictionary<string, object> : null,
                         s.TryGetValue("seconds", out var sec) ? (float)AgentJson.ToDouble(sec) : 0.5f,
                         sfps,
                         trace ? (Action<float>)(t =>
                         {
                             // per-frame bone angular speed of the first listed bone: a flat stretch after an
                             // interruption is the frozen snapshot pose the new blend starts from
                             float angSpeed = 0f;
                             if (traceBones != null)
                             {
                                 if (prevRot.HasValue) angSpeed = Quaternion.Angle(prevRot.Value, traceBones.localRotation) * sfps;
                                 prevRot = traceBones.localRotation;
                             }
                             traceRows.Add(new Dictionary<string, object>
                             {
                                 { "t", Math.Round(t, 4) }, { "state", CurrentStateName(a, 0) }, { "next", NextStateName(a, 0) },
                                 { "tr_t", a.IsInTransition(0) ? Math.Round(a.GetAnimatorTransitionInfo(0).normalizedTime, 3) : (double?)null },
                                 { "gw", Math.Round(a.gravityWeight, 4) }, { "bone_deg_s", Math.Round(angSpeed, 2) },
                             });
                         }) : null,
                         s.TryGetValue("events", out var ev) ? ev as List<object> : null);
                    var row = new Dictionary<string, object>
                    {
                        { "name", name }, { "state", CurrentStateName(a, 0) }, { "next_state", NextStateName(a, 0) },
                        { "in_transition", a.IsInTransition(0) },
                        { "normalized_time", Math.Round(a.GetCurrentAnimatorStateInfo(0).normalizedTime, 3) },
                        // 1 on clips with root Y baked, 0 on Y-unbaked clips, blended across transitions (6.3 Manual)
                        { "gravity_weight", Math.Round(a.gravityWeight, 4) },
                        { "controller", a.runtimeAnimatorController.name },
                        { "root", a.transform.position }, { "bones", Bones(a, bones) },
                    };
                    if (trace) row["trace"] = traceRows;
                    var layerStates = new Dictionary<string, object>();
                    for (int l = 1; l < a.layerCount; l++) layerStates[a.GetLayerName(l)] = CurrentStateName(a, l) + " w=" + a.GetLayerWeight(l);
                    row["layers"] = layerStates;
                    if (capture)
                    {
                        var pivot = a.transform.position;
                        var view = new Dictionary<string, object>
                        {
                            { "name", name },
                            { "position", new List<object> { (double)(pivot.x + offset.x), (double)(pivot.y + offset.y), (double)(pivot.z + offset.z) } },
                            { "look_at", new List<object> { (double)pivot.x, (double)(pivot.y + lookH), (double)pivot.z } },
                            { "fov", 40.0 },
                        };
                        var png = Path.Combine(outDir, name + ".png");
                        AgentCapture.CaptureView(Camera.main, view, w, h, png, 4);
                        row["png"] = png;
                    }
                    results.Add(row);
                }
                a.runtimeAnimatorController = gameController;
                return new Dictionary<string, object> { { "samples", results }, { "controller", gameController.name } };
            });
        }

        /// <summary>Profile a clip on a model (AnimationMode.SampleAnimationClip, no controller): hips speed,
        /// arm drop and foot heights per step. Finds usable segments in long mocap takes (standing idles,
        /// cycles) by numbers; takes usually start with a T-pose calibration (arm_drop near 0).</summary>
        public static void ClipProfile()
        {
            AgentJob.Run(() =>
            {
                var model = AnimUtil.Require(AssetDatabase.LoadAssetAtPath<GameObject>(AgentJob.Str("model")), "model not found: " + AgentJob.Str("model"));
                var clip = AnimUtil.Require(AnimControllerBuilder.LoadMotion(AgentJob.Str("clip")) as AnimationClip, "not an AnimationClip: " + AgentJob.Str("clip"));
                float step = AgentJob.Float("step", 0.1f);
                var go = (GameObject)UnityEngine.Object.Instantiate(model);
                go.hideFlags = HideFlags.HideAndDontSave;
                try
                {
                    var an = go.GetComponent<Animator>();
                    var hips = an.GetBoneTransform(HumanBodyBones.Hips);
                    var ua = an.GetBoneTransform(HumanBodyBones.LeftUpperArm);
                    var la = an.GetBoneTransform(HumanBodyBones.LeftLowerArm);
                    var lf = an.GetBoneTransform(HumanBodyBones.LeftFoot);
                    var rf = an.GetBoneTransform(HumanBodyBones.RightFoot);
                    var rows = new List<object>();
                    Vector3? prev = null;
                    AnimationMode.StartAnimationMode();
                    try
                    {
                        for (float t = 0; t <= clip.length + 1e-4f; t += step)
                        {
                            AnimationMode.BeginSampling();
                            AnimationMode.SampleAnimationClip(go, clip, t);
                            AnimationMode.EndSampling();
                            var hp = hips.position;
                            float speed = prev.HasValue ? new Vector2(hp.x - prev.Value.x, hp.z - prev.Value.z).magnitude / step : 0f;
                            prev = hp;
                            // arm_drop: 0 = arm horizontal (T-pose), 1 = arm hanging straight down
                            float drop = -Vector3.Dot((la.position - ua.position).normalized, Vector3.up);
                            rows.Add(new Dictionary<string, object>
                            {
                                { "t", Math.Round(t, 3) }, { "hips_speed", Math.Round(speed, 3) }, { "arm_drop", Math.Round(drop, 3) },
                                { "hips_y", Math.Round(hp.y, 3) }, { "lfoot_y", Math.Round(lf.position.y, 3) }, { "rfoot_y", Math.Round(rf.position.y, 3) },
                            });
                        }
                    }
                    finally { AnimationMode.StopAnimationMode(); }
                    return new Dictionary<string, object> { { "clip", clip.name }, { "length", clip.length }, { "frame_rate", clip.frameRate }, { "rows", rows } };
                }
                finally { UnityEngine.Object.DestroyImmediate(go); }
            });
        }

        /// <summary>Root motion on: measured ground speed and planted-foot slide over a run of fixed steps.</summary>
        public static void LocomotionMetrics()
        {
            AgentJob.Run(() =>
            {
                OpenScene();
                var a = FindTarget(AgentJob.Str("target", "Hero"));
                a.applyRootMotion = AgentJob.Bool("root_motion", true);
                var clipRef = AgentJob.Str("clip");
                var gameController = a.runtimeAnimatorController;
                if (!string.IsNullOrEmpty(clipRef)) a.runtimeAnimatorController = ProbeController(clipRef);
                float fps = AgentJob.Float("fps", 60f), seconds = AgentJob.Float("seconds", 3f), warm = AgentJob.Float("warmup", 1f);
                var pars = AgentJob.Dict("params");
                var lf = a.GetBoneTransform(HumanBodyBones.LeftFoot);
                var rf = a.GetBoneTransform(HumanBodyBones.RightFoot);
                var lt = AnimUtil.Or(a.GetBoneTransform(HumanBodyBones.LeftToes), lf);
                var rt = AnimUtil.Or(a.GetBoneTransform(HumanBodyBones.RightToes), rf);
                // script_speed: in-place playback moved by a script at that speed (root motion off), the setup
                // that slides when the script speed and the clip speed disagree (Ketra Games mNxEetKzc04 [00:00:32])
                float scriptSpeed = AgentJob.Float("script_speed", -1f);
                if (scriptSpeed >= 0f) a.applyRootMotion = false;
                var samples = new List<object>();
                Vector3 startPos = Vector3.zero;
                bool started = false;
                a.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
                Vector3 Contact(Transform foot, Transform toes) => foot.position.y <= toes.position.y ? foot.position : toes.position;
                Step(a, pars, null, null, warm + seconds, fps, t =>
                {
                    if (scriptSpeed >= 0f) a.transform.position += a.transform.forward * scriptSpeed / fps;
                    if (t < warm) return;
                    if (!started) { startPos = a.transform.position; started = true; }
                    samples.Add(new Dictionary<string, object>
                    {
                        { "t", Math.Round(t - warm, 5) }, { "left", Contact(lf, lt) }, { "right", Contact(rf, rt) }, { "root", a.transform.position },
                    });
                });
                var end = a.transform.position;
                var dist = new Vector2(end.x - startPos.x, end.z - startPos.z).magnitude;
                var yaw = a.transform.eulerAngles.y;
                // where the baked pose sits relative to its GameObject: Based Upon changes THIS (the reference the pose
                // keeps), not the drift. Body (mass centre) yaw and XZ offset from the root, at the end of the run.
                var bodyFwd = Vector3.ProjectOnPlane(a.bodyRotation * Vector3.forward, Vector3.up);
                float poseYaw = Vector3.SignedAngle(Vector3.ProjectOnPlane(a.transform.forward, Vector3.up), bodyFwd, Vector3.up);
                var bp = a.bodyPosition;
                float poseXZ = new Vector2(bp.x - end.x, bp.z - end.z).magnitude;
                string state = CurrentStateName(a, 0);
                a.transform.SetPositionAndRotation(Vector3.zero, Quaternion.identity);   // leave the scene as found
                a.runtimeAnimatorController = gameController;
                return new Dictionary<string, object>
                {
                    { "state", state }, { "clip", string.IsNullOrEmpty(clipRef) ? null : clipRef }, { "seconds", seconds },
                    { "distance", Math.Round(dist, 4) }, { "ground_speed", Math.Round(dist / seconds, 4) }, { "final_yaw", Math.Round(yaw, 2) },
                    { "pose_yaw_offset_deg", Math.Round(poseYaw, 2) }, { "pose_xz_offset_m", Math.Round(poseXZ, 4) },
                    { "samples", AgentJob.Bool("return_samples", true) ? samples : new List<object>() },
                };
            });
        }
    }
}
