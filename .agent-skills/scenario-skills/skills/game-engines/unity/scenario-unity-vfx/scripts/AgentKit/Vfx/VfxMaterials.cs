// AgentKit.Vfx v0.1 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// URP particle materials from code, and migration of legacy (Built-in) particle materials.
//
// Why: URP's material upgrader only maps Particles/Standard Surface, Standard Unlit, VertexLit Blended
// and Mobile/Particles/VertexLit Blended (URP 17.3 source, MaterialUpgraderProviders.cs), so the Additive
// and Alpha Blended materials of 2017 to 2021 tutorials stay on Built-in shaders. Observed on 6000.3.21f1:
// the simple unlit ones (Legacy Shaders/Particles/Additive, Alpha Blended, Mobile/Particles/Additive) still
// DRAW in URP (their untagged pass runs as SRPDefaultUnlit), so nothing looks broken, but they have none of
// URP's particle features (soft particles, flipbook blending, distortion) and are not SRP Batcher compatible
// [added]. Migrate, then compare captures (the doubled tint below kept the look: PSNR 29 dB).
// Setting _Surface/_Blend alone is not enough: the blend state, render queue
// and keywords are derived by the material inspector, so we call the same public helpers it calls
// (BaseShaderGUI.SetMaterialKeywords(mat, null, ParticleGUI.SetMaterialKeywords)).
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Rendering.Universal.ShaderGUI;
using UnityEngine;

namespace AgentKit.Vfx
{
    public enum VfxBlend { Alpha = 0, Premultiply = 1, Additive = 2, Multiply = 3 }

    public static class VfxMaterials
    {
        public const string UnlitShader = "Universal Render Pipeline/Particles/Unlit";
        public const string SimpleLitShader = "Universal Render Pipeline/Particles/Simple Lit";
        public const string LitShader = "Universal Render Pipeline/Particles/Lit";

        /// <summary>Create or update a URP particle material asset (get-or-create by path).
        /// blend: Alpha for dark bodies and smoke, Additive for fire, sparks and glows (Sirhaian 5Mw6),
        /// Premultiply when one texture must do both. color may be HDR (intensity above 1 feeds Bloom on PC;
        /// on low-end mobile with no post, glow is faked with a big soft additive layer instead, Nordeus).</summary>
        public static Material Particle(string assetPath, VfxBlend blend, Texture tex, Color color,
                                        bool flipbookBlending = false, bool softParticles = false,
                                        string shader = UnlitShader, Color? emission = null)
        {
            var sh = Shader.Find(shader);
            if (sh == null) throw new InvalidOperationException("shader not found: " + shader + " (is this a URP project?)");
            var mat = AssetDatabase.LoadAssetAtPath<Material>(assetPath);
            bool created = mat == null;
            if (created) mat = new Material(sh);
            else mat.shader = sh;
            mat.SetFloat("_Surface", 1f);                 // Transparent (Opaque renders the quad as a square: Gabriel adge [00:02:48])
            mat.SetFloat("_Blend", (float)blend);
            mat.SetFloat("_ZWrite", 0f);
            mat.SetFloat("_Cull", 0f);                    // two-sided: twisting ribbons and meshes (Nordeus)
            mat.SetTexture("_BaseMap", tex);
            mat.SetColor("_BaseColor", color);
            mat.SetFloat("_FlipbookBlending", flipbookBlending ? 1f : 0f);
            mat.SetFloat("_SoftParticlesEnabled", softParticles ? 1f : 0f);
            if (emission.HasValue) mat.SetColor("_EmissionColor", emission.Value);
            ApplyInspectorLogic(mat);
            if (created)
            {
                System.IO.Directory.CreateDirectory(System.IO.Path.Combine(AgentJob.ProjectRoot, System.IO.Path.GetDirectoryName(assetPath)));
                AssetDatabase.CreateAsset(mat, assetPath);
            }
            else EditorUtility.SetDirty(mat);
            return mat;
        }

        /// <summary>What the URP particle material inspector does on every change: surface type -> blend
        /// factors, ZWrite, render queue, keywords (_SURFACE_TYPE_TRANSPARENT, _ALPHAPREMULTIPLY_ON,
        /// _ALPHAMODULATE_ON, _FLIPBOOKBLENDING_ON, _SOFTPARTICLES_ON, _EMISSION ...).</summary>
        public static void ApplyInspectorLogic(Material mat)
        {
            BaseShaderGUI.SetMaterialKeywords(mat, null, ParticleGUI.SetMaterialKeywords);
        }

