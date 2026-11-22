// AgentKit 2D v0.1 (scenario-unity-2d skill, 2026-09-24). Project-level 2D setup an agent needs before
// building content: sorting layers (few, planned early: 2D lights and batching depend on them,
// 2D e-book p. 24 to 26), physics layers for the player and ground, a guard against the Built-in
// "2D Pixel Perfect" package in a URP project (6.3 Manual), and the settings a 2D plan must state.
//
// Jobs:
//   AgentKit.TwoD.TwoDSetup.ProjectSetup   args: sorting_layers [names, back to front, "Default" kept],
//        physics_layers {name: index 6..31}
//   AgentKit.TwoD.TwoDSetup.TopDownSorting args: source renderer (Assets/Settings/Renderer2D.asset),
//        out (copy path), axis [0,1,0]  -> Transparency Sort Mode Custom Axis on a COPY of the 2D renderer
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-2d/test_live_2d.py (P0, P10).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace AgentKit.TwoD
{
    public static class TwoDSetup
    {
        public static void ProjectSetup()
        {
            AgentJob.Run(() =>
            {
                var names = TwoDUtil.ListOr("sorting_layers", "Background", "Default", "Ground", "Characters", "Foreground")
                    .Select(x => x.ToString()).ToList();
                var layers = EnsureSortingLayers(names);
                var phys = new Dictionary<string, object>();
                var pl = TwoDUtil.DictOr("physics_layers", new Dictionary<string, object> { { "Player", 8 }, { "Ground", 9 } });
                foreach (var kv in pl) { SetPhysicsLayer(kv.Key, (int)AgentJson.ToDouble(kv.Value)); phys[kv.Key] = LayerMask.NameToLayer(kv.Key); }
                var manifest = File.ReadAllText(Path.Combine(AgentJob.ProjectRoot, "Packages", "manifest.json"));
                return new Dictionary<string, object>
                {
                    { "sorting_layers", SortingLayer.layers.Select(l => l.name + ":" + l.value).ToList() },
                    { "sorting_layer_order_ok", layers },
                    { "physics_layers", phys },
                    { "builtin_pixel_perfect_package", manifest.Contains("com.unity.2d.pixel-perfect") },
                    { "pipeline", GraphicsSettings.currentRenderPipeline ? GraphicsSettings.currentRenderPipeline.name : "Built-in" },
                    { "sprite_packer_mode", EditorSettings.spritePackerMode.ToString() },
                    { "physics2d_simulation_mode", Physics2D.simulationMode.ToString() },
                    { "fixed_timestep", Time.fixedDeltaTime },
                    { "physics2d_gravity", Physics2D.gravity },
                    { "queries_start_in_colliders", Physics2D.queriesStartInColliders },
                    { "input_handler", InputHandler() },
                };
            });
        }

        static string InputHandler()
        {
            var ps = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
            if (ps == null) return "unknown";
            var p = new SerializedObject(ps).FindProperty("activeInputHandler");
            return p == null ? "unknown" : new[] { "InputManager", "InputSystemPackage", "Both" }.ElementAtOrDefault(p.intValue) ?? p.intValue.ToString();
        }

        /// <summary>Rebuild the sorting layer list in the given back-to-front order, keeping existing
        /// uniqueIDs (renderers reference the ID) and Default (ID 0). Returns true when the order matches.</summary>
        public static bool EnsureSortingLayers(IList<string> names)
        {
            var tm = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
            var arr = tm.FindProperty("m_SortingLayers");
            var existing = new Dictionary<string, uint>();
            for (int i = 0; i < arr.arraySize; i++)
            {
                var e = arr.GetArrayElementAtIndex(i);
                existing[e.FindPropertyRelative("name").stringValue] = e.FindPropertyRelative("uniqueID").uintValue;
            }
            var order = names.ToList();
            if (!order.Contains("Default")) order.Insert(0, "Default");
            foreach (var n in existing.Keys) if (!order.Contains(n)) order.Add(n);   // never drop a layer others may use
            arr.arraySize = order.Count;
            var rng = new System.Random(order.Count * 7919);
            for (int i = 0; i < order.Count; i++)
            {
                var e = arr.GetArrayElementAtIndex(i);
                e.FindPropertyRelative("name").stringValue = order[i];
                uint id = existing.TryGetValue(order[i], out var old) ? old : (uint)rng.Next(1, int.MaxValue);
                e.FindPropertyRelative("uniqueID").uintValue = order[i] == "Default" ? 0u : id;
                var locked = e.FindPropertyRelative("locked");
                if (locked != null) locked.intValue = 0;
            }
            tm.ApplyModifiedPropertiesWithoutUndo();
            AssetDatabase.SaveAssets();
            var now = SortingLayer.layers.Select(l => l.name).ToList();
            return names.Where(n => now.Contains(n)).SequenceEqual(now.Where(n => names.Contains(n)));
        }

        public static void SetPhysicsLayer(string name, int index)
        {
            if (index < 6 || index > 31) throw new ArgumentOutOfRangeException(nameof(index), "user layers are 6..31");
            var tm = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
            var layers = tm.FindProperty("layers");
            var cur = layers.GetArrayElementAtIndex(index).stringValue;
            if (!string.IsNullOrEmpty(cur) && cur != name)
                throw new InvalidOperationException("layer " + index + " is already '" + cur + "'");
            layers.GetArrayElementAtIndex(index).stringValue = name;
            tm.ApplyModifiedPropertiesWithoutUndo();
        }

        /// <summary>Top-down / isometric / brawler sorting: Transparency Sort Mode Custom Axis (0, 1, 0)
        /// on the 2D Renderer Data (2D e-book p. 26). The fields are internal: SerializedObject.</summary>
        public static void TopDownSorting()
        {
            AgentJob.Run(() =>
            {
                var src = AgentJob.Str("source", "Assets/Settings/Renderer2D.asset");
                var dst = AgentJob.Str("out", "Assets/Settings/Renderer2D_TopDown.asset");
                if (!File.Exists(Path.Combine(AgentJob.ProjectRoot, dst)) && !AssetDatabase.CopyAsset(src, dst))
                    throw new InvalidOperationException("could not copy " + src);
                var data = AssetDatabase.LoadAssetAtPath<Renderer2DData>(dst) ?? throw new InvalidOperationException("not a Renderer2DData: " + dst);
                var so = new SerializedObject(data);
                so.FindProperty("m_TransparencySortMode").intValue = (int)TransparencySortMode.CustomAxis;
                var axis = AgentJob.Has("axis") ? AgentJson.ToVector3(AgentJob.Args["axis"], Vector3.up) : Vector3.up;
                so.FindProperty("m_TransparencySortAxis").vector3Value = axis;
                so.ApplyModifiedPropertiesWithoutUndo();
                EditorUtility.SetDirty(data);
                AssetDatabase.SaveAssets();
                var back = new SerializedObject(AssetDatabase.LoadAssetAtPath<Renderer2DData>(dst));
                return new Dictionary<string, object>
                {
                    { "renderer", dst },
                    { "transparency_sort_mode", ((TransparencySortMode)back.FindProperty("m_TransparencySortMode").intValue).ToString() },
                    { "axis", back.FindProperty("m_TransparencySortAxis").vector3Value },
                    { "light_render_texture_scale", back.FindProperty("m_LightRenderTextureScale").floatValue },
                    { "max_light_render_textures", back.FindProperty("m_MaxLightRenderTextureCount").longValue },
                    { "max_shadow_render_textures", back.FindProperty("m_MaxShadowRenderTextureCount").longValue },
                    { "blend_styles", BlendStyles(back) },
                };
            });
        }

        /// <summary>Light Blend Styles of a 2D Renderer Data (name, blend mode, mask channel); the
        /// fields are internal, so read them serialized. Defaults in the 6.3 template: Multiply,
        /// Additive, Multiply with Mask (R), Additive with Mask (R).</summary>
        public static List<string> BlendStyles(SerializedObject rendererData)
        {
            var outp = new List<string>();
            var arr = rendererData.FindProperty("m_LightBlendStyles");
            string[] modes = { "Additive", "Multiply", "Subtractive" };
            string[] chans = { "None", "R", "G", "B", "A" };
            for (int i = 0; arr != null && i < arr.arraySize; i++)
            {
                var e = arr.GetArrayElementAtIndex(i);
                int bm = e.FindPropertyRelative("blendMode").enumValueIndex;
                int ch = e.FindPropertyRelative("maskTextureChannel").enumValueIndex;
                outp.Add(i + ": " + e.FindPropertyRelative("name").stringValue + " (" + (bm >= 0 && bm < modes.Length ? modes[bm] : bm.ToString()) +
                         ", mask " + (ch >= 0 && ch < chans.Length ? chans[ch] : ch.ToString()) + ")");
            }
            return outp;
        }
    }
}
