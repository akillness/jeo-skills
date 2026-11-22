// AgentKit.Vfx v0.1 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// VFX Graph from an agent: the supported route is "black box with a public API" (VFX Graph e-book,
// Levels of editing): copy a template graph, then drive it only through exposed properties and events
// from C#. Authoring a graph (adding a property, an event, a block) has no public API; see
// EditorGraph/VfxGraphAuthoring.cs (unsupported, friend assembly) or do it in the GUI.
// Jobs:
//   CopyTemplate  args: template ("02_Simple_Loop"), dest ("Assets/VFX/Graph/VFX_Loop.vfx")
//   Author        args: asset, property, value, block, slot, event, capacity   (calls VfxGraphAuthoring by reflection)
//   Contract      args: asset, expect_properties [..], expect_events [..]      (public API only)
//   PlayTest      async, graphics: args asset, property, rate, rate2, event, instances, out_dir
//                 Play mode, offscreen camera target (batch Play mode renders nothing otherwise, and a VFX
//                 no camera renders is culled and not simulated), property set + SendEvent, then a timeline of
//                 aliveParticleCount per frame (deferred commands: SendEvent runs after LateUpdate; the count
//                 refreshes about once a second), a capture, a second rate, N instances for batching info, and a
//                 culling check with the camera turned away.
//   ImportPointCache args: path (.pCache written by ut_vfx.write_pcache) -> imported asset type and point count
// Package types (PointCacheAsset) are reached by reflection so this file compiles without VFX Graph.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.VFX;

namespace AgentKit.Vfx
{
    public static class VfxGraphJobs
    {
        public const string TemplateFolder = "Packages/com.unity.visualeffectgraph/Editor/Templates/";
        public const string PlayKey = "AgentKit.Vfx.GraphPlay";

        public static void CopyTemplate()
        {
            AgentJob.Run(() =>
            {
                var template = AgentJob.Str("template", "02_Simple_Loop");
                var dest = AgentJob.Str("dest", "Assets/VFX/Graph/VFX_" + template + ".vfx");
                var src = TemplateFolder + template + ".vfx";
                if (AssetDatabase.LoadMainAssetAtPath(src) == null) throw new FileNotFoundException("template not found (is com.unity.visualeffectgraph installed?): " + src);
                Directory.CreateDirectory(Path.Combine(AgentJob.ProjectRoot, Path.GetDirectoryName(dest)));
                if (AssetDatabase.LoadMainAssetAtPath(dest) != null) AssetDatabase.MoveAssetToTrash(dest);
                if (!AssetDatabase.CopyAsset(src, dest)) throw new InvalidOperationException("CopyAsset failed: " + src + " -> " + dest);
                AssetDatabase.ImportAsset(dest, ImportAssetOptions.ForceSynchronousImport);
                var asset = AssetDatabase.LoadAssetAtPath<VisualEffectAsset>(dest);
                var res = ContractOf(asset);
                res["asset"] = dest;
                res["template"] = src;
                res["templates_available"] = Directory.GetFiles(Path.GetFullPath(TemplateFolder), "*.vfx").Select(Path.GetFileNameWithoutExtension).ToList();
                return res;
            });
        }

        public static Dictionary<string, object> ContractOf(VisualEffectAsset asset)
        {
            if (asset == null) throw new ArgumentNullException(nameof(asset));
            var props = new List<VFXExposedProperty>();
            asset.GetExposedProperties(props);
            var events = new List<string>();
            asset.GetEvents(events);
            return new Dictionary<string, object>
            {
                { "exposed", props.Select(p => (object)(p.name + ":" + (p.type != null ? p.type.Name : "?"))).ToList() },
                { "events", events.Cast<object>().ToList() },
            };
        }

