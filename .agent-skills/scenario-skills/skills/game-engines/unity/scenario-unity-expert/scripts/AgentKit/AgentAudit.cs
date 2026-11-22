// AgentKit v0.1 (Unity Expert Skills, 2026-09-24). Read-only audits to JSON: scenes, prefabs,
// materials, textures, models, audio. Each finding is {severity: error|warn|info, code, path,
// message, fix}. Domain skills add their own rules on top of the facts ("facts" blocks), they
// do not re-collect them. Never saves or reimports anything.
//
// Jobs (executeMethod targets, -nographics is fine):
//   AgentKit.AgentAudit.AuditScene    args: scene (path; default: the open scene), out
//   AgentKit.AgentAudit.AuditAssets   args: folders ["Assets/..."], types ["texture","model",
//                                     "material","prefab","audio"], max_texture_size (2048),
//                                     platforms ["Standalone","Android","iPhone","WebGL"], out
// Helpers: AuditTexture(path), AuditModel(path), AuditMaterial(path), AuditPrefab(path),
//          AuditAudio(path), AuditOpenScenes() for domain code.
// Run in Unity 6000.3.21f1 on 2026-09-24 on generated assets: tests/code/unity-expert/test_live_toolkit.py.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace AgentKit
{
    public static class AgentAudit
    {
        public class Findings
        {
            public readonly List<Dictionary<string, object>> items = new List<Dictionary<string, object>>();

            public void Add(string severity, string code, string path, string message, string fix = null)
            {
                items.Add(new Dictionary<string, object>
                {
                    { "severity", severity }, { "code", code }, { "path", path }, { "message", message }, { "fix", fix },
                });
            }

            public Dictionary<string, object> Counts()
            {
                return new Dictionary<string, object>
                {
                    { "error", items.Count(i => (string)i["severity"] == "error") },
                    { "warn", items.Count(i => (string)i["severity"] == "warn") },
                    { "info", items.Count(i => (string)i["severity"] == "info") },
                };
            }
        }

        static readonly string[] BuiltinOnlyShaderPrefixes =
        {
            "Standard", "Standard (Specular setup)", "Legacy Shaders/", "Mobile/", "Nature/", "Particles/Standard",
            "Unlit/", "Autodesk Interactive", "Skybox/Cubemap_legacy",
        };

        static bool IsSrp => GraphicsSettings.currentRenderPipeline != null;

        // ------------------------------------------------------------------ materials
        public static Dictionary<string, object> MaterialFacts(Material m, Findings f, string where)
        {
            var d = new Dictionary<string, object> { { "name", m ? m.name : null } };
            if (m == null)
            {
                f.Add("error", "material.missing", where, "renderer slot has no material (renders magenta or invisible)", "assign a material");
                return d;
            }
            var sh = m.shader;
            d["shader"] = sh ? sh.name : null;
            d["path"] = AssetDatabase.GetAssetPath(m);
            d["render_queue"] = m.renderQueue;
            d["keywords"] = m.shaderKeywords.Length;
            d["instancing"] = m.enableInstancing;
            if (sh == null || sh.name == "Hidden/InternalErrorShader")
                f.Add("error", "material.error_shader", where, "shader missing or failed to compile: renders magenta", "fix the shader or reassign one");
            else
            {
                if (!sh.isSupported)
                    f.Add("error", "material.unsupported_shader", where, "shader '" + sh.name + "' is not supported on this pipeline or GPU: renders magenta", "use a pipeline shader (URP: Universal Render Pipeline/Lit)");
                if (IsSrp && BuiltinOnlyShaderPrefixes.Any(p => sh.name == p || sh.name.StartsWith(p) && p.EndsWith("/")))
                    f.Add("error", "material.builtin_shader_in_srp", where, "Built-in shader '" + sh.name + "' in a " + GraphicsSettings.currentRenderPipeline.GetType().Name + " project: renders magenta", "convert with Window > Rendering > Render Pipeline Converter, or switch to Universal Render Pipeline/Lit");
            }
            if (IsSrp && m.enableInstancing)
                f.Add("info", "material.instancing_in_srp", where, "Enable GPU Instancing is on: in URP/HDRP with the SRP Batcher (and GPU Resident Drawer) Unity 6.3 recommends it off (extra variants)", "untick Enable GPU Instancing unless the SRP Batcher is off for this shader");
            return d;
        }

        public static Dictionary<string, object> AuditMaterial(string path, Findings f)
        {
            return MaterialFacts(AssetDatabase.LoadAssetAtPath<Material>(path), f, path);
        }

        // ------------------------------------------------------------------ textures
        public static Dictionary<string, object> AuditTexture(string path, Findings f, int maxSize = 2048, IList<string> platforms = null)
        {
            var ti = AssetImporter.GetAtPath(path) as TextureImporter;
            var d = new Dictionary<string, object> { { "path", path } };
            if (ti == null) { d["importer"] = "none"; return d; }
            ti.GetSourceTextureWidthAndHeight(out int w, out int h);
            d["source_size"] = new[] { w, h };
            d["type"] = ti.textureType.ToString();
            d["shape"] = ti.textureShape.ToString();
            d["max_size"] = ti.maxTextureSize;
            d["compression"] = ti.textureCompression.ToString();
            d["crunched"] = ti.crunchedCompression;
            d["mipmaps"] = ti.mipmapEnabled;
            d["readable"] = ti.isReadable;
            d["srgb"] = ti.sRGBTexture;
            d["npot_scale"] = ti.npotScale.ToString();
            d["filter"] = ti.filterMode.ToString();
            d["wrap"] = ti.wrapMode.ToString();
            d["alpha_source"] = ti.alphaSource.ToString();
            bool pot = IsPot(w) && IsPot(h);
            d["pot"] = pot;
            var tex = AssetDatabase.LoadAssetAtPath<Texture>(path);
            if (tex != null) d["imported_size"] = new[] { tex.width, tex.height };
            var plats = new Dictionary<string, object>();
            foreach (var p in platforms ?? new[] { "Standalone", "Android", "iPhone", "WebGL" })
            {
                var s = ti.GetPlatformTextureSettings(p);
                plats[p] = new Dictionary<string, object> { { "overridden", s.overridden }, { "format", s.format.ToString() }, { "max_size", s.maxTextureSize } };
            }
            d["platforms"] = plats;
            var name = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
            if (ti.isReadable)
                f.Add("warn", "texture.readable", path, "Read/Write is on: keeps a CPU copy (double memory)", "untick Read/Write unless scripts read pixels");
            if (ti.textureType == TextureImporterType.Default && !ti.mipmapEnabled)
                f.Add("warn", "texture.no_mipmaps_3d", path, "3D texture without mipmaps: shimmering and cache misses at distance", "enable mipmaps (keep them off for UI and sprites)");
            if ((ti.textureType == TextureImporterType.Sprite || ti.textureType == TextureImporterType.GUI) && ti.mipmapEnabled)
                f.Add("info", "texture.ui_mipmaps", path, "mipmaps on a UI or sprite texture (33% more memory, blur)", "disable mipmaps for UI and pixel art");
            if (Math.Max(w, h) > maxSize && ti.maxTextureSize > maxSize)
                f.Add("warn", "texture.over_budget", path, $"source {w}x{h} imports up to {ti.maxTextureSize} (budget {maxSize})", "lower Max Size or add a platform override");
            if (!pot && ti.npotScale == TextureImporterNPOTScale.None && ti.textureType == TextureImporterType.Default)
                f.Add("info", "texture.npot", path, $"non power of two ({w}x{h}): mipmaps and some compressed formats (PVRTC, ETC) are limited", "resize to POT, or keep for UI and sprites in atlases");
            if (ti.textureCompression == TextureImporterCompression.Uncompressed && Math.Max(w, h) >= 512 && ti.textureType != TextureImporterType.Sprite)
                f.Add("warn", "texture.uncompressed", path, $"uncompressed {w}x{h}: {w * h * 4 / 1048576f:0.0} MB in memory", "use Normal or High Quality compression");
            bool looksNormal = name.EndsWith("_n") || name.EndsWith("_normal") || name.EndsWith("_nrm") || name.Contains("normal");
            if (looksNormal && ti.textureType != TextureImporterType.NormalMap)
                f.Add("warn", "texture.normal_as_default", path, "name says normal map but Texture Type is " + ti.textureType + " (wrong decoding and sRGB)", "set Texture Type = Normal map");
            bool looksData = name.Contains("mask") || name.Contains("rough") || name.Contains("metal") || name.EndsWith("_ao") || name.Contains("height");
            if (looksData && ti.sRGBTexture && ti.textureType == TextureImporterType.Default)
                f.Add("warn", "texture.data_srgb", path, "data texture (mask/roughness/metal/AO/height) imported as sRGB colour", "untick sRGB (Color Texture)");
            return d;
        }

        static bool IsPot(int v) => v > 0 && (v & (v - 1)) == 0;

        // ------------------------------------------------------------------ models
        public static Dictionary<string, object> AuditModel(string path, Findings f)
        {
            var mi = AssetImporter.GetAtPath(path) as ModelImporter;
            var d = new Dictionary<string, object> { { "path", path } };
            if (mi == null) { d["importer"] = "none"; return d; }
            d["readable"] = mi.isReadable;
            d["mesh_compression"] = mi.meshCompression.ToString();
            d["blend_shapes"] = mi.importBlendShapes;
            d["animation_type"] = mi.animationType.ToString();
            d["import_animation"] = mi.importAnimation;
            d["generate_lightmap_uvs"] = mi.generateSecondaryUV;
            d["material_import_mode"] = mi.materialImportMode.ToString();
            d["global_scale"] = mi.globalScale;
            d["use_file_scale"] = mi.useFileScale;
            d["file_scale"] = mi.fileScale;
            d["bake_axis_conversion"] = mi.bakeAxisConversion;
            int verts = 0, tris = 0, sub = 0, meshes = 0;
            bool uv2 = true;
            Bounds? total = null;
            foreach (var o in AssetDatabase.LoadAllAssetsAtPath(path))
            {
                if (o is Mesh m)
                {
                    meshes++;
                    verts += m.vertexCount;
                    sub += m.subMeshCount;
                    for (int s = 0; s < m.subMeshCount; s++) tris += (int)(m.GetIndexCount(s) / 3);
                    if (m.uv2 == null || m.uv2.Length == 0) uv2 = false;
                    var b = m.bounds;
                    if (total == null) total = b; else { var t = total.Value; t.Encapsulate(b); total = t; }
                }
            }
            var root = AssetDatabase.LoadAssetAtPath<GameObject>(path);
            Vector3 size = Vector3.zero;
            if (root != null)
            {
                var rs = root.GetComponentsInChildren<Renderer>(true);
                if (rs.Length > 0)
                {
                    var bb = rs[0].bounds;
                    foreach (var r in rs) bb.Encapsulate(r.bounds);
                    size = bb.size;
                }
            }
            if (size == Vector3.zero && total != null) size = total.Value.size * mi.globalScale;
            d["meshes"] = meshes; d["vertices"] = verts; d["triangles"] = tris; d["submeshes"] = sub;
            d["has_uv2"] = uv2; d["bounds_size_m"] = size;
            float maxDim = Mathf.Max(size.x, size.y, size.z);
            if (mi.isReadable)
                f.Add("warn", "model.readable", path, "Read/Write is on: keeps a CPU copy of every mesh (double memory)", "untick Read/Write unless runtime code reads the mesh");
            if (maxDim > 100f)
                f.Add("warn", "model.scale_large", path, $"largest dimension {maxDim:0.#} m: authored in cm without conversion? (1 Unity unit = 1 m)", "set Scale Factor or Convert Units, or fix the export");
            if (maxDim > 0 && maxDim < 0.01f)
                f.Add("warn", "model.scale_tiny", path, $"largest dimension {maxDim:0.####} m: probably a unit mismatch", "check the export units and Scale Factor");
            if (mi.importAnimation && mi.animationType != ModelImporterAnimationType.None && tris > 0 && mi.clipAnimations.Length == 0 && mi.defaultClipAnimations.Length == 0)
                f.Add("info", "model.anim_on_static", path, "animation import enabled on a mesh without clips", "Rig: None and untick Import Animation for static props");
            if (mi.importBlendShapes)
                f.Add("info", "model.blendshapes", path, "blend shapes imported (default on)", "untick when the mesh has none or does not animate them");
            return d;
        }

        // ------------------------------------------------------------------ audio
        public static Dictionary<string, object> AuditAudio(string path, Findings f)
        {
            var ai = AssetImporter.GetAtPath(path) as AudioImporter;
            var d = new Dictionary<string, object> { { "path", path } };
            if (ai == null) return d;
            var s = ai.defaultSampleSettings;
            d["load_type"] = s.loadType.ToString();
            d["format"] = s.compressionFormat.ToString();
            d["quality"] = s.quality;
            d["force_mono"] = ai.forceToMono;
            d["load_in_background"] = ai.loadInBackground;
            var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(path);
            if (clip)
            {
                d["length_s"] = clip.length; d["channels"] = clip.channels; d["frequency"] = clip.frequency;
                if (clip.length > 10f && s.loadType == AudioClipLoadType.DecompressOnLoad)
                    f.Add("warn", "audio.long_decompress", path, $"{clip.length:0}s clip decompressed on load (large PCM in memory)", "Streaming or Compressed In Memory for music and ambience");
            }
            var ext = Path.GetExtension(path).ToLowerInvariant();
            if (ext == ".mp3" || ext == ".ogg")
                f.Add("info", "audio.lossy_source", path, "lossy source file is re-encoded (two lossy passes)", "import WAV or AIFF sources");
            return d;
        }

        // ------------------------------------------------------------------ scene objects
        static Dictionary<string, object> AuditGameObjects(IEnumerable<GameObject> roots, Findings f, string owner)
        {
            int gos = 0, renderers = 0, missingScripts = 0, lights = 0, shadowLights = 0, realtime = 0, baked = 0, mixed = 0;
            int cameras = 0, enabledCameras = 0, colliders = 0, bodies = 0, listeners = 0, canvases = 0, particles = 0, audioSources = 0;
            int probes = 0, volumes = 0, lodGroups = 0, staticGo = 0;
            long tris = 0;
            bool eventSystem = false;
            var shaders = new Dictionary<string, int>();
            var matSeen = new HashSet<Material>();
            foreach (var root in roots)
            {
                foreach (var t in root.GetComponentsInChildren<Transform>(true))
                {
                    var go = t.gameObject;
                    gos++;
                    var path = owner + ":" + HierarchyPath(t);
                    int miss = GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(go);
                    if (miss > 0)
                    {
                        missingScripts += miss;
                        f.Add("error", "go.missing_script", path, miss + " missing script(s)", "restore the script (and its .meta GUID) or remove the component");
                    }
                    if (PrefabUtility.IsPrefabAssetMissing(go))
                        f.Add("error", "go.missing_prefab", path, "prefab instance whose prefab asset is missing", "restore the prefab or unpack");
                    if (GameObjectUtility.GetStaticEditorFlags(go) != 0) staticGo++;
                    foreach (var r in go.GetComponents<Renderer>())
                    {
                        renderers++;
                        foreach (var m in r.sharedMaterials)
                        {
                            if (m == null) { MaterialFacts(null, f, path); continue; }
                            if (matSeen.Add(m))
                            {
                                MaterialFacts(m, f, path + " [" + m.name + "]");
                                var sn = m.shader ? m.shader.name : "null";
                                shaders[sn] = shaders.TryGetValue(sn, out var c) ? c + 1 : 1;
                            }
                        }
                        if (r is MeshRenderer)
                        {
                            var mf = go.GetComponent<MeshFilter>();
                            if (mf && mf.sharedMesh) tris += TriangleCount(mf.sharedMesh);
                            else f.Add("warn", "renderer.no_mesh", path, "MeshRenderer without a mesh", "assign a mesh or remove the renderer");
                        }
                        else if (r is SkinnedMeshRenderer smr && smr.sharedMesh) tris += TriangleCount(smr.sharedMesh);
                    }
                    foreach (var l in go.GetComponents<Light>())
                    {
                        lights++;
                        if (l.shadows != LightShadows.None && l.enabled) shadowLights++;
                        switch (l.lightmapBakeType)
                        {
                            case LightmapBakeType.Realtime: realtime++; break;
                            case LightmapBakeType.Baked: baked++; break;
                            default: mixed++; break;
                        }
                    }
                    foreach (var c in go.GetComponents<Camera>()) { cameras++; if (c.enabled && go.activeInHierarchy && !go.name.StartsWith(AgentCapture.BookmarkPrefix)) enabledCameras++; }
                    colliders += go.GetComponents<Collider>().Length + go.GetComponents<Collider2D>().Length;
                    bodies += go.GetComponents<Rigidbody>().Length + go.GetComponents<Rigidbody2D>().Length;
                    listeners += go.GetComponents<AudioListener>().Count(a => a.enabled && go.activeInHierarchy);
                    canvases += go.GetComponents<Canvas>().Length;
                    particles += go.GetComponents<ParticleSystem>().Length;
                    audioSources += go.GetComponents<AudioSource>().Length;
                    probes += go.GetComponents<ReflectionProbe>().Length;
                    lodGroups += go.GetComponents<LODGroup>().Length;
                    foreach (var mb in go.GetComponents<MonoBehaviour>())
                    {
                        if (mb == null) continue;
                        var tn = mb.GetType().Name;
                        if (tn == "Volume") volumes++;
                        if (tn == "EventSystem") eventSystem = true;
                    }
                }
            }
            if (listeners > 1) f.Add("warn", "scene.audio_listeners", owner, listeners + " enabled AudioListeners (Unity warns; only one hears)", "keep one, on the active camera");
            if (enabledCameras > 1) f.Add("info", "scene.cameras", owner, enabledCameras + " enabled cameras: each re-runs culling and rendering (up to 1 ms CPU each on mobile)", "one camera unless split-screen; overlays via URP camera stack or Render Objects");
            if (canvases > 0 && !eventSystem) f.Add("info", "scene.no_event_system", owner, "Canvas without an EventSystem: UI will not receive input", "add an EventSystem (Input System UI Input Module)");
            return new Dictionary<string, object>
            {
                { "game_objects", gos }, { "renderers", renderers }, { "triangles", tris }, { "missing_scripts", missingScripts },
                { "lights", lights }, { "shadow_casting_lights", shadowLights },
                { "lights_by_mode", new Dictionary<string, object> { { "realtime", realtime }, { "mixed", mixed }, { "baked", baked } } },
                { "cameras", cameras }, { "enabled_cameras", enabledCameras }, { "colliders", colliders }, { "rigidbodies", bodies },
                { "audio_listeners", listeners }, { "audio_sources", audioSources }, { "canvases", canvases }, { "event_system", eventSystem },
                { "particle_systems", particles }, { "reflection_probes", probes }, { "volumes", volumes }, { "lod_groups", lodGroups },
                { "static_objects", staticGo }, { "materials", matSeen.Count }, { "shaders", shaders },
            };
        }

        static long TriangleCount(Mesh m)
        {
            long t = 0;
            for (int s = 0; s < m.subMeshCount; s++) t += m.GetIndexCount(s) / 3;
            return t;
        }

        static string HierarchyPath(Transform t)
        {
            var parts = new List<string>();
            for (var c = t; c != null; c = c.parent) parts.Add(c.name);
            parts.Reverse();
            return string.Join("/", parts);
        }

        public static Dictionary<string, object> AuditPrefab(string path, Findings f)
        {
            var root = PrefabUtility.LoadPrefabContents(path);
            try
            {
                var d = AuditGameObjects(new[] { root }, f, path);
                d["path"] = path;
                return d;
            }
            finally
            {
                PrefabUtility.UnloadPrefabContents(root);
            }
        }

        public static Dictionary<string, object> AuditOpenScenes(Findings f)
        {
            var res = new Dictionary<string, object>();
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                var s = SceneManager.GetSceneAt(i);
                if (!s.isLoaded) continue;
                var d = AuditGameObjects(s.GetRootGameObjects(), f, s.path);
                d["render_pipeline"] = IsSrp ? GraphicsSettings.currentRenderPipeline.name : "Built-in";
                // 6.3 trap: the Lightmapping.lightingSettings getter THROWS when the scene has no
                // Lighting Settings asset (observed 2026-09-24); TryGetLightingSettings does not.
                d["lighting_settings"] = Lightmapping.TryGetLightingSettings(out var ls) && ls ? ls.name : null;
                if (d["lighting_settings"] == null)
                    f.Add("info", "scene.no_lighting_settings", s.path, "no Lighting Settings asset assigned (Unity 6 defaults apply; bakes use defaults)", "Window > Rendering > Lighting > New Lighting Settings, or assign Lightmapping.lightingSettings");
                d["lightmaps"] = LightmapSettings.lightmaps.Length;
                res[s.path] = d;
            }
            return res;
        }

        // ------------------------------------------------------------------ jobs
        static Dictionary<string, object> Wrap(string kind, object facts, Findings f)
        {
            var result = new Dictionary<string, object>
            {
                { "kind", kind }, { "counts", f.Counts() }, { "findings", f.items }, { "facts", facts },
                { "render_pipeline", IsSrp ? GraphicsSettings.currentRenderPipeline.name : "Built-in" },
            };
            var outPath = AgentJob.Has("out") ? AgentJob.ResolvePath(AgentJob.Str("out")) : Path.Combine(AgentJob.OutDir(), kind + "_audit.json");
            Directory.CreateDirectory(Path.GetDirectoryName(outPath));
            File.WriteAllText(outPath, AgentJson.Serialize(result, true));
            result["report"] = outPath;
            return result;
        }

        public static void AuditScene()
        {
            AgentJob.Run(() =>
            {
                var scene = AgentJob.Str("scene");
                if (!string.IsNullOrEmpty(scene)) EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
                var f = new Findings();
                return Wrap("scene", AuditOpenScenes(f), f);
            });
        }

        public static void AuditAssets()
        {
            AgentJob.Run(() =>
            {
                var folders = AgentJob.List("folders").Select(o => o.ToString()).ToArray();
                if (folders.Length == 0) folders = new[] { "Assets" };
                var types = new HashSet<string>(AgentJob.List("types").Select(o => o.ToString().ToLowerInvariant()));
                if (types.Count == 0) types.UnionWith(new[] { "texture", "model", "material", "prefab", "audio" });
                int maxSize = AgentJob.Int("max_texture_size", 2048);
                var plats = AgentJob.List("platforms").Select(o => o.ToString()).ToList();
                var f = new Findings();
                var facts = new Dictionary<string, object>();
                void Each(string filter, string key, Func<string, object> fn, string ext = null)
                {
                    if (!types.Contains(key)) return;
                    var list = new List<object>();
                    foreach (var g in AssetDatabase.FindAssets(filter, folders))
                    {
                        var p = AssetDatabase.GUIDToAssetPath(g);
                        if (!p.StartsWith("Assets/")) continue;
                        if (ext != null && !p.EndsWith(ext, StringComparison.OrdinalIgnoreCase)) continue;
                        list.Add(fn(p));
                    }
                    facts[key + "s"] = list;
                }
                Each("t:Texture2D", "texture", p => AuditTexture(p, f, maxSize, plats.Count > 0 ? plats : null));
                Each("t:Model", "model", p => AuditModel(p, f));
                Each("t:Material", "material", p => AuditMaterial(p, f));
                Each("t:Prefab", "prefab", p => AuditPrefab(p, f), ".prefab"); // defensive: observed 2026-09-24, t:Prefab did not return .obj models
                Each("t:AudioClip", "audio", p => AuditAudio(p, f));
                return Wrap("assets", facts, f);
            });
        }
    }
}
