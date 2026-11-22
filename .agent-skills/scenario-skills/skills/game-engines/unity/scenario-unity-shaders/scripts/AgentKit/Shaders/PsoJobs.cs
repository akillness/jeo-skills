// AgentKit.Shaders v0.2 (scenario-unity-shaders skill, 2026-09-24). Editor side of the PSO warm-up proof
// (GraphicsStateCollection, Unity 6, experimental). The runtime side is AgentKit.Rendering.AgentPsoProbe
// (scripts/Runtime/AgentPsoProbe.cs, installed to Assets/AgentShaders/Runtime).
//
// Jobs:
//   BuildPsoScene    args: scene ("Assets/AgentShaders/Scenes/PsoBench.unity"), materials[] (one object each,
//                    in a row), ground (material path, optional), volume_profile (path, optional: post-processing
//                    PSOs join the trace), warmup_per_frame (0), loading_frames (5), log_shader_compilation (true).
//                    Builds a scene whose gameplay root "Content" is INACTIVE until the probe has warmed up,
//                    and sets the player to run windowed and in the background. Build it afterwards with
//                    ut_run.build(P, "macos", out=..., development=True, scenes=[scene]) (tracing needs a
//                    development player).
//   InspectCollection args: file (.graphicsstate), expect_shaders[] (optional) -> api, platform, quality,
//                    variants and graphics states, per shader: variant count, pass names, keyword sets; which
//                    expected shaders are missing (re-trace the content that uses them).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_pso.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace AgentKit.Shaders
{
    public static class PsoJobs
    {
        public static void BuildPsoScene()
        {
            AgentJob.Run(() =>
            {
                var path = AgentJob.Str("scene", "Assets/AgentShaders/Scenes/PsoBench.unity");
                var probeType = RendererFeatureJobs.FindType("AgentKit.Rendering.AgentPsoProbe");
                if (probeType == null) throw new InvalidOperationException("AgentKit.Rendering.AgentPsoProbe not compiled: run ut_shaders.install(P) first");
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

                var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
                var cam = camGo.AddComponent<Camera>();
                var camData = camGo.AddComponent<UniversalAdditionalCameraData>();
                camData.renderPostProcessing = true;
                camGo.transform.position = new Vector3(0f, 2.4f, -7.5f);
                camGo.transform.LookAt(new Vector3(0f, 0.9f, 0f));
                cam.fieldOfView = 50f;

                var sunGo = new GameObject("Sun");
                var sun = sunGo.AddComponent<Light>();
                sun.type = LightType.Directional;
                sun.shadows = LightShadows.Soft;
                sun.intensity = 2f;
                sunGo.transform.eulerAngles = new Vector3(50f, 30f, 0f);

                var profilePath = AgentJob.Str("volume_profile");
                if (!string.IsNullOrEmpty(profilePath))
                {
                    var vgo = new GameObject("Global Volume");
                    var vol = vgo.AddComponent<Volume>();
                    vol.isGlobal = true;
                    vol.sharedProfile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(profilePath)
                                        ?? throw new ArgumentException("volume profile not found: " + profilePath);
                }

                var content = new GameObject("Content");
                var ground = AgentJob.Str("ground");
                if (!string.IsNullOrEmpty(ground))
                {
                    var g = GameObject.CreatePrimitive(PrimitiveType.Plane);
                    g.name = "Ground";
                    g.transform.SetParent(content.transform, false);
                    g.GetComponent<Renderer>().sharedMaterial = AssetDatabase.LoadAssetAtPath<Material>(ground);
                }
                var mats = AgentJob.List("materials").Select(Convert.ToString).ToList();
                var placed = new List<object>();
                for (int i = 0; i < mats.Count; i++)
                {
                    var m = AssetDatabase.LoadAssetAtPath<Material>(mats[i]) ?? throw new ArgumentException("material not found: " + mats[i]);
                    var go = GameObject.CreatePrimitive(i % 2 == 0 ? PrimitiveType.Sphere : PrimitiveType.Capsule);
                    go.name = Path.GetFileNameWithoutExtension(mats[i]);
                    go.transform.SetParent(content.transform, false);
                    go.transform.localPosition = new Vector3((i - (mats.Count - 1) * 0.5f) * 1.6f, 1f, 0f);
                    go.GetComponent<Renderer>().sharedMaterial = m;
                    placed.Add(new Dictionary<string, object> { { "object", go.name }, { "material", mats[i] }, { "shader", m.shader.name } });
                }
                content.SetActive(false);                              // gameplay starts after the warm-up

                var probeGo = new GameObject("PsoProbe");
                var probe = probeGo.AddComponent(probeType);
                var so = new SerializedObject(probe);
                so.FindProperty("content").objectReferenceValue = content;
                so.FindProperty("warmupPerFrame").intValue = AgentJob.Int("warmup_per_frame", 0);
                so.FindProperty("loadingFrames").intValue = AgentJob.Int("loading_frames", 5);
                so.ApplyModifiedPropertiesWithoutUndo();

                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
                if (!EditorSceneManager.SaveScene(scene, path)) throw new IOException("could not save " + path);

                PlayerSettings.runInBackground = true;
                PlayerSettings.visibleInBackground = true;
                PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
                PlayerSettings.defaultScreenWidth = 640;
                PlayerSettings.defaultScreenHeight = 360;
                PlayerSettings.usePlayerLog = true;
                if (AgentJob.Bool("log_shader_compilation", true)) GraphicsSettings.logWhenShaderIsCompiled = true;
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "scene", path }, { "objects", placed }, { "volume_profile", profilePath },
                    { "log_shader_compilation", GraphicsSettings.logWhenShaderIsCompiled },
                    { "strict_shader_variant_matching", PlayerSettings.strictShaderVariantMatching },
                };
            });
        }

        public static void InspectCollection()
        {
            AgentJob.Run(() =>
            {
                var file = AgentJob.ResolvePath(AgentJob.Str("file"));
                var gsc = new GraphicsStateCollection();
                if (!gsc.LoadFromFile(file)) throw new IOException("GraphicsStateCollection.LoadFromFile failed: " + file);
                var variants = new List<GraphicsStateCollection.ShaderVariant>();
                gsc.GetVariants(variants);
                var perShader = new SortedDictionary<string, Dictionary<string, object>>();
                foreach (var v in variants)
                {
                    var name = v.shader != null ? v.shader.name : "(missing shader)";
                    if (!perShader.TryGetValue(name, out var d))
                        perShader[name] = d = new Dictionary<string, object> { { "variants", 0 }, { "passes", new SortedSet<string>() }, { "keyword_sets", new List<object>() } };
                    d["variants"] = (int)d["variants"] + 1;
                    string pass = v.passId.SubshaderIndex + ":" + v.passId.PassIndex;
                    if (v.shader != null)
                    {
                        var sd = ShaderUtil.GetShaderData(v.shader);
                        if ((int)v.passId.SubshaderIndex < sd.SubshaderCount)
                        {
                            var ss = sd.GetSubshader((int)v.passId.SubshaderIndex);
                            if ((int)v.passId.PassIndex < ss.PassCount) pass = ss.GetPass((int)v.passId.PassIndex).Name;
                        }
                    }
                    ((SortedSet<string>)d["passes"]).Add(pass);
                    var kw = v.keywords == null ? "" : string.Join(" ", v.keywords.Select(k => k.name).OrderBy(n => n));
                    var sets = (List<object>)d["keyword_sets"];
                    if (sets.Count < 12) sets.Add(pass + " | " + kw);
                }
                var shaders = perShader.ToDictionary(kv => kv.Key, kv => (object)new Dictionary<string, object>
                {
                    { "variants", kv.Value["variants"] }, { "passes", ((SortedSet<string>)kv.Value["passes"]).Cast<object>().ToList() },
                    { "keyword_sets", kv.Value["keyword_sets"] },
                });
                var expect = AgentJob.List("expect_shaders").Select(Convert.ToString).ToList();
                return new Dictionary<string, object>
                {
                    { "file", file }, { "bytes", new FileInfo(file).Length }, { "api", gsc.graphicsDeviceType.ToString() },
                    { "platform", gsc.runtimePlatform.ToString() }, { "quality", gsc.qualityLevelName }, { "version", gsc.version },
                    { "variants", gsc.variantCount }, { "graphics_states", gsc.totalGraphicsStateCount }, { "shaders", shaders },
                    { "missing_expected", expect.Where(e => !perShader.ContainsKey(e)).Cast<object>().ToList() },
                };
            });
        }
    }
}