        public static Dictionary<string, object> Describe(Material m)
        {
            return new Dictionary<string, object>
            {
                { "name", m.name }, { "shader", m.shader.name }, { "queue", m.renderQueue },
                { "blend", m.HasProperty("_Blend") ? ((VfxBlend)(int)m.GetFloat("_Blend")).ToString() : null },
                { "src", m.HasProperty("_SrcBlend") ? m.GetFloat("_SrcBlend") : -1 },
                { "dst", m.HasProperty("_DstBlend") ? m.GetFloat("_DstBlend") : -1 },
                { "keywords", new List<string>(m.shaderKeywords) },
            };
        }

        // ------------------------------------------------------------------ legacy migration
        /// <summary>Map a legacy particle shader name to a URP Particles/Unlit blend mode; null when not legacy.</summary>
        public static VfxBlend? LegacyBlend(string shaderName)
        {
            if (string.IsNullOrEmpty(shaderName)) return null;
            var n = shaderName;
            bool legacy = n.StartsWith("Particles/") || n.StartsWith("Legacy Shaders/Particles/") || n.StartsWith("Mobile/Particles/");
            if (!legacy) return null;
            if (n.Contains("Multiply")) return VfxBlend.Multiply;
            if (n.Contains("Premultiply")) return VfxBlend.Premultiply;
            if (n.Contains("Additive")) return VfxBlend.Additive;
            return VfxBlend.Alpha;   // Alpha Blended, Anim Alpha Blended, VertexLit Blended, Standard Unlit
        }

        /// <summary>Convert one legacy particle material in place to URP Particles/Unlit (or Simple Lit for the
        /// Standard Surface and VertexLit families). Copies _MainTex -> _BaseMap and _TintColor/_Color -> _BaseColor.
        /// Legacy additive shaders multiplied the tint by 2 ("_TintColor" default 0.5 gray): we double it.</summary>
        public static Dictionary<string, object> MigrateLegacy(Material m)
        {
            var from = m.shader != null ? m.shader.name : "(null)";
            var blend = LegacyBlend(from);
            if (blend == null) return null;
            Texture tex = m.HasProperty("_MainTex") ? m.GetTexture("_MainTex") : null;
            Color tint = Color.white;
            bool doubled = false;
            if (m.HasProperty("_TintColor")) { tint = m.GetColor("_TintColor") * 2f; doubled = true; }
            else if (m.HasProperty("_Color")) tint = m.GetColor("_Color");
            var target = (from.Contains("Standard Surface") || from.Contains("VertexLit")) ? SimpleLitShader : UnlitShader;
            m.shader = Shader.Find(target);
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", (float)blend.Value);
            m.SetFloat("_ZWrite", 0f);
            if (tex != null) m.SetTexture("_BaseMap", tex);
            tint.a = Mathf.Clamp01(tint.a);
            m.SetColor("_BaseColor", tint);
            ApplyInspectorLogic(m);
            EditorUtility.SetDirty(m);
            return new Dictionary<string, object>
            {
                { "material", AssetDatabase.GetAssetPath(m) }, { "from", from }, { "to", target },
                { "blend", blend.Value.ToString() }, { "texture", tex != null ? tex.name : null }, { "tint_doubled", doubled },
            };
        }

        /// <summary>Job: migrate every legacy particle material under the given folders. args: folders (list).</summary>
        public static void MigrateLegacyJob()
        {
            AgentJob.Run(() =>
            {
                var folders = new List<string>();
                foreach (var f in AgentJob.List("folders")) folders.Add(f.ToString());
                if (folders.Count == 0) folders.Add("Assets");
                var done = new List<object>();
                int scanned = 0;
                foreach (var guid in AssetDatabase.FindAssets("t:Material", folders.ToArray()))
                {
                    var path = AssetDatabase.GUIDToAssetPath(guid);
                    if (!path.StartsWith("Assets/")) continue;
                    var m = AssetDatabase.LoadAssetAtPath<Material>(path);
                    scanned++;
                    var r = MigrateLegacy(m);
                    if (r != null) done.Add(r);
                }
                AssetDatabase.SaveAssets();
                return new Dictionary<string, object> { { "scanned", scanned }, { "migrated", done } };
            });
        }
    }
}
