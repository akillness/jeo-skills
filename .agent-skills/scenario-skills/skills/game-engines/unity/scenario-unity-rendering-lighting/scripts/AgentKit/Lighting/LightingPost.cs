// AgentKit.Lighting v0.2 (scenario-unity-rendering-lighting skill, 2026-09-24). Post-processing Volumes
// and profiles from data, the way an agent without the Volume Inspector sets them.
//
// Job (-nographics is fine):
//   AgentKit.Lighting.LightingPost.SetupVolume   args:
//     scene        scene path (default: the open scene)
//     profile      VolumeProfile asset path (get-or-create)
//     volume       GameObject name (default "Global Volume"); global (true); priority (0; locals 1+)
//     box          local volume only: {center, size, blend} (adds a BoxCollider, isTrigger)
//     overrides    {"Tonemapping": {"mode": "ACES"}, "ColorAdjustments": {"postExposure": 0.3, "contrast": 12},
//                   "ShadowsMidtonesHighlights": {"midtones": [1,1,1,0.05]}, "Bloom": {...}, ...}
//                  component types from UnityEngine.Rendering.Universal (or UnityEngine.Rendering, e.g.
//                  ProbeVolumesOptions); each named field is a VolumeParameter: value set and
//                  overrideState = true. {"remove": true} removes a component; "active": false disables it.
//     replace      true: drop overrides not listed (default false)
//     camera_post  true (default): Main Camera renderPostProcessing on
//   Returns the profile as data, the volume stack context (Graphics default profile, URP asset
//   profile) and warnings (renderer post disabled, tonemapping missing with HDR, equal priorities).
// Components added by code must also be added to the profile asset as sub-assets
// (AssetDatabase.AddObjectToAsset), otherwise they vanish on reload.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace AgentKit.Lighting
{
    public static class LightingPost
    {
        public static Type ComponentType(string name)
        {
            foreach (var ns in new[] { "UnityEngine.Rendering.Universal.", "UnityEngine.Rendering." })
            {
                var t = typeof(Bloom).Assembly.GetType(ns + name) ?? typeof(Volume).Assembly.GetType(ns + name);
                if (t == null)
                    foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
                        if ((t = a.GetType(ns + name)) != null) break;
                if (t != null && typeof(VolumeComponent).IsAssignableFrom(t)) return t;
            }
            throw new ArgumentException("unknown volume component '" + name + "'");
        }

        public static object ParamValue(VolumeParameter p)
        {
            var vp = p.GetType().GetProperty("value");
            var v = vp?.GetValue(p);
            if (v is Enum e) return EnumName(e);
            if (v is float f) return Math.Round(f, 4);
            if (v is UnityEngine.Object o) return o ? AssetDatabase.GetAssetPath(o) : null;
            return v;
        }

        /// <summary>Enum value name, skipping [Obsolete] aliases (6.3: APVLeakReductionMode.ValidityBased
        /// is an obsolete alias of Performance and Enum.ToString() prints it, observed 2026-09-24).</summary>
        public static string EnumName(Enum e)
        {
            long val = System.Convert.ToInt64(e);
            foreach (var fi in e.GetType().GetFields(BindingFlags.Public | BindingFlags.Static))
                if (System.Convert.ToInt64(fi.GetValue(null)) == val && fi.GetCustomAttribute<ObsoleteAttribute>() == null) return fi.Name;
            return e.ToString();
        }

        public static void SetParam(VolumeComponent c, string field, object value)
        {
            var fi = c.GetType().GetField(field, BindingFlags.Public | BindingFlags.Instance);
            if (fi == null || !(fi.GetValue(c) is VolumeParameter p))
                throw new ArgumentException(c.GetType().Name + " has no parameter '" + field + "'");
            var vp = p.GetType().GetProperty("value");
            vp.SetValue(p, LightingUtil.Convert(value, vp.PropertyType));
            p.overrideState = true;
        }

        public static Dictionary<string, object> DescribeProfile(VolumeProfile profile)
        {
            var d = new Dictionary<string, object>();
            if (profile == null) return d;
            foreach (var c in profile.components)
            {
                if (c == null) continue;
                var ps = new Dictionary<string, object>();
                foreach (var fi in c.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance))
                    if (fi.GetValue(c) is VolumeParameter p && p.overrideState) ps[fi.Name] = ParamValue(p);
                ps["_active"] = c.active;
                d[c.GetType().Name] = ps;
            }
            return d;
        }

        /// <summary>The project-wide default profile (Project Settings > Graphics > URP > Volume
        /// Profiles), bottom of the Unity 6 volume stack (HCXCmHgV7Sk [00:30:06]). Found by reflection
        /// so the job still compiles if the settings type changes.</summary>
        public static VolumeProfile GraphicsDefaultProfile()
        {
            try
            {
                var t = typeof(UniversalRenderPipelineAsset).Assembly.GetType("UnityEngine.Rendering.Universal.URPDefaultVolumeProfileSettings");
                if (t == null) return null;
                var m = typeof(GraphicsSettings).GetMethods(BindingFlags.Public | BindingFlags.Static)
                    .FirstOrDefault(x => x.Name == "GetRenderPipelineSettings" && x.IsGenericMethodDefinition && x.GetParameters().Length == 0);
                var s = m?.MakeGenericMethod(t).Invoke(null, null);
                return s?.GetType().GetProperty("volumeProfile")?.GetValue(s) as VolumeProfile;
            }
            catch (Exception) { return null; }
        }

        /// <summary>Get-or-create a VolumeProfile asset (folders created as needed).</summary>
        public static VolumeProfile EnsureProfile(string profilePath)
        {
            LightingUtil.EnsureFolder(System.IO.Path.GetDirectoryName(profilePath).Replace('\\', '/'));
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>(profilePath);
            if (profile == null)
            {
                profile = ScriptableObject.CreateInstance<VolumeProfile>();
                AssetDatabase.CreateAsset(profile, profilePath);
            }
            return profile;
        }

        /// <summary>Apply {"Component": {"param": value, "active": bool, "remove": true}} to a profile;
        /// replace drops components not listed. Added components become sub-assets of the profile
        /// (AssetDatabase.AddObjectToAsset), otherwise they vanish on reload. Shared by SetupVolume
        /// (scene volumes) and LightingPipeline.ConfigureTiers (the per-tier profile on a URP asset).</summary>
        public static void ApplyOverrides(VolumeProfile profile, Dictionary<string, object> overrides, bool replace)
        {
            overrides ??= new Dictionary<string, object>();
            if (replace)
                foreach (var c in profile.components.ToList())
                    if (c != null && !overrides.ContainsKey(c.GetType().Name)) { profile.Remove(c.GetType()); UnityEngine.Object.DestroyImmediate(c, true); }
            foreach (var kv in overrides)
            {
                var type = ComponentType(kv.Key);
                var fields = kv.Value as Dictionary<string, object> ?? new Dictionary<string, object>();
                profile.TryGet(type, out VolumeComponent comp);
                if (fields.TryGetValue("remove", out var rm) && LightingUtil.ToBool(rm))
                {
                    if (comp != null) { profile.Remove(type); UnityEngine.Object.DestroyImmediate(comp, true); }
                    continue;
                }
                if (comp == null)
                {
                    comp = profile.Add(type, false);
                    comp.name = type.Name;
                    AssetDatabase.AddObjectToAsset(comp, profile);   // persist as a sub-asset
                }
                foreach (var f in fields)
                {
                    if (f.Key == "active") { comp.active = LightingUtil.ToBool(f.Value); continue; }
                    SetParam(comp, f.Key, f.Value);
                }
                EditorUtility.SetDirty(comp);
            }
            EditorUtility.SetDirty(profile);
        }

        public static void SetupVolume()
        {
            AgentJob.Run(() =>
            {
                var scenePath = AgentJob.Str("scene");
                var scene = string.IsNullOrEmpty(scenePath) ? SceneManager.GetActiveScene() : EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
                var profilePath = AgentJob.Str("profile") ?? throw new ArgumentException("profile path required");
                var profile = EnsureProfile(profilePath);
                ApplyOverrides(profile, AgentJob.Dict("overrides"), AgentJob.Bool("replace"));

                var volName = AgentJob.Str("volume", "Global Volume");
                var go = GameObject.Find(volName);
                if (go == null) go = new GameObject(volName);
                // Unity objects: explicit == null, never ?? (fake null in the Editor, observed 2026-09-24)
                var vol = go.GetComponent<Volume>();
                if (vol == null) vol = go.AddComponent<Volume>();
                vol.isGlobal = AgentJob.Bool("global", true);
                vol.priority = AgentJob.Float("priority", vol.isGlobal ? 0f : 1f);
                vol.weight = AgentJob.Float("weight", 1f);
                vol.sharedProfile = profile;
                var box = AgentJob.Dict("box");
                if (!vol.isGlobal && box.Count > 0)
                {
                    var bc = go.GetComponent<BoxCollider>();
                    if (bc == null) bc = go.AddComponent<BoxCollider>();
                    bc.isTrigger = true;
                    go.transform.position = AgentJson.ToVector3(box.TryGetValue("center", out var c) ? c : null, go.transform.position);
                    bc.size = AgentJson.ToVector3(box.TryGetValue("size", out var s) ? s : null, Vector3.one * 10);
                    vol.blendDistance = box.TryGetValue("blend", out var b) ? (float)AgentJson.ToDouble(b) : 1f;
                }
                if (AgentJob.Bool("camera_post", true) && Camera.main != null)
                    Camera.main.GetUniversalAdditionalCameraData().renderPostProcessing = true;

                // context and warnings
                var warnings = new List<string>();
                var urp = GraphicsSettings.currentRenderPipeline as UniversalRenderPipelineAsset;
                if (urp != null)
                {
                    var r = LightingUtil.RendererData(urp);
                    if (r != null && r.postProcessData == null) warnings.Add("renderer " + r.name + " has post-processing disabled: the volume does nothing");
                    bool tonemap = profile.TryGet<Tonemapping>(out var tm) && tm.active && tm.mode.overrideState && tm.mode.value != TonemappingMode.None;
                    if (urp.supportsHDR && !tonemap) warnings.Add("HDR on and this profile sets no tonemapper: highlights clip unless another volume or the default profile tonemaps");
                }
                var vols = UnityEngine.Object.FindObjectsByType<Volume>(FindObjectsSortMode.None);
                foreach (var g in vols.Where(v => v.isGlobal).GroupBy(v => v.priority).Where(g => g.Count() > 1))
                    warnings.Add("global volumes with equal priority " + g.Key + ": " + string.Join(", ", g.Select(v => v.name)) + " (creation order decides: set priorities explicitly)");
                if (Camera.main == null) warnings.Add("no Main Camera: post flag not set");

                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene);
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object>
                {
                    { "scene", scene.path }, { "profile", profilePath }, { "volume", volName }, { "global", vol.isGlobal },
                    { "priority", vol.priority }, { "components", DescribeProfile(profile) },
                    { "graphics_default_profile", DescribeProfile(GraphicsDefaultProfile()) },
                    { "urp_asset_profile", urp != null && urp.volumeProfile ? AssetDatabase.GetAssetPath(urp.volumeProfile) : null },
                    { "camera_post", Camera.main ? Camera.main.GetUniversalAdditionalCameraData().renderPostProcessing : false },
                    { "warnings", warnings },
                };
            });
        }
    }
}
