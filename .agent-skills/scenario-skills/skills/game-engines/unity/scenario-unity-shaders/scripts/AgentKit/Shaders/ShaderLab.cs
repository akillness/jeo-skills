// AgentKit.Shaders v0.1 (scenario-unity-shaders skill, 2026-09-24). A shader test bench: build a lit scene of
// primitives with given materials, then render many "shots" in ONE editor boot, each shot changing
// material values, per-renderer values, renderer features or objects before it captures.
//
// Jobs:
//   BuildScene  args: scene (new path), base_scene (default Assets/Scenes/SampleScene.unity: camera, sun,
//               Global Volume with Bloom + Tonemapping), ground {material, size, position}, objects[{name, mesh
//               (Sphere|Cube|Capsule|Cylinder|Plane|Quad), material, position, rotation, scale, cast_shadows,
//               receive_shadows}], sun {rotation, intensity, color, shadows (Hard|Soft|None)}, lights[{type
//               (Point|Spot|Directional), name, position, rotation, color, intensity, range, spot_angle, shadows}],
//               camera {position, look_at, fov}, bookmarks[{name, position, look_at, fov}]
//   Shots       args: scene, width, height, msaa, out_dir, views[{name, position, look_at, fov}] (default: bookmarks),
//               probes[{name, world:[x,y,z]}] (viewport coordinates returned per view, for pixel sampling),
//               shots[{name, set:[ops]}], where an op is one of
//                 {material, float|color|vector|keyword_on|keyword_off, value}
//                 {renderer: objectName, user_value: uint}            (Renderer.SetShaderUserValue, 6.3)
//                 {renderer_data: path, feature: name, active: bool}  (ScriptableRendererFeature.SetActive)
//                 {object: name, active: bool}
//                 {urp: {depth_priming|rendering_mode|depth_texture: value}}   (applied then captured)
//               Material edits are reverted at the end of the job unless keep_changes is true.
// Capture goes through AgentKit.AgentCapture (warm-up frame included: the first frame after a scene load
// renders materials white, observed 2026-09-24).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_shaders.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Shaders
{
    public static class ShaderLab
    {
        static PrimitiveType Prim(string mesh)
        {
            switch ((mesh ?? "Sphere").ToLowerInvariant())
            {
                case "cube": return PrimitiveType.Cube;
                case "capsule": return PrimitiveType.Capsule;
                case "cylinder": return PrimitiveType.Cylinder;
                case "plane": return PrimitiveType.Plane;
                case "quad": return PrimitiveType.Quad;
                default: return PrimitiveType.Sphere;
            }
        }

        static T Get<T>(Dictionary<string, object> d, string k, T def)
        {
            if (d == null || !d.TryGetValue(k, out var v) || v == null) return def;
            if (typeof(T) == typeof(float)) return (T)(object)(float)AgentJson.ToDouble(v);
            if (typeof(T) == typeof(bool)) return (T)(object)(v is bool b ? b : AgentJson.ToDouble(v) > 0);
            if (typeof(T) == typeof(string)) return (T)(object)Convert.ToString(v);
            if (typeof(T) == typeof(Vector3)) return (T)(object)AgentJson.ToVector3(v, (Vector3)(object)def);
            if (typeof(T) == typeof(Color)) return (T)(object)AgentJson.ToColor(v, (Color)(object)def);
            return def;
        }

        static GameObject GetOrCreatePrimitive(string name, PrimitiveType type)
        {
            var go = GameObject.Find(name);
            if (go != null) return go;
            go = GameObject.CreatePrimitive(type);
            go.name = name;
            return go;
        }

        /// <summary>A flat N x N quad grid of `size` metres centred on the origin (y up), saved as a mesh asset:
        /// water and vertex displacement need vertices (Unity's Plane is only 10 x 10 quads).</summary>
        public static Mesh GridMesh(int n, float size)
        {
            var path = "Assets/AgentShaders/Meshes/Grid_" + n + "_" + size.ToString(System.Globalization.CultureInfo.InvariantCulture) + "m.asset";
            var existing = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (existing != null) return existing;
            var verts = new Vector3[(n + 1) * (n + 1)];
            var uvs = new Vector2[verts.Length];
            var normals = new Vector3[verts.Length];
            for (int z = 0; z <= n; z++)
                for (int x = 0; x <= n; x++)
                {
                    int i = z * (n + 1) + x;
                    verts[i] = new Vector3((x / (float)n - 0.5f) * size, 0, (z / (float)n - 0.5f) * size);
                    uvs[i] = new Vector2(x / (float)n, z / (float)n);
                    normals[i] = Vector3.up;
                }
            var tris = new int[n * n * 6];
            int t = 0;
            for (int z = 0; z < n; z++)
                for (int x = 0; x < n; x++)
                {
                    int i = z * (n + 1) + x;
                    tris[t++] = i; tris[t++] = i + n + 1; tris[t++] = i + 1;
                    tris[t++] = i + 1; tris[t++] = i + n + 1; tris[t++] = i + n + 2;
                }
            var mesh = new Mesh { name = "Grid_" + n, indexFormat = verts.Length > 65000 ? UnityEngine.Rendering.IndexFormat.UInt32 : UnityEngine.Rendering.IndexFormat.UInt16 };
            mesh.vertices = verts; mesh.uv = uvs; mesh.normals = normals; mesh.triangles = tris;
            mesh.RecalculateTangents();
            mesh.RecalculateBounds();
            Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(path)));
            AssetDatabase.CreateAsset(mesh, path);
            return mesh;
        }

        static GameObject GetOrCreateObject(string name, string mesh)
        {
            var go = GameObject.Find(name);
            if (go != null) return go;
            if (mesh != null && mesh.StartsWith("Grid", StringComparison.OrdinalIgnoreCase))
            {
                // "Grid:128:20" = 128 x 128 quads over 20 m
                var parts = mesh.Split(':');
                int n = parts.Length > 1 ? int.Parse(parts[1]) : 128;
                float size = parts.Length > 2 ? float.Parse(parts[2], System.Globalization.CultureInfo.InvariantCulture) : 20f;
                go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
                go.GetComponent<MeshFilter>().sharedMesh = GridMesh(n, size);
                return go;
            }
            go = GameObject.CreatePrimitive(Prim(mesh));
            go.name = name;
            return go;
        }

        static void ApplyObject(GameObject go, Dictionary<string, object> o)
        {
            go.transform.position = Get(o, "position", go.transform.position);
            go.transform.eulerAngles = Get(o, "rotation", go.transform.eulerAngles);
            go.transform.localScale = Get(o, "scale", go.transform.localScale);
            var r = go.GetComponent<Renderer>();
            var matPath = Get<string>(o, "material", null);
            if (r != null && matPath != null)
            {
                var m = AssetDatabase.LoadAssetAtPath<Material>(matPath);
                if (m == null) throw new ArgumentException("material not found: " + matPath);
                r.sharedMaterial = m;
            }
            if (r != null)
            {
                r.shadowCastingMode = Get(o, "cast_shadows", true) ? ShadowCastingMode.On : ShadowCastingMode.Off;
                r.receiveShadows = Get(o, "receive_shadows", true);
            }
        }

        public static void BuildScene()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene");
                if (string.IsNullOrEmpty(scenePath)) throw new ArgumentException("scene is required");
                var basePath = AgentJob.Str("base_scene", "Assets/Scenes/SampleScene.unity");
                var scene = EditorSceneManager.OpenScene(basePath, OpenSceneMode.Single);
                Directory.CreateDirectory(Path.GetDirectoryName(AgentJob.ResolvePath(scenePath)));
                EditorSceneManager.SaveScene(scene, scenePath);            // work on the copy from now on
                scene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);

                var made = new List<object>();
                var ground = AgentJob.Dict("ground");
                if (ground.Count > 0)
                {
                    var g = GetOrCreatePrimitive("AgentLab_Ground", PrimitiveType.Plane);
                    float size = Get(ground, "size", 20f);
                    g.transform.localScale = new Vector3(size / 10f, 1, size / 10f);
                    g.transform.position = Get(ground, "position", Vector3.zero);
                    ApplyObject(g, new Dictionary<string, object> { { "material", Get<string>(ground, "material", null) } }.Where(kv => kv.Value != null).ToDictionary(kv => kv.Key, kv => kv.Value));
                    made.Add(g.name);
                }
                foreach (var o in AgentJob.List("objects").OfType<Dictionary<string, object>>())
                {
                    var name = Get(o, "name", "AgentLab_Object" + made.Count);
                    var go = GetOrCreateObject(name, Get<string>(o, "mesh", "Sphere"));
                    ApplyObject(go, o);
                    made.Add(name);
                }

                var sunSpec = AgentJob.Dict("sun");
                var sun = UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None).FirstOrDefault(l => l.type == LightType.Directional);
                if (sunSpec.Count > 0 && sun != null)
                {
                    sun.transform.eulerAngles = Get(sunSpec, "rotation", sun.transform.eulerAngles);
                    sun.intensity = Get(sunSpec, "intensity", sun.intensity);
                    sun.color = Get(sunSpec, "color", sun.color);
                    var sh = Get(sunSpec, "shadows", "Soft");
                    sun.shadows = sh == "None" ? LightShadows.None : sh == "Hard" ? LightShadows.Hard : LightShadows.Soft;
                }
                foreach (var l in AgentJob.List("lights").OfType<Dictionary<string, object>>())
                {
                    var name = Get(l, "name", "AgentLab_Light" + made.Count);
                    var go = GameObject.Find(name) ?? new GameObject(name, typeof(Light));
                    var light = go.GetComponent<Light>();
                    light.type = (LightType)Enum.Parse(typeof(LightType), Get(l, "type", "Point"));
                    go.transform.position = Get(l, "position", go.transform.position);
                    go.transform.eulerAngles = Get(l, "rotation", go.transform.eulerAngles);
                    light.color = Get(l, "color", Color.white);
                    light.intensity = Get(l, "intensity", 1f);
                    light.range = Get(l, "range", 10f);
                    light.spotAngle = Get(l, "spot_angle", 45f);
                    light.shadows = Get(l, "shadows", false) ? LightShadows.Soft : LightShadows.None;
                    made.Add(name);
                }
                var camSpec = AgentJob.Dict("camera");
                var cam = Camera.main;
                if (camSpec.Count > 0 && cam != null)
                {
                    cam.transform.position = Get(camSpec, "position", cam.transform.position);
                    if (camSpec.ContainsKey("look_at"))
                        cam.transform.rotation = Quaternion.LookRotation(Get(camSpec, "look_at", Vector3.zero) - cam.transform.position, Vector3.up);
                    cam.fieldOfView = Get(camSpec, "fov", cam.fieldOfView);
                }
                foreach (var b in AgentJob.List("bookmarks").OfType<Dictionary<string, object>>())
                    AgentCapture.SaveBookmark(Get(b, "name", "view"), Get(b, "position", Vector3.zero), Get(b, "look_at", Vector3.zero), Get(b, "fov", 50f));

                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "objects", made }, { "bookmarks", AgentCapture.SceneBookmarks().Count },
                    { "camera", cam ? cam.name : null }, { "sun", sun ? sun.name : null },
                };
            });
        }

        // ------------------------------------------------------------------ shots
        class MatBackup { public Material m; public Material copy; }

        static Material LoadMat(string path)
        {
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null) throw new ArgumentException("material not found: " + path);
            return m;
        }

        /// <summary>6.3 per-renderer shader value (unity_RendererUserValue in UnityPerDraw). Found by reflection
        /// so this file compiles on editors where the member lives elsewhere.</summary>
        public static string SetUserValue(Renderer r, uint value)
        {
            var mi = r.GetType().GetMethod("SetShaderUserValue", new[] { typeof(uint) });
            if (mi == null) throw new MissingMethodException("SetShaderUserValue(uint) not found on " + r.GetType().Name + " (run ShaderJobs.ApiProbe)");
            mi.Invoke(r, new object[] { value });
            return mi.DeclaringType.FullName;
        }

        static void ApplyOp(Dictionary<string, object> op, Dictionary<string, MatBackup> backups, List<Action> undo)
        {
            if (op.ContainsKey("material"))
            {
                var path = Convert.ToString(op["material"]);
                var m = LoadMat(path);
                if (!backups.ContainsKey(path)) backups[path] = new MatBackup { m = m, copy = new Material(m) };
                if (op.ContainsKey("float")) m.SetFloat(Convert.ToString(op["float"]), (float)AgentJson.ToDouble(op["value"]));
                if (op.ContainsKey("color")) m.SetColor(Convert.ToString(op["color"]), AgentJson.ToColor(op["value"], Color.white));
                if (op.ContainsKey("vector")) { var c = AgentJson.ToColor(op["value"], Color.clear); m.SetVector(Convert.ToString(op["vector"]), new Vector4(c.r, c.g, c.b, c.a)); }
                if (op.ContainsKey("keyword_on")) m.EnableKeyword(Convert.ToString(op["keyword_on"]));
                if (op.ContainsKey("keyword_off")) m.DisableKeyword(Convert.ToString(op["keyword_off"]));
                return;
            }
            if (op.ContainsKey("renderer"))
            {
                var go = GameObject.Find(Convert.ToString(op["renderer"]));
                var r = go ? go.GetComponent<Renderer>() : null;
                if (r == null) throw new ArgumentException("renderer not found: " + op["renderer"]);
                SetUserValue(r, (uint)AgentJson.ToDouble(op["user_value"]));
                undo.Add(() => SetUserValue(r, 0));   // runtime-only value: reset at the end of the job
                return;
            }
            if (op.ContainsKey("feature"))
            {
                var rd = AssetDatabase.LoadAssetAtPath<ScriptableRendererData>(Convert.ToString(op["renderer_data"]));
                var f = rd ? rd.rendererFeatures.FirstOrDefault(x => x != null && x.name == Convert.ToString(op["feature"])) : null;
                if (f == null) throw new ArgumentException("feature not found: " + op["feature"]);
                bool was = f.isActive;
                if (op.ContainsKey("active")) f.SetActive(op["active"] is bool b ? b : AgentJson.ToDouble(op["active"]) > 0);
                if (op.TryGetValue("fields", out var fo) && fo is Dictionary<string, object> fields)
                {
                    // remember the old values, set the new ones, rebuild the pass (what an Inspector edit does)
                    var old = new Dictionary<string, object>();
                    foreach (var k in fields.Keys)
                    {
                        var fi = f.GetType().GetField(k, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
                        if (fi != null) old[k] = fi.GetValue(f);
                    }
                    RendererFeatureJobs.SetFields(f, fields, new List<string>());
                    f.Create();
                    undo.Add(() =>
                    {
                        foreach (var kv in old) f.GetType().GetField(kv.Key, System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic).SetValue(f, kv.Value);
                        f.Create();
                    });
                }
                rd.SetDirty();
                undo.Add(() => { f.SetActive(was); rd.SetDirty(); });
                return;
            }
            if (op.ContainsKey("object"))
            {
                var name = Convert.ToString(op["object"]);
                var go = Resources.FindObjectsOfTypeAll<GameObject>().FirstOrDefault(g => g.name == name && g.scene.IsValid());
                if (go == null) throw new ArgumentException("object not found: " + name);
                go.SetActive(op["active"] is bool b ? b : AgentJson.ToDouble(op["active"]) > 0);
                return;
            }
            if (op.ContainsKey("urp"))
            {
                var d = op["urp"] as Dictionary<string, object>;
                var asset = ShaderJobs.ActiveUrpAsset("active");
                var rd = ShaderJobs.RendererData(null, asset) ;
                if (d == null || asset == null) return;
                if (d.ContainsKey("depth_priming") && rd != null)
                {
                    var was = rd.depthPrimingMode;
                    rd.depthPrimingMode = (DepthPrimingMode)Enum.Parse(typeof(DepthPrimingMode), Convert.ToString(d["depth_priming"]));
                    undo.Add(() => rd.depthPrimingMode = was);
                }
                if (d.ContainsKey("rendering_mode") && rd != null)
                {
                    var was = rd.renderingMode;
                    rd.renderingMode = (RenderingMode)Enum.Parse(typeof(RenderingMode), Convert.ToString(d["rendering_mode"]));
                    undo.Add(() => rd.renderingMode = was);
                }
                if (d.ContainsKey("depth_texture"))
                {
                    var was = asset.supportsCameraDepthTexture;
                    asset.supportsCameraDepthTexture = d["depth_texture"] is bool b ? b : AgentJson.ToDouble(d["depth_texture"]) > 0;
                    undo.Add(() => asset.supportsCameraDepthTexture = was);
                }
                return;
            }
            throw new ArgumentException("unknown op: " + AgentJson.Serialize(op));
        }

        public static Dictionary<string, object> ProjectProbes(Camera template, Dictionary<string, object> view, int w, int h, List<Dictionary<string, object>> probes)
        {
            var res = new Dictionary<string, object>();
            if (probes.Count == 0) return res;
            var go = new GameObject("AgentProbeCam", typeof(Camera)) { hideFlags = HideFlags.HideAndDontSave };
            try
            {
                var cam = go.GetComponent<Camera>();
                if (template) { cam.nearClipPlane = template.nearClipPlane; cam.farClipPlane = template.farClipPlane; cam.fieldOfView = template.fieldOfView; }
                go.transform.position = AgentJson.ToVector3(view.TryGetValue("position", out var p) ? p : null, template ? template.transform.position : Vector3.zero);
                if (view.TryGetValue("look_at", out var la) && la != null)
                    go.transform.rotation = Quaternion.LookRotation(AgentJson.ToVector3(la, Vector3.zero) - go.transform.position, Vector3.up);
                else if (view.TryGetValue("rotation", out var r) && r != null) go.transform.rotation = Quaternion.Euler(AgentJson.ToVector3(r, Vector3.zero));
                else if (template) go.transform.rotation = template.transform.rotation;
                if (view.TryGetValue("fov", out var fov) && fov != null) cam.fieldOfView = (float)AgentJson.ToDouble(fov, 60);
                cam.aspect = (float)w / h;
                foreach (var pr in probes)
                {
                    var vp = cam.WorldToViewportPoint(AgentJson.ToVector3(pr["world"], Vector3.zero));
                    // PNG rows run top to bottom: pixel y = (1 - viewport y) * height
                    res[Convert.ToString(pr["name"])] = new List<object> { (double)(vp.x * w), (double)((1 - vp.y) * h), (double)vp.z };
                }
            }
            finally { UnityEngine.Object.DestroyImmediate(go); }
            return res;
        }

        public static void Shots()
        {
            AgentJob.Run(() =>
            {
                AgentCapture.RequireGraphics();
                var scene = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scene)) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                int w = AgentJob.Int("width", 960), h = AgentJob.Int("height", 540), msaa = AgentJob.Int("msaa", 4);
                var outDir = AgentJob.Has("out_dir") ? AgentJob.ResolvePath(AgentJob.Str("out_dir")) : AgentJob.OutDir("shots");
                Directory.CreateDirectory(outDir);
                var template = Camera.main;
                var views = AgentJob.List("views").OfType<Dictionary<string, object>>().ToList();
                if (views.Count == 0) views = AgentCapture.SceneBookmarks();
                if (views.Count == 0) throw new InvalidOperationException("no views and no AgentView_ bookmarks in the scene");
                var probes = AgentJob.List("probes").OfType<Dictionary<string, object>>().ToList();
                var shots = AgentJob.List("shots").OfType<Dictionary<string, object>>().ToList();
                if (shots.Count == 0) shots.Add(new Dictionary<string, object> { { "name", "base" } });

                var backups = new Dictionary<string, MatBackup>();
                var undo = new List<Action>();
                var results = new List<object>();
                try
                {
                    foreach (var shot in shots)
                    {
                        var shotName = Get(shot, "name", "shot" + results.Count);
                        if (shot.TryGetValue("set", out var setObj) && setObj is List<object> ops)
                            foreach (var op in ops.OfType<Dictionary<string, object>>()) ApplyOp(op, backups, undo);
                        foreach (var v in views)
                        {
                            var vname = Get(v, "name", "view");
                            var path = Path.Combine(outDir, shotName + "__" + vname + ".png");
                            var info = AgentCapture.CaptureView(template, v, w, h, path, msaa);
                            info["shot"] = shotName;
                            info["view"] = vname;
                            info["probes"] = ProjectProbes(template, v, w, h, probes);
                            results.Add(info);
                        }
                    }
                }
                finally
                {
                    if (!AgentJob.Bool("keep_changes"))
                    {
                        foreach (var b in backups.Values) { b.m.CopyPropertiesFromMaterial(b.copy); b.m.shaderKeywords = b.copy.shaderKeywords; }
                        for (int i = undo.Count - 1; i >= 0; i--) undo[i]();
                    }
                    else foreach (var b in backups.Values) EditorUtility.SetDirty(b.m);
                }
                // SRP Batcher compatibility is only known once a shader has rendered with the pipeline: read it now.
                var srp = new Dictionary<string, object>();
                foreach (var r in UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                    foreach (var m in r.sharedMaterials)
                        if (m != null && m.shader != null && !srp.ContainsKey(m.shader.name))
                        {
                            var activeObj = typeof(ShaderUtil).GetMethod("GetShaderActiveSubshaderIndex", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic)?.Invoke(null, new object[] { m.shader });
                            srp[m.shader.name] = ShaderJobs.SrpBatcher(m.shader, activeObj == null ? 0 : Convert.ToInt32(activeObj));
                        }
                return new Dictionary<string, object>
                {
                    { "scene", EditorSceneManager.GetActiveScene().path }, { "out_dir", outDir },
                    { "graphics", SystemInfo.graphicsDeviceType.ToString() }, { "shots", results }, { "srp_batcher", srp },
                };
            });
        }
    }
}
