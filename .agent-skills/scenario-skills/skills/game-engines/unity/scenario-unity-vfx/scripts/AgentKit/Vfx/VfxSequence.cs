// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// Deterministic, offscreen, frame-stepped capture of a whole gameplay beat (muzzle, projectile in
// flight, impact, explosion) in EDIT mode: no Play mode, no Game view, no real time.
// How: every effect root is advanced with ParticleSystem.Simulate(dt, withChildren: true, restart:
// first step only, fixedTimeStep: false) while the projectile transform is moved by speed * dt, so
// world-space rate-over-distance trails and ribbons are emitted exactly as in game; at chosen frames
// the camera is rendered to PNG (AgentCapture.RenderCamera, which discards the first white frame),
// the transparent layers are counted (VfxBudget.Overdraw, heatmap PNG) and particles are counted.
// Why edit mode: batch Play mode renders nothing on screen and runs on wall-clock time; Simulate gives
// the same frames on every run (fixed seeds set by the builder), which is what a review loop needs.
// Jobs: AgentKit.Vfx.VfxSequence.CaptureFireball (the worked example, graphics=True)
//       AgentKit.Vfx.VfxSequence.CaptureEffect (any effect prefab: copies side by side with distinct seeds, a
//       gameplay stop time for loops, tail and life measured, overdraw, counts and screen texels per frame)
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Vfx
{
    public static class VfxSequence
    {
        public class Stage
        {
            public Camera cam;
            public GameObject ground, wall, light;
            public Vector3 hitPoint, hitNormal;
        }

        /// <summary>A small test stage: dark ground, a target wall, a key light, a camera without post-processing
        /// (the low-end mobile look: no Bloom, so glow must come from the effect itself, Nordeus).</summary>
        public static Stage BuildStage(string matFolder, bool post)
        {
            var st = new Stage();
            var groundMat = GetLit(matFolder + "/M_Test_Ground.mat", new Color(0.16f, 0.16f, 0.17f));
            var wallMat = GetLit(matFolder + "/M_Test_Wall.mat", new Color(0.32f, 0.3f, 0.28f));
            st.ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            st.ground.name = "Ground";
            st.ground.transform.localScale = new Vector3(3, 1, 2);
            st.ground.GetComponent<Renderer>().sharedMaterial = groundMat;
            st.wall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            st.wall.name = "Target_Wall";
            st.wall.transform.position = new Vector3(3.6f, 1.5f, 0f);
            st.wall.transform.localScale = new Vector3(0.5f, 3f, 4f);
            st.wall.GetComponent<Renderer>().sharedMaterial = wallMat;
            st.hitPoint = new Vector3(3.35f, 1.2f, 0f);
            st.hitNormal = Vector3.left;
            st.light = new GameObject("Key_Light", typeof(Light));
            var l = st.light.GetComponent<Light>();
            l.type = LightType.Directional;
            l.intensity = 0.8f;
            l.color = new Color(0.75f, 0.8f, 1f);
            st.light.transform.rotation = Quaternion.Euler(40, -30, 0);
            var camGo = new GameObject("Main Camera", typeof(Camera));
            camGo.tag = "MainCamera";
            st.cam = camGo.GetComponent<Camera>();
            st.cam.clearFlags = CameraClearFlags.SolidColor;
            st.cam.backgroundColor = new Color(0.05f, 0.06f, 0.08f);
            st.cam.fieldOfView = 45f;
            st.cam.nearClipPlane = 0.1f;
            camGo.transform.position = new Vector3(0.4f, 2.1f, -6.4f);
            camGo.transform.rotation = Quaternion.LookRotation(new Vector3(0.7f, 1.25f, 0f) - camGo.transform.position);
            var data = st.cam.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = post;
            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.18f, 0.19f, 0.22f);
            return st;
        }

        static Material GetLit(string path, Color c)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                Directory.CreateDirectory(Path.Combine(AgentJob.ProjectRoot, Path.GetDirectoryName(path)));
                m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                AssetDatabase.CreateAsset(m, path);
            }
            m.SetColor("_BaseColor", c);
            m.SetFloat("_Smoothness", 0.2f);
            EditorUtility.SetDirty(m);
            return m;
        }

        class Fx
        {
            public GameObject go;
            public ParticleSystem ps;
            public bool started;
            public void Step(float dt)
            {
                if (go == null) return;
                ps.Simulate(dt, true, !started, false);
                started = true;
            }
        }

        static Fx Spawn(string prefabPath, Vector3 pos, Quaternion rot, float scale = 1f)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            if (prefab == null) throw new FileNotFoundException("prefab not found: " + prefabPath);
            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            go.transform.SetPositionAndRotation(pos, rot);
            go.transform.localScale = Vector3.one * scale;
            return new Fx { go = go, ps = go.GetComponent<ParticleSystem>() };
        }

        static List<Renderer> VfxRenderers(IEnumerable<Fx> fx) =>
            fx.Where(f => f.go != null).SelectMany(f => f.go.GetComponentsInChildren<Renderer>(true)).Where(r => r is ParticleSystemRenderer).ToList();

        public static void CaptureFireball()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var kit = AgentJob.Str("kit", "Assets/VFX/Fireball");
                int w = AgentJob.Int("width", 960), h = AgentJob.Int("height", 540);
                float fps = AgentJob.Float("fps", 60f), dt = 1f / fps;
                float speed = AgentJob.Float("speed", 14f);
                float radius = AgentJob.Float("gameplay_radius", 1.5f);   // damage radius of the explosion
                bool post = AgentJob.Bool("post", false);
                var frameArgs = AgentJob.Has("frames") ? AgentJob.List("frames") : new List<object> { 3, 10, 18, 26, 30, 33, 36, 42, 50, 62, 80, 100 };
                var capture = new HashSet<int>(frameArgs.Select(o => (int)AgentJson.ToDouble(o)));
                int total = capture.Max();
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("fireball");
                Directory.CreateDirectory(outDir);

                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var st = BuildStage(kit + "/Test", post);
                var start = new Vector3(-3.2f, 1.2f, 0f);
                st.cam.aspect = (float)w / h;   // fix the aspect once: assigning Camera.aspect disables auto-aspect
                var dir = (st.hitPoint - start).normalized;
                float flight = Vector3.Distance(start, st.hitPoint) / speed;
                var fwd = Quaternion.LookRotation(dir, Vector3.up);

                var projectile = Spawn(kit + "/FX_Fireball_Projectile.prefab", start, fwd);
                var muzzle = Spawn(kit + "/FX_Fireball_Muzzle.prefab", start, fwd);
                Fx impact = null, explosion = null;
                var all = new List<Fx> { projectile, muzzle };

                var bg = Path.Combine(outDir, "f000_background.png");
                AgentCapture.RenderCamera(st.cam, w, h, bg);

                var frames = new List<object>();
                int hitFrame = -1, peakFrame = -1;
                float peakFse = 0, explosionRadius = 0;
                int peakAlive = 0;
                var t0 = DateTime.UtcNow;
                for (int f = 1; f <= total; f++)
                {
                    float t = f * dt;
                    if (hitFrame < 0)
                    {
                        if (t >= flight)
                        {
                            hitFrame = f;
                            projectile.go.transform.position = st.hitPoint;
                            // the head vanishes at impact, the world-space trail keeps fading (never pop)
                            foreach (var name in new[] { "Core_Glow", "Core_Flame" })
                            {
                                var c = projectile.go.transform.Find(name);
                                if (c) c.GetComponent<ParticleSystem>().Stop(false, ParticleSystemStopBehavior.StopEmittingAndClear);
                            }
                            projectile.ps.Stop(true, ParticleSystemStopBehavior.StopEmitting);
                            var up = Quaternion.FromToRotation(Vector3.up, st.hitNormal);
                            impact = Spawn(kit + "/FX_Fireball_Impact.prefab", st.hitPoint, up);
                            // centre pushed off the surface by about half the radius: without soft particles (no depth
                            // texture on low-end mobile) billows cut into the wall with a hard straight line
                            explosion = Spawn(kit + "/FX_Fireball_Explosion.prefab", st.hitPoint + st.hitNormal * (0.45f * radius), Quaternion.identity,
                                              radius / VfxFireballKit.AuthoredRadius);
                            all.Add(impact); all.Add(explosion);
                        }
                        else projectile.go.transform.position = start + dir * speed * t;
                    }
                    foreach (var fx in all) fx.Step(dt);

                    if (explosion != null && explosion.go != null)
                        explosionRadius = Mathf.Max(explosionRadius, VfxBudget.VisualRadius(explosion.go, explosion.go.transform.position, "Fireball_Billow"));

                    if (!capture.Contains(f)) continue;
                    var png = Path.Combine(outDir, string.Format("f{0:000}.png", f));
                    AgentCapture.RenderCamera(st.cam, w, h, png);
                    var od = VfxBudget.Overdraw(st.cam, VfxRenderers(all), w, h, Path.Combine(outDir, string.Format("f{0:000}_overdraw.png", f)));
                    var counts = VfxBudget.Counts(all.Where(a => a.go != null).Select(a => a.go));
                    int alive = (int)counts["total_alive"];
                    float fse = (float)(double)od["fse"];
                    if (fse > peakFse) { peakFse = fse; peakFrame = f; }
                    peakAlive = Mathf.Max(peakAlive, alive);
                    frames.Add(new Dictionary<string, object>
                    {
                        { "frame", f }, { "t", Math.Round(t, 4) }, { "png", png }, { "overdraw", od }, { "counts", counts },
                        { "phase", hitFrame < 0 ? "flight" : (f - hitFrame) * dt < 0.12f ? "impact" : "explosion" },
                        { "texel", VfxBudget.ScreenTexel(st.cam, all.Where(a => a.go != null).Select(a => a.go), h) },
                    });
                }
                var end = VfxBudget.Counts(all.Where(a => a.go != null).Select(a => a.go));
                return new Dictionary<string, object>
                {
                    { "out_dir", outDir }, { "background", bg }, { "dt", dt }, { "flight_seconds", Math.Round(flight, 4) },
                    { "hit_frame", hitFrame }, { "frames", frames }, { "peak_fse", peakFse }, { "peak_fse_frame", peakFrame },
                    { "peak_alive", peakAlive }, { "gameplay_radius", radius },
                    { "explosion_visual_radius", Math.Round(explosionRadius, 3) },
                    { "radius_ratio", Math.Round(explosionRadius / radius, 3) },
                    { "end_counts", end }, { "end_t", Math.Round(total * dt, 3) },
                    { "post_processing", post }, { "seconds", Math.Round((DateTime.UtcNow - t0).TotalSeconds, 2) },
                };
            });
        }

        static Vector3 Vec(string key, Vector3 def)
        {
            if (!AgentJob.Has(key)) return def;
            var l = AgentJob.List(key);
            return new Vector3((float)AgentJson.ToDouble(l[0]), (float)AgentJson.ToDouble(l[1]), (float)AgentJson.ToDouble(l[2]));
        }

        /// <summary>Fixed, distinct seeds per copy: identical copies would hide the randomness review (B4) and, in game,
        /// every instance would look the same (see VfxSeed.Reseed for the runtime side).</summary>
        static void SeedCopy(GameObject go, uint seed)
        {
            var systems = go.GetComponentsInChildren<ParticleSystem>(true);
            foreach (var ps in systems) ps.Stop(false, ParticleSystemStopBehavior.StopEmittingAndClear);
            for (int i = 0; i < systems.Length; i++) { systems[i].useAutoRandomSeed = false; systems[i].randomSeed = seed + (uint)i * 7919u; }
        }

        static int Alive(IEnumerable<Fx> fx) => fx.Where(a => a.go != null).Sum(a => a.go.GetComponentsInChildren<ParticleSystem>(true).Sum(p => p.particleCount));

        /// <summary>Stepped offscreen capture of ANY effect prefab (edit mode, deterministic).
        /// args: prefab, frames [list of frame indices at fps], fps (60), width (960), height (540), scale (1), copies (1),
        /// spacing (3 m, along X), seed (1), rotation [euler], cam_pos [x,y,z], cam_target [x,y,z], stop_t (seconds: the
        /// gameplay state ends, every root gets Stop(StopEmitting), for loops), max_tail (3 s), primary [system names for
        /// the visual radius], ground (true), post (false), out_dir.
        /// Returns per frame png, overdraw, counts, screen texels; tier metadata (VfxTier); life_seconds (one-shot: last
        /// particle gone) or tail_seconds (after stop_t); visual radius vs gameplay radius x scale.</summary>
        public static void CaptureEffect()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var prefabPath = AgentJob.Str("prefab");
                int w = AgentJob.Int("width", 960), h = AgentJob.Int("height", 540);
                float fps = AgentJob.Float("fps", 60f), dt = 1f / fps;
                float scale = AgentJob.Float("scale", 1f), spacing = AgentJob.Float("spacing", 3f);
                int copies = Mathf.Max(1, AgentJob.Int("copies", 1));
                uint seed = (uint)Mathf.Max(1, AgentJob.Int("seed", 1));
                float stopT = AgentJob.Float("stop_t", 0f), maxTail = AgentJob.Float("max_tail", 3f);
                var primary = AgentJob.List("primary").Select(o => o.ToString()).ToArray();
                var frameArgs = AgentJob.Has("frames") ? AgentJob.List("frames") : new List<object> { 2, 6, 12, 20, 30, 45 };
                var capture = new HashSet<int>(frameArgs.Select(o => (int)AgentJson.ToDouble(o)));
                int total = capture.Max();
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("effect");
                Directory.CreateDirectory(outDir);

                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var camGo = new GameObject("Main Camera", typeof(Camera)) { tag = "MainCamera" };
                var cam = camGo.GetComponent<Camera>();
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = new Color(0.05f, 0.06f, 0.08f);
                cam.fieldOfView = AgentJob.Float("fov", 45f);
                cam.nearClipPlane = 0.1f;
                camGo.transform.position = Vec("cam_pos", new Vector3(0f, 3.2f, -6f));
                camGo.transform.rotation = Quaternion.LookRotation(Vec("cam_target", new Vector3(0f, 0.6f, 0f)) - camGo.transform.position);
                cam.GetUniversalAdditionalCameraData().renderPostProcessing = AgentJob.Bool("post", false);
                cam.aspect = (float)w / h;
                var light = new GameObject("Key_Light", typeof(Light)).GetComponent<Light>();
                light.type = LightType.Directional;
                light.intensity = 0.8f;
                light.color = new Color(0.75f, 0.8f, 1f);
                light.transform.rotation = Quaternion.Euler(40, -30, 0);
                RenderSettings.ambientMode = AmbientMode.Flat;
                RenderSettings.ambientLight = new Color(0.18f, 0.19f, 0.22f);
                if (AgentJob.Bool("ground", true))
                {
                    var g = GameObject.CreatePrimitive(PrimitiveType.Plane);
                    g.name = "Ground";
                    g.transform.localScale = new Vector3(3, 1, 3);
                    g.GetComponent<Renderer>().sharedMaterial = GetLit("Assets/VFX/_Stage/M_Stage_Ground.mat", new Color(0.16f, 0.16f, 0.17f));
                }

                var rot = Quaternion.Euler(Vec("rotation", Vector3.zero));
                var fx = new List<Fx>();
                for (int i = 0; i < copies; i++)
                {
                    var pos = new Vector3((i - (copies - 1) * 0.5f) * spacing, 0f, 0f) + Vec("offset", Vector3.zero);
                    var one = Spawn(prefabPath, pos, rot, scale);
                    SeedCopy(one.go, seed + (uint)i * 101u);
                    fx.Add(one);
                }
                var tier = fx[0].go.GetComponent<VfxTier>();
                // time-driven shaders (the uber shader's scroll) follow the SIMULATED time, not the editor clock: repeatable captures
                var timeId = Shader.PropertyToID("_AgentVfxTime");
                Shader.SetGlobalVector(timeId, new Vector4(1f, 0f, 0f, 0f));
                var bg = Path.Combine(outDir, "f000_background.png");
                AgentCapture.RenderCamera(cam, w, h, bg);

                var frames = new List<object>();
                int stopFrame = -1, peakAlive = 0, zeroFrame = -1;
                bool everAlive = false;
                float peakFse = 0f, visualRadius = 0f;
                var texelMax = new Dictionary<string, Dictionary<string, object>>();
                var t0 = DateTime.UtcNow;
                for (int f = 1; f <= total; f++)
                {
                    if (stopT > 0f && stopFrame < 0 && f * dt >= stopT)
                    {
                        foreach (var a in fx) a.ps.Stop(true, ParticleSystemStopBehavior.StopEmitting);
                        stopFrame = f;
                    }
                    foreach (var a in fx) a.Step(dt);
                    Shader.SetGlobalVector(timeId, new Vector4(1f, f * dt, 0f, 0f));
                    int aliveNow = Alive(fx);
                    if (aliveNow > 0) { everAlive = true; zeroFrame = -1; }
                    else if (everAlive && zeroFrame < 0 && (stopT <= 0f || stopFrame > 0)) zeroFrame = f;   // first empty frame
                    if (primary.Length > 0) visualRadius = Mathf.Max(visualRadius, VfxBudget.VisualRadius(fx[0].go, fx[0].go.transform.position, primary));
                    if (!capture.Contains(f)) continue;
                    var png = Path.Combine(outDir, string.Format("f{0:000}.png", f));
                    AgentCapture.RenderCamera(cam, w, h, png);
                    var od = VfxBudget.Overdraw(cam, VfxRenderers(fx), w, h, Path.Combine(outDir, string.Format("f{0:000}_overdraw.png", f)));
                    var counts = VfxBudget.Counts(fx.Where(a => a.go != null).Select(a => a.go));
                    var texel = VfxBudget.ScreenTexel(cam, new[] { fx[0].go }, h);
                    foreach (var row in texel)
                    {
                        var key = (string)row["system"];
                        if (!texelMax.ContainsKey(key) || (double)row["max_screen_px"] > (double)texelMax[key]["max_screen_px"]) texelMax[key] = row;
                    }
                    peakFse = Mathf.Max(peakFse, (float)(double)od["fse"]);
                    peakAlive = Mathf.Max(peakAlive, (int)counts["total_alive"]);
                    frames.Add(new Dictionary<string, object>
                    {
                        { "frame", f }, { "t", Math.Round(f * dt, 4) }, { "png", png }, { "overdraw", od }, { "counts", counts }, { "texel", texel },
                        { "stopped", stopFrame > 0 && f >= stopFrame },
                    });
                }
                // keep stepping without captures until the last particle is gone: life (one-shot) or tail (after the stop)
                int f2 = total;
                float limit = (stopT > 0f ? stopT + maxTail : total * dt + AgentJob.Float("max_life", 5f));
                while (zeroFrame < 0 && f2 * dt < limit)
                {
                    f2++;
                    if (stopT > 0f && stopFrame < 0 && f2 * dt >= stopT)
                    {
                        foreach (var a in fx) a.ps.Stop(true, ParticleSystemStopBehavior.StopEmitting);
                        stopFrame = f2;
                    }
                    foreach (var a in fx) a.Step(dt);
                    if (Alive(fx) == 0) zeroFrame = f2;
                }
                Shader.SetGlobalVector(timeId, Vector4.zero);
                double? life = zeroFrame > 0 ? Math.Round(zeroFrame * dt, 3) : (double?)null;
                double? tail = (zeroFrame > 0 && stopFrame > 0) ? Math.Round((zeroFrame - stopFrame) * dt, 3) : (double?)null;
                float gameplayRadius = tier != null ? tier.gameplayRadius * scale : 0f;
                return new Dictionary<string, object>
                {
                    { "prefab", prefabPath }, { "out_dir", outDir }, { "background", bg }, { "dt", dt }, { "copies", copies }, { "scale", scale },
                    { "frames", frames }, { "peak_fse", Math.Round(peakFse, 4) }, { "peak_alive", peakAlive },
                    { "draw_call_estimate", VfxShuriken.DrawCallEstimate(fx[0].go) },
                    { "texel_max", texelMax.Values.ToList() },
                    { "tier", tier != null ? tier.importance.ToString() : null }, { "tier_rank", tier != null ? (int)tier.importance : -1 },
                    { "frequent", tier != null && tier.frequent }, { "gameplay_duration", tier != null ? tier.gameplayDuration : 0f },
                    { "gameplay_radius", gameplayRadius }, { "visual_radius", Math.Round(visualRadius, 3) },
                    { "radius_ratio", gameplayRadius > 0 && primary.Length > 0 ? Math.Round(visualRadius / gameplayRadius, 3) : (double?)null },
                    { "stop_t", stopT }, { "life_seconds", stopT > 0 ? null : life }, { "tail_seconds", tail },
                    { "end_counts", VfxBudget.Counts(fx.Where(a => a.go != null).Select(a => a.go)) },
                    { "seconds", Math.Round((DateTime.UtcNow - t0).TotalSeconds, 2) },
                };
            });
        }
    }
}
