// AgentKit.Lighting v0.2 (scenario-unity-rendering-lighting skill, 2026-09-24). Shared helpers for the
// lighting jobs: data-driven member edits (public setter first, SerializedObject "m_" field
// otherwise), quality-level resolution, folders, materials. Needs the core AgentKit
// (skills/scenario-unity-expert/scripts/AgentKit) in the same project.
// Run in Unity 6000.3.21f1 (URP 17.3, Metal) on 2026-09-24: tests/code/unity-rendering-lighting/.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Lighting
{
    public static class LightingUtil
    {
        // ------------------------------------------------------------------ member edits
        /// <summary>Apply {"name": value} to target. Keys starting with "m_" go through
        /// SerializedObject (many URP asset properties are read-only in C#: soft shadows, additional
        /// light shadows, light probe system, mixed lighting, rendering layers...); other keys use the
        /// public property or field of that name. Returns one "key=value" line per applied edit.</summary>
        public static List<object> SetMembers(UnityEngine.Object target, Dictionary<string, object> props)
        {
            var applied = new List<object>();
            if (target == null || props == null || props.Count == 0) return applied;
            SerializedObject so = null;
            foreach (var kv in props)
            {
                if (kv.Key.StartsWith("m_"))
                {
                    so ??= new SerializedObject(target);
                    var sp = so.FindProperty(kv.Key);
                    if (sp == null) throw new ArgumentException(target.GetType().Name + " has no serialized field " + kv.Key);
                    SetSerialized(sp, kv.Value);
                    applied.Add(kv.Key + "=" + AgentJson.Serialize(kv.Value));
                    continue;
                }
                var t = target.GetType();
                var p = t.GetProperty(kv.Key, BindingFlags.Public | BindingFlags.Instance);
                if (p != null && p.GetSetMethod(false) != null)
                {
                    p.SetValue(target, Convert(kv.Value, p.PropertyType));
                    applied.Add(kv.Key + "=" + AgentJson.Serialize(kv.Value));
                    continue;
                }
                var f = t.GetField(kv.Key, BindingFlags.Public | BindingFlags.Instance);
                if (f != null)
                {
                    f.SetValue(target, Convert(kv.Value, f.FieldType));
                    applied.Add(kv.Key + "=" + AgentJson.Serialize(kv.Value));
                    continue;
                }
                throw new ArgumentException(t.Name + "." + kv.Key + " has no public setter: use its serialized name (m_...)");
            }
            if (so != null) so.ApplyModifiedPropertiesWithoutUndo();
            EditorUtility.SetDirty(target);
            return applied;
        }

        public static void SetSerialized(SerializedProperty sp, object v)
        {
            switch (sp.propertyType)
            {
                case SerializedPropertyType.Boolean: sp.boolValue = ToBool(v); break;
                case SerializedPropertyType.Integer: sp.intValue = (int)AgentJson.ToDouble(v); break;
                case SerializedPropertyType.Float: sp.floatValue = (float)AgentJson.ToDouble(v); break;
                case SerializedPropertyType.Enum:
                    if (v is string s) sp.enumValueIndex = Array.IndexOf(sp.enumNames, s) >= 0 ? Array.IndexOf(sp.enumNames, s) : int.Parse(s);
                    else sp.intValue = (int)AgentJson.ToDouble(v);
                    break;
                case SerializedPropertyType.Vector2: { var a = AgentJson.ToVector3(v, Vector3.zero); sp.vector2Value = new Vector2(a.x, a.y); break; }
                case SerializedPropertyType.Vector3: sp.vector3Value = AgentJson.ToVector3(v, Vector3.zero); break;
                case SerializedPropertyType.Color: sp.colorValue = AgentJson.ToColor(v, Color.white); break;
                case SerializedPropertyType.String: sp.stringValue = System.Convert.ToString(v, CultureInfo.InvariantCulture); break;
                case SerializedPropertyType.ObjectReference:
                    sp.objectReferenceValue = v is string path && !string.IsNullOrEmpty(path) ? AssetDatabase.LoadMainAssetAtPath(path) : null;
                    break;
                case SerializedPropertyType.LayerMask: sp.intValue = (int)AgentJson.ToDouble(v); break;
                default: throw new ArgumentException("unsupported serialized type " + sp.propertyType + " for " + sp.propertyPath);
            }
        }

        public static object ReadSerialized(SerializedProperty sp)
        {
            if (sp == null) return null;
            switch (sp.propertyType)
            {
                case SerializedPropertyType.Boolean: return sp.boolValue;
                case SerializedPropertyType.Integer: return sp.intValue;
                case SerializedPropertyType.LayerMask: return sp.intValue;
                case SerializedPropertyType.Float: return Math.Round(sp.floatValue, 5);
                case SerializedPropertyType.Enum: return sp.enumValueIndex >= 0 && sp.enumValueIndex < sp.enumNames.Length ? sp.enumNames[sp.enumValueIndex] : (object)sp.intValue;
                case SerializedPropertyType.Vector2: return sp.vector2Value;
                case SerializedPropertyType.Vector3: return sp.vector3Value;
                case SerializedPropertyType.Color: return sp.colorValue;
                case SerializedPropertyType.String: return sp.stringValue;
                case SerializedPropertyType.ObjectReference: return sp.objectReferenceValue ? AssetDatabase.GetAssetPath(sp.objectReferenceValue) : null;
                default: return sp.propertyType.ToString();
            }
        }

        public static Dictionary<string, object> ReadFields(UnityEngine.Object target, IEnumerable<string> names)
        {
            var d = new Dictionary<string, object>();
            if (target == null) return d;
            var so = new SerializedObject(target);
            foreach (var n in names)
            {
                var sp = so.FindProperty(n);
                if (sp != null && sp.propertyType == SerializedPropertyType.Enum)
                {
                    d[n] = sp.intValue;   // underlying value (m_MSAA 4 = 4x), comparable with the spec
                    d[n + "__name"] = ReadSerialized(sp);
                }
                else d[n] = sp != null ? ReadSerialized(sp) : "<missing>";
            }
            return d;
        }

        /// <summary>The direct children of a serialized struct field ("m_Settings" of a renderer
        /// feature) as {name: value}.</summary>
        public static Dictionary<string, object> ReadChildren(UnityEngine.Object target, string rootPath)
        {
            var d = new Dictionary<string, object>();
            if (target == null) return d;
            var root = new SerializedObject(target).FindProperty(rootPath);
            if (root == null) return d;
            var end = root.GetEndProperty();
            var it = root.Copy();
            if (!it.NextVisible(true)) return d;
            while (!SerializedProperty.EqualContents(it, end))
            {
                if (it.depth == root.depth + 1) d[it.name] = ReadSerialized(it);
                if (!it.NextVisible(false)) break;
            }
            return d;
        }

        public static UnityEngine.Object GraphicsSettingsAsset()
        {
            return AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset").FirstOrDefault();
        }

        /// <summary>Instance or static field of any visibility, walking base types (reflection into
        /// internals: used only where 6.3 has no public API, and every caller handles null).</summary>
        public static object GetField(object o, string name)
        {
            if (o == null) return null;
            for (var t = o.GetType(); t != null; t = t.BaseType)
            {
                var f = t.GetField(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (f != null) return f.GetValue(o);
                var p = t.GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (p != null && p.GetIndexParameters().Length == 0) return p.GetValue(o);
            }
            return null;
        }

        /// <summary>Length of a NativeList, DynamicArray, array or IList, by reflection.</summary>
        public static int ListLength(object list)
        {
            if (list == null) return 0;
            if (list is Array a) return a.Length;
            if (list is System.Collections.IList il) return il.Count;
            foreach (var n in new[] { "Length", "size", "Count" })
            {
                var v = GetField(list, n);
                if (v != null) return System.Convert.ToInt32(v);
            }
            return 0;
        }

        /// <summary>Element i of a NativeList (by-value indexer) or a DynamicArray (ref indexer, so
        /// read through its backing array).</summary>
        public static object ListItem(object list, int i)
        {
            if (list == null) return null;
            if (list is Array a) return a.GetValue(i);
            if (list is System.Collections.IList il) return il[i];
            try
            {
                var p = list.GetType().GetProperty("Item", BindingFlags.Instance | BindingFlags.Public);
                if (p != null && !p.PropertyType.IsByRef) return p.GetValue(list, new object[] { i });
            }
            catch (Exception) { }
            var arr = GetField(list, "m_Array") as Array;
            return arr != null && i < arr.Length ? arr.GetValue(i) : null;
        }

        public static bool ToBool(object v)
        {
            if (v is bool b) return b;
            var s = System.Convert.ToString(v, CultureInfo.InvariantCulture)?.ToLowerInvariant();
            return s == "1" || s == "true" || s == "yes" || s == "on";
        }

        public static object Convert(object v, Type type)
        {
            if (type == typeof(bool)) return ToBool(v);
            if (type == typeof(int)) return (int)AgentJson.ToDouble(v);
            if (type == typeof(uint)) return (uint)AgentJson.ToDouble(v);
            if (type == typeof(float)) return (float)AgentJson.ToDouble(v);
            if (type == typeof(double)) return AgentJson.ToDouble(v);
            if (type == typeof(string)) return System.Convert.ToString(v, CultureInfo.InvariantCulture);
            if (type.IsEnum) return v is string s ? Enum.Parse(type, s, true) : Enum.ToObject(type, (int)AgentJson.ToDouble(v));
            if (type == typeof(Vector2)) { var a = AgentJson.ToVector3(v, Vector3.zero); return new Vector2(a.x, a.y); }
            if (type == typeof(Vector3)) return AgentJson.ToVector3(v, Vector3.zero);
            if (type == typeof(Vector4))
            {
                if (v is List<object> l && l.Count >= 4)
                    return new Vector4((float)AgentJson.ToDouble(l[0]), (float)AgentJson.ToDouble(l[1]), (float)AgentJson.ToDouble(l[2]), (float)AgentJson.ToDouble(l[3]));
                var a = AgentJson.ToVector3(v, Vector3.zero);
                return new Vector4(a.x, a.y, a.z, 0);
            }
            if (type == typeof(Color)) return AgentJson.ToColor(v, Color.white);
            if (type == typeof(LayerMask)) return (LayerMask)(int)AgentJson.ToDouble(v);
            if (typeof(UnityEngine.Object).IsAssignableFrom(type))
                return v is string path && !string.IsNullOrEmpty(path) ? AssetDatabase.LoadAssetAtPath(path, type) : null;
            throw new ArgumentException("cannot convert " + AgentJson.Serialize(v) + " to " + type.Name);
        }

        // ------------------------------------------------------------------ pipeline resolution
        public static int QualityIndex(string name)
        {
            var names = QualitySettings.names;
            for (int i = 0; i < names.Length; i++)
                if (string.Equals(names[i], name, StringComparison.OrdinalIgnoreCase)) return i;
            throw new ArgumentException("no quality level '" + name + "' (have: " + string.Join(", ", names) + ")");
        }

        /// <summary>The pipeline asset a quality level renders with: its own asset, or the Graphics
        /// default when the level's slot is None (the classic "I edited an asset nothing uses").</summary>
        public static RenderPipelineAsset ResolvedAsset(int level, out bool fallsBackToDefault)
        {
            var own = QualitySettings.GetRenderPipelineAssetAt(level);
            fallsBackToDefault = own == null;
            return own != null ? own : GraphicsSettings.defaultRenderPipeline;
        }

        public static UniversalRendererData RendererData(UniversalRenderPipelineAsset asset, int index = -1)
        {
            var so = new SerializedObject(asset);
            var list = so.FindProperty("m_RendererDataList");
            if (index < 0) index = so.FindProperty("m_DefaultRendererIndex").intValue;
            if (list == null || index >= list.arraySize) return null;
            return list.GetArrayElementAtIndex(index).objectReferenceValue as UniversalRendererData;
        }

        public static List<UniversalRendererData> AllRendererData(UniversalRenderPipelineAsset asset)
        {
            var res = new List<UniversalRendererData>();
            var list = new SerializedObject(asset).FindProperty("m_RendererDataList");
            for (int i = 0; list != null && i < list.arraySize; i++)
                if (list.GetArrayElementAtIndex(i).objectReferenceValue is UniversalRendererData d) res.Add(d);
            return res;
        }

        public static UnityEngine.Object QualitySettingsAsset()
        {
            return AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/QualitySettings.asset").FirstOrDefault();
        }

        // ------------------------------------------------------------------ APV rendering layer masks
        /// <summary>A ProbeVolumeBakingSet's Rendering Layer Mask settings (useRenderingLayers and
        /// renderingLayerMasks are non-public serialized fields in 6.3: read and written through
        /// SerializedObject). Masks need Use Rendering Layers on the URP asset (6.3 Manual, APV light
        /// leaks step 3).</summary>
        public static Dictionary<string, object> BakingSetLayers(UnityEngine.Object set)
        {
            var d = new Dictionary<string, object> { { "use_rendering_layers", false }, { "masks", new List<object>() } };
            if (set == null) return d;
            var so = new SerializedObject(set);
            var use = so.FindProperty("useRenderingLayers");
            var arr = so.FindProperty("renderingLayerMasks");
            d["use_rendering_layers"] = use != null && use.boolValue;
            var masks = new List<object>();
            for (int i = 0; arr != null && i < arr.arraySize; i++)
            {
                var e = arr.GetArrayElementAtIndex(i);
                masks.Add(new Dictionary<string, object> { { "name", e.FindPropertyRelative("name")?.stringValue }, { "mask", MaskBits(e.FindPropertyRelative("mask")) } });
            }
            d["masks"] = masks;
            return d;
        }

        public static long MaskBits(SerializedProperty m)
        {
            if (m == null) return 0;
            var b = m.FindPropertyRelative("m_Bits");
            if (b != null) return b.longValue;
            return m.propertyType == SerializedPropertyType.Integer ? m.longValue : 0;
        }

        public static void SetMaskBits(SerializedProperty m, long bits)
        {
            var b = m.FindPropertyRelative("m_Bits");
            if (b != null) b.longValue = bits; else m.longValue = bits;
        }

        /// <summary>Baking sets (asset objects) that contain the scene.</summary>
        public static List<UnityEngine.Object> BakingSetsFor(string scenePath)
        {
            var guid = AssetDatabase.AssetPathToGUID(scenePath);
            return AssetDatabase.FindAssets("t:ProbeVolumeBakingSet").Select(AssetDatabase.GUIDToAssetPath)
                .Select(AssetDatabase.LoadAssetAtPath<ProbeVolumeBakingSet>).Where(b => b != null && b.sceneGUIDs.Contains(guid))
                .Cast<UnityEngine.Object>().ToList();
        }

        // ------------------------------------------------------------------ assets
        public static void EnsureFolder(string folder)
        {
            folder = folder.Replace('\\', '/').TrimEnd('/');
            if (AssetDatabase.IsValidFolder(folder)) return;
            var parent = Path.GetDirectoryName(folder).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(folder));
        }

        /// <summary>Get-or-create a URP Lit material asset with a base colour (sRGB list [r,g,b]).</summary>
        public static Material LitMaterial(string folder, string name, Color color, float smoothness = 0.2f, float metallic = 0f)
        {
            EnsureFolder(folder);
            var path = folder + "/" + name + ".mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                var sh = Shader.Find("Universal Render Pipeline/Lit");
                if (sh == null) throw new InvalidOperationException("URP Lit shader not found: is URP the active pipeline?");
                m = new Material(sh);
                AssetDatabase.CreateAsset(m, path);
            }
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_Metallic", metallic);
            EditorUtility.SetDirty(m);
            return m;
        }

        public static string RelPath(string abs)
        {
            var root = AgentJob.ProjectRoot.Replace('\\', '/') + "/";
            abs = abs.Replace('\\', '/');
            return abs.StartsWith(root) ? abs.Substring(root.Length) : abs;
        }

        public static long FileSize(string assetPath)
        {
            if (string.IsNullOrEmpty(assetPath)) return 0;
            var abs = AgentJob.ResolvePath(assetPath);
            return File.Exists(abs) ? new FileInfo(abs).Length : 0;
        }

        public static double MB(long bytes) => Math.Round(bytes / 1048576.0, 3);

        public static List<object> V(Vector3 v) => new List<object> { Math.Round(v.x, 3), Math.Round(v.y, 3), Math.Round(v.z, 3) };
    }
}