        public static void Contract()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("asset");
                var asset = AssetDatabase.LoadAssetAtPath<VisualEffectAsset>(path);
                if (asset == null) throw new FileNotFoundException("VisualEffectAsset not found: " + path);
                var c = ContractOf(asset);
                var exposed = ((List<object>)c["exposed"]).Select(o => o.ToString()).ToList();
                var events = ((List<object>)c["events"]).Select(o => o.ToString()).ToList();
                var missing = new List<object>();
                foreach (var p in AgentJob.List("expect_properties").Select(o => o.ToString()))
                    if (!exposed.Any(e => e == p || e.StartsWith(p + ":"))) missing.Add("property:" + p);
                foreach (var e in AgentJob.List("expect_events").Select(o => o.ToString()))
                    if (!events.Contains(e)) missing.Add("event:" + e);
                c["missing"] = missing;
                c["asset"] = path;
                if (missing.Count > 0) AgentJob.Warn("contract broken: " + string.Join(", ", missing.Select(m => m.ToString())));
                return c;
            });
        }

        public static void Author()
        {
            AgentJob.Run(() =>
            {
                var t = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("AgentKit.VfxGraph.VfxGraphAuthoring")).FirstOrDefault(x => x != null);
                if (t == null) throw new InvalidOperationException("AgentKit.VfxGraph.VfxGraphAuthoring not compiled: install scripts/EditorGraph (ut_vfx.install) in a project with VFX Graph 17.3");
                var m = t.GetMethod("AddExposedFloatAndEvent");
                var path = AgentJob.Str("asset");
                var res = (Dictionary<string, object>)m.Invoke(null, new object[] {
                    path, AgentJob.Str("property", "Rate"), AgentJob.Float("value", 64f), AgentJob.Str("block", "VFXSpawnerConstantRate"),
                    AgentJob.Str("slot", "Rate"), AgentJob.Str("event", "Fire"), AgentJob.Int("capacity", 0) });
                var asset = AssetDatabase.LoadAssetAtPath<VisualEffectAsset>(path);
                res["contract_after"] = ContractOf(asset);
                var d = t.GetMethod("Describe");
                if (d != null) res["graph"] = d.Invoke(null, new object[] { path });
                return res;
            });
        }

        public static void ImportPointCache()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("path");
                AssetDatabase.ImportAsset(path, ImportAssetOptions.ForceSynchronousImport);
                var obj = AssetDatabase.LoadMainAssetAtPath(path);
                if (obj == null) throw new InvalidOperationException("pCache did not import: " + path);
                var type = obj.GetType();
                object count = type.GetField("PointCount")?.GetValue(obj);
                var surfaces = type.GetField("surfaces")?.GetValue(obj) as Texture2D[];
                return new Dictionary<string, object>
                {
                    { "path", path }, { "type", type.FullName }, { "point_count", count },
                    { "surfaces", surfaces != null ? surfaces.Select(s => (object)(s != null ? s.name + " " + s.width + "x" + s.height + " " + s.format : "null")).ToList() : null },
                };
            });
        }

        /// <summary>Bake a mesh to an SDF Texture3D asset with the public MeshToSDFBaker (through
        /// AgentKit.VfxGraph.VfxSdf, compiled only with VFX Graph). args: mesh ("builtin:Sphere" or an asset path),
        /// asset (Assets/VFX/Graph/SDF_X.asset), max_res (64), padding (0.1)</summary>
        public static void BakeSdf()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var t = AppDomain.CurrentDomain.GetAssemblies().Select(a => a.GetType("AgentKit.VfxGraph.VfxSdf")).FirstOrDefault(x => x != null);
                if (t == null) throw new InvalidOperationException("AgentKit.VfxGraph.VfxSdf not compiled: install scripts/EditorGraph with VFX Graph present");
                var meshArg = AgentJob.Str("mesh", "builtin:Sphere");
                Mesh mesh = meshArg.StartsWith("builtin:") ? Resources.GetBuiltinResource<Mesh>(meshArg.Substring(8) + ".fbx")
                                                           : AssetDatabase.LoadAssetAtPath<Mesh>(meshArg);
                if (mesh == null) throw new FileNotFoundException("mesh not found: " + meshArg);
                var res = (Dictionary<string, object>)t.GetMethod("BakeToAsset").Invoke(null, new object[] {
                    mesh, AgentJob.Str("asset", "Assets/VFX/Graph/SDF_" + mesh.name + ".asset"), AgentJob.Int("max_res", 64), AgentJob.Float("padding", 0.1f) });
                res["mesh"] = meshArg;
                return res;
            });
        }

        // ------------------------------------------------------------------ Play-mode test
        public static void PlayTest()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                AgentJob.BeginAsync();
                var assetPath = AgentJob.Str("asset");
                var asset = AssetDatabase.LoadAssetAtPath<VisualEffectAsset>(assetPath);
                if (asset == null) throw new FileNotFoundException("VisualEffectAsset not found: " + assetPath);
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var camGo = new GameObject("Main Camera", typeof(Camera)) { tag = "MainCamera" };
                var cam = camGo.GetComponent<Camera>();
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.05f, 0.06f, 0.08f);
                camGo.transform.position = new Vector3(0, 1.2f, -6f);
                camGo.transform.rotation = Quaternion.LookRotation(new Vector3(0, 1.2f, 0) - camGo.transform.position);
                var light = new GameObject("Light", typeof(Light)).GetComponent<Light>();
                light.type = LightType.Directional;
                light.transform.rotation = Quaternion.Euler(45, -30, 0);
                var go = new GameObject("VFX_Under_Test");
                var vfx = go.AddComponent<VisualEffect>();
                vfx.visualEffectAsset = asset;
                vfx.resetSeedOnPlay = false;
                vfx.startSeed = 42;
                var scenePath = AgentJob.Str("scene", "Assets/Scenes/VFX_Graph_Test.unity");
                Directory.CreateDirectory(Path.Combine(AgentJob.ProjectRoot, Path.GetDirectoryName(scenePath)));
                EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(), scenePath);
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("vfxgraph");
                var st = new Dictionary<string, object>
                {
                    { "phase", "entering" }, { "asset", assetPath }, { "property", AgentJob.Str("property", "Rate") },
                    { "rate", AgentJob.Float("rate", 200f) }, { "rate2", AgentJob.Float("rate2", 50f) }, { "event", AgentJob.Str("event", "Fire") },
                    { "instances", AgentJob.Int("instances", 20) }, { "out_dir", outDir }, { "pre_wait", AgentJob.Float("pre_wait", 1.5f) },
                    { "post_wait", AgentJob.Float("post_wait", 3.0f) }, { "capture_at", AgentJob.Float("capture_at", 1.0f) },
                };
                SessionState.SetString(PlayKey, AgentJson.Serialize(st));
                VfxGraphPlayDriver.Hook();
                EditorApplication.EnterPlaymode();
                return null;
            });
        }
    }

    [InitializeOnLoad]
    static class VfxGraphPlayDriver
    {
        static bool s_Hooked;
        static Dictionary<string, object> s_St;
        static VisualEffect s_Vfx;
        static Camera s_Cam;
        static RenderTexture s_RT;
        static float s_T;           // phase start (game time: particles live in game time; the first frame after
                                    // the first SendEvent stalled 1.2 s in the editor, shaders compiled on first use)
        static int s_F;             // phase start (frame)
        static int s_PropId, s_EventId;
        static string s_System;
        static readonly List<object> s_Timeline = new List<object>();
        static readonly List<VisualEffect> s_Extra = new List<VisualEffect>();
        static int s_LastAlive = -1;
        static int s_FirstNonZeroFrame = -1, s_FirstInfoFrame = -1;
        static float s_FirstNonZeroT = -1f, s_FirstInfoT = -1f;
        static bool s_Captured;

        static VfxGraphPlayDriver()
        {
            if (!string.IsNullOrEmpty(SessionState.GetString(VfxGraphJobs.PlayKey, ""))) Hook();
        }

        public static void Hook()
        {
            if (s_Hooked) return;
            s_Hooked = true;
            EditorApplication.update += Tick;
        }

        static void Save() => SessionState.SetString(VfxGraphJobs.PlayKey, AgentJson.Serialize(s_St));
        static float F(string k) => (float)AgentJson.ToDouble(s_St[k]);
        static void Phase(string p) { s_St["phase"] = p; s_T = Time.time; s_F = Time.frameCount; Save(); }

        static void Tick()
        {
            if (s_St == null)
            {
                var raw = SessionState.GetString(VfxGraphJobs.PlayKey, "");
                if (string.IsNullOrEmpty(raw)) { EditorApplication.update -= Tick; s_Hooked = false; return; }
                s_St = AgentJson.ParseObject(raw);
            }
            var phase = (string)s_St["phase"];
            try
            {
                float dt = Time.time - s_T;
                if (phase == "entering" && EditorApplication.isPlaying)
                {
                    s_Vfx = GameObject.Find("VFX_Under_Test").GetComponent<VisualEffect>();
                    s_Cam = Camera.main;
                    // batch Play mode has no Game view: without a target the camera never renders, the VFX is
                    // considered culled and (default culling flags) is not simulated
                    s_RT = new RenderTexture(960, 540, 24);
                    s_Cam.targetTexture = s_RT;
                    s_PropId = Shader.PropertyToID((string)s_St["property"]);   // cache IDs, never strings per frame
                    s_EventId = Shader.PropertyToID((string)s_St["event"]);
                    var names = new List<string>();
                    s_Vfx.GetParticleSystemNames(names);
                    s_System = names.FirstOrDefault();
                    s_St["systems"] = names.Cast<object>().ToList();
                    s_St["has_property"] = s_Vfx.HasFloat(s_PropId);
                    Phase("pre");
                }
                else if (phase == "pre" && dt >= F("pre_wait"))
                {
                    // the custom event is wired to Spawn Start, which removed the implicit OnPlay binding:
                    // nothing should have spawned on enable
                    s_St["alive_before_event"] = s_Vfx.aliveParticleCount;   // -1 until the first async readback: not 0
                    s_St["awake_before_event"] = s_Vfx.HasAnySystemAwake();
                    if (s_Vfx.HasFloat(s_PropId)) s_Vfx.SetFloat(s_PropId, F("rate"));
                    s_Vfx.SendEvent(s_EventId);
                    s_St["alive_same_tick_as_send"] = s_Vfx.aliveParticleCount;
                    s_Timeline.Clear(); s_LastAlive = -1;
                    Phase("post");
                }
                else if (phase == "post")
                {
                    Record(dt);
                    if (!s_Captured && dt >= F("capture_at"))
                    {
                        s_Captured = true;
                        var png = Path.Combine((string)s_St["out_dir"], "vfxgraph_rate" + (int)F("rate") + ".png");
                        s_St["capture"] = png;
                        s_St["capture_method"] = AgentCapture.RenderCamera(s_Cam, 960, 540, png);
                    }
                    if (dt >= F("post_wait"))
                    {
                        s_St["alive_rate1"] = s_Vfx.aliveParticleCount;
                        s_St["info_rate1"] = Info();
                        s_St["timeline"] = new List<object>(s_Timeline);
                        s_St["first_nonzero_alive"] = new Dictionary<string, object> { { "frames", s_FirstNonZeroFrame }, { "seconds", Math.Round(s_FirstNonZeroT, 3) } };
                        s_St["first_nonzero_info"] = new Dictionary<string, object> { { "frames", s_FirstInfoFrame }, { "seconds", Math.Round(s_FirstInfoT, 3) } };
                        s_Vfx.SetFloat(s_PropId, F("rate2"));
                        Phase("rate2");
                    }
                }
                else if (phase == "rate2" && dt >= F("post_wait"))
                {
                    s_St["alive_rate2"] = s_Vfx.aliveParticleCount;
                    s_St["info_rate2"] = Info();
                    var png = Path.Combine((string)s_St["out_dir"], "vfxgraph_rate" + (int)F("rate2") + ".png");
                    AgentCapture.RenderCamera(s_Cam, 960, 540, png);
                    s_St["capture2"] = png;
                    int n = (int)F("instances");
                    for (int i = 1; i < n; i++)
                    {
                        var copy = UnityEngine.Object.Instantiate(s_Vfx.gameObject, s_Vfx.transform.position + new Vector3((i % 5 - 2) * 1.5f, 0, (i / 5) * 1.5f), Quaternion.identity);
                        var v = copy.GetComponent<VisualEffect>();
                        s_Extra.Add(v);
                    }
                    Phase("instances_send");
                }
                else if (phase == "instances_send" && Time.frameCount - s_F >= 2)
                {
                    foreach (var v in s_Extra) v.SendEvent(s_EventId);
                    Phase("instances");
                }
                else if (phase == "instances" && Time.frameCount - s_F >= 10)
                {
                    var infos = new List<VFXBatchedEffectInfo>();
                    VFXManager.GetBatchedEffectInfos(infos);
                    s_St["batched"] = infos.Select(b => (object)new Dictionary<string, object>
                    {
                        { "asset", b.vfxAsset != null ? b.vfxAsset.name : null }, { "active_batches", b.activeBatchCount },
                        { "active_instances", b.activeInstanceCount }, { "unbatched_instances", b.unbatchedInstanceCount },
                        { "max_per_batch", b.maxInstancePerBatchCapacity }, { "gpu_bytes", b.totalGPUSizeInBytes }, { "cpu_bytes", b.totalCPUSizeInBytes },
                    }).ToList();
                    s_St["culled_in_view"] = s_Vfx.culled;
                    s_Cam.transform.rotation = Quaternion.LookRotation(Vector3.back);   // turn away (Orson Favrel's culling check)
                    Phase("turned_away");
                }
                else if (phase == "turned_away" && Time.frameCount - s_F >= 5)
                {
                    s_St["culled_turned_away"] = s_Vfx.culled;
                    Cleanup();
                    Phase("exiting");
                    EditorApplication.ExitPlaymode();
                }
                else if (phase == "exiting" && !EditorApplication.isPlaying && !EditorApplication.isPlayingOrWillChangePlaymode)
                {
                    var result = s_St;
                    SessionState.EraseString(VfxGraphJobs.PlayKey);
                    EditorApplication.update -= Tick;
                    s_Hooked = false; s_St = null;
                    AgentJob.Succeed(result);
                }
            }
            catch (Exception e)
            {
                SessionState.EraseString(VfxGraphJobs.PlayKey);
                EditorApplication.update -= Tick;
                s_Hooked = false;
                var partial = s_St; s_St = null;
                Cleanup();
                if (EditorApplication.isPlaying) EditorApplication.ExitPlaymode();
                AgentJob.Fail("vfx graph play test: " + e.Message, partial, e);
            }
        }

        static Dictionary<string, object> Info()
        {
            if (string.IsNullOrEmpty(s_System)) return null;
            var i = s_Vfx.GetParticleSystemInfo(s_System);
            return new Dictionary<string, object> { { "system", s_System }, { "alive", i.aliveCount }, { "capacity", i.capacity }, { "sleeping", i.sleeping }, { "bounds", i.bounds } };
        }

        static void Record(float dt)
        {
            int alive = s_Vfx.aliveParticleCount;
            int infoAlive = string.IsNullOrEmpty(s_System) ? -1 : (int)s_Vfx.GetParticleSystemInfo(s_System).aliveCount;
            int df = Time.frameCount - s_F;
            if (alive > 0 && s_FirstNonZeroFrame < 0) { s_FirstNonZeroFrame = df; s_FirstNonZeroT = dt; }
            if (infoAlive > 0 && s_FirstInfoFrame < 0) { s_FirstInfoFrame = df; s_FirstInfoT = dt; }
            if (alive != s_LastAlive || df % 30 == 0)
            {
                s_Timeline.Add(new Dictionary<string, object> { { "f", df }, { "t", Math.Round(dt, 3) }, { "alive", alive }, { "info", infoAlive }, { "awake", s_Vfx.HasAnySystemAwake() } });
                s_LastAlive = alive;
            }
        }

        static void Cleanup()
        {
            if (s_Cam != null) s_Cam.targetTexture = null;
            if (s_RT != null) { s_RT.Release(); UnityEngine.Object.DestroyImmediate(s_RT); s_RT = null; }
            s_Extra.Clear();
        }
    }
}
