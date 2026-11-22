// AgentKit.Shaders v0.1 (scenario-unity-shaders skill, 2026-09-24). Add, configure, toggle and list URP renderer
// features on a UniversalRendererData asset by script, the way URP's own "Add Renderer Feature" button
// does it (ScriptableRendererDataEditor.AddComponent, URP 17.3): CreateInstance, AddObjectToAsset,
// append to m_RendererFeatures AND to the parallel m_RendererFeatureMap (local file ids) through
// SerializedObject, then save. Appending to rendererFeatures alone leaves the map stale until URP
// repairs it on validation.
//
// Jobs:
//   AddFeature   args: renderer (UniversalRendererData path; default: first renderer of the active URP
//                asset), type (full type name, e.g. "AgentKit.Rendering.AgentFullscreenFeature" or
//                "UnityEngine.Rendering.Universal.FullScreenPassRendererFeature"), name, active (bool),
//                fields {fieldName: value}: public fields or [SerializeField] fields; Material fields take an
//                asset path, enums take the member name, ScriptableRenderPassInput takes "Depth|Normal".
//                Idempotent: an existing feature with the same name is updated, not duplicated.
//   SetFeatureActive args: renderer, name, active
//   ListFeatures args: renderer -> every renderer of every URP asset in Quality and Graphics settings, with
//                its features (the audit: a feature missing from ONE renderer used by a quality level is the
//                top reason a custom effect "does nothing", Daniel Ilett 26gbtRTokVo [00:26:38]).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_shaders.py.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Shaders
{
    public static class RendererFeatureJobs
    {
        public static Type FindType(string fullName)
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                var t = asm.GetType(fullName, false);
                if (t != null) return t;
            }
            return null;
        }

        static object ConvertValue(object v, Type t)
        {
            if (typeof(UnityEngine.Object).IsAssignableFrom(t))
                return v == null ? null : AssetDatabase.LoadAssetAtPath(Convert.ToString(v), t);
            if (t.IsEnum)
            {
                var s = Convert.ToString(v);
                if (t.GetCustomAttribute<FlagsAttribute>() != null)
                {
                    long acc = 0;
                    foreach (var part in s.Split(new[] { '|', ',' }, StringSplitOptions.RemoveEmptyEntries))
                        acc |= Convert.ToInt64(Enum.Parse(t, part.Trim()));
                    return Enum.ToObject(t, acc);
                }
                return Enum.Parse(t, s);
            }
            if (t == typeof(bool)) return v is bool b ? b : AgentJson.ToDouble(v) > 0;
            if (t == typeof(int)) return (int)AgentJson.ToDouble(v);
            if (t == typeof(float)) return (float)AgentJson.ToDouble(v);
            if (t == typeof(string)) return Convert.ToString(v);
            if (t == typeof(Color)) return AgentJson.ToColor(v, Color.white);
            if (t == typeof(Vector3)) return AgentJson.ToVector3(v, Vector3.zero);
            return Convert.ChangeType(v, t);
        }

        public static void SetFields(object target, Dictionary<string, object> fields, List<string> set)
        {
            var t = target.GetType();
            foreach (var kv in fields)
            {
                var fi = t.GetField(kv.Key, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (fi == null) throw new ArgumentException(t.Name + " has no field " + kv.Key);
                fi.SetValue(target, ConvertValue(kv.Value, fi.FieldType));
                set.Add(kv.Key);
            }
        }

        public static ScriptableRendererFeature AddOrUpdate(UniversalRendererData rd, Type type, string name, Dictionary<string, object> fields, bool active, List<string> set, out bool created)
        {
            if (!typeof(ScriptableRendererFeature).IsAssignableFrom(type)) throw new ArgumentException(type + " is not a ScriptableRendererFeature");
            var feature = rd.rendererFeatures.FirstOrDefault(f => f != null && f.name == name && f.GetType() == type);
            created = feature == null;
            if (created)
            {
                feature = (ScriptableRendererFeature)ScriptableObject.CreateInstance(type);
                feature.name = name;
                AssetDatabase.AddObjectToAsset(feature, rd);          // sub-asset of the renderer
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(feature, out string _, out long localId);
                var so = new SerializedObject(rd);
                var list = so.FindProperty("m_RendererFeatures");
                var map = so.FindProperty("m_RendererFeatureMap");
                list.arraySize++;
                list.GetArrayElementAtIndex(list.arraySize - 1).objectReferenceValue = feature;
                map.arraySize++;
                map.GetArrayElementAtIndex(map.arraySize - 1).longValue = localId;
                so.ApplyModifiedPropertiesWithoutUndo();
            }
            SetFields(feature, fields, set);
            feature.SetActive(active);
            feature.Create();                                          // what the Inspector triggers after a change
            EditorUtility.SetDirty(feature);
            rd.SetDirty();
            EditorUtility.SetDirty(rd);
            AssetDatabase.SaveAssets();
            return feature;
        }

        static UniversalRendererData ResolveRenderer()
        {
            var rd = ShaderJobs.RendererData(AgentJob.Str("renderer"), ShaderJobs.ActiveUrpAsset("active"));
            if (rd == null) throw new InvalidOperationException("UniversalRendererData not found: " + AgentJob.Str("renderer", "(active asset)"));
            return rd;
        }

        public static Dictionary<string, object> Describe(ScriptableRendererData rd)
        {
            return new Dictionary<string, object>
            {
                { "path", AssetDatabase.GetAssetPath(rd) }, { "type", rd.GetType().Name },
                { "rendering_mode", rd is UniversalRendererData u ? u.renderingMode.ToString() : null },
                { "features", rd.rendererFeatures.Select(f => f == null ? (object)"<missing script>" : new Dictionary<string, object>
                    { { "name", f.name }, { "type", f.GetType().FullName }, { "active", f.isActive } }).ToList() },
            };
        }

        public static void AddFeature()
        {
            AgentJob.Run(() =>
            {
                var rd = ResolveRenderer();
                // one feature (type, name, fields, active) or several: features[{type, name, fields, active}]
                var specs = AgentJob.List("features").OfType<Dictionary<string, object>>().ToList();
                if (specs.Count == 0)
                    specs.Add(new Dictionary<string, object> { { "type", AgentJob.Str("type") }, { "name", AgentJob.Str("name") },
                                                               { "fields", AgentJob.Dict("fields") }, { "active", AgentJob.Bool("active", true) } });
                var done = new List<object>();
                foreach (var spec in specs)
                {
                    var typeName = Convert.ToString(spec["type"]);
                    var type = FindType(typeName);
                    if (type == null) throw new ArgumentException("type not found (did it compile? is it in a runtime assembly?): " + typeName);
                    var set = new List<string>();
                    var name = spec.TryGetValue("name", out var n) && n != null ? Convert.ToString(n) : type.Name;
                    var fields = spec.TryGetValue("fields", out var fo) && fo is Dictionary<string, object> fd ? fd : new Dictionary<string, object>();
                    bool active = !spec.TryGetValue("active", out var a) || a == null || (a is bool b ? b : AgentJson.ToDouble(a) > 0);
                    var f = AddOrUpdate(rd, type, name, fields, active, set, out bool created);
                    done.Add(new Dictionary<string, object> { { "feature", f.name }, { "type", type.FullName }, { "created", created }, { "fields_set", set }, { "active", f.isActive } });
                }
                return new Dictionary<string, object> { { "renderer", Describe(rd) }, { "added", done } };
            });
        }

        public static void SetFeatureActive()
        {
            AgentJob.Run(() =>
            {
                var rd = ResolveRenderer();
                var name = AgentJob.Str("name");
                var f = rd.rendererFeatures.FirstOrDefault(x => x != null && x.name == name);
                if (f == null) throw new ArgumentException("feature not found: " + name);
                f.SetActive(AgentJob.Bool("active", true));
                EditorUtility.SetDirty(f);
                rd.SetDirty();
                AssetDatabase.SaveAssets();
                return Describe(rd);
            });
        }

        public static void ListFeatures()
        {
            AgentJob.Run(() =>
            {
                var assets = new List<object>();
                var seen = new HashSet<ScriptableRendererData>();
                var names = QualitySettings.names;
                for (int q = 0; q < names.Length; q++)
                {
                    var rp = QualitySettings.GetRenderPipelineAssetAt(q) ?? GraphicsSettings.defaultRenderPipeline;
                    var urp = rp as UniversalRenderPipelineAsset;
                    if (urp == null) continue;
                    var rds = new List<object>();
                    foreach (var rd in urp.rendererDataList.ToArray())
                    {
                        if (rd == null) continue;
                        rds.Add(Describe(rd));
                        seen.Add(rd);
                    }
                    assets.Add(new Dictionary<string, object>
                    {
                        { "quality_level", names[q] }, { "asset", AssetDatabase.GetAssetPath(urp) },
                        { "depth_texture", urp.supportsCameraDepthTexture }, { "opaque_texture", urp.supportsCameraOpaqueTexture },
                        { "renderers", rds },
                    });
                }
                return new Dictionary<string, object>
                {
                    { "active_quality", names[QualitySettings.GetQualityLevel()] }, { "quality_levels", assets },
                };
            });
        }
    }
}
