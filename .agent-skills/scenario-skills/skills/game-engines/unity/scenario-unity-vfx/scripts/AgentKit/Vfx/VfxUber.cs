// AgentKit.Vfx v0.2 (Unity Expert Skills, scenario-unity-vfx, 2026-09-24).
// Materials of the uber VFX shader (scripts/Shaders/VfxUber.shader, "AgentKit/VFX/Uber") and the Custom
// Data contract that feeds it per particle.
// Why one uber shader: Nordeus shipped Spellsouls' AAA-looking spells on old phones with ONE custom unlit VFX
// shader whose features are toggles (grayscale + LUT ramp, channel options, linear fade, erosion, second alpha,
// blend and cull per material), instead of a zoo of stock shaders (Nikola Damjanov, YZWK [00:13:49] to [00:24:01]).
// Why Custom Data: per-particle variation (dissolve curve, random noise offset, wipe) must come from the
// Particle System through custom vertex streams, so one material serves every variant (Hovl Studio 5Sos
// [00:07:34] to [00:17:32]) and the SRP Batcher stays on (no per-renderer MaterialPropertyBlock).
// Keywords are shader_feature_local and set HERE, on the material asset, at authoring time: Unity 6 builds
// compile only the combinations used by materials in the build, so never toggle them from gameplay code.
using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace AgentKit.Vfx
{
    public class UberSpec
    {
        public VfxBlend blend = VfxBlend.Additive;   // Alpha, Additive, or Premultiply (= rgb added, alpha occludes)
        public Texture main;                          // R gray (+ alpha), G emission mask, B alpha override
        public Vector2 mainTiling = Vector2.one;
        public Vector2 mainScroll;                    // UV per second: the "texture moving over a mesh" (Nordeus)
        public Color tint = Color.white;
        public Texture ramp;                          // non-null enables _RAMP_ON (LUT 256 x 1, uncompressed)
        public Color? emission;                       // non-null enables _EMISSION_G
        public bool alphaFromB;                       // _ALPHA_B
        public Vector4? linearFade;                   // (dir.x, dir.y, position, width): _LINEARFADE_ON
        public float? erosion;                        // black point: _EROSION_ON
        public float erosionWidth = 1f;               // 1 = soft levels; small = crisp dissolve edge
        public Texture secondAlpha;                   // non-null enables _SECONDALPHA_ON
        public Vector2 secondTiling = Vector2.one;
        public Vector2 secondScroll;
        public bool customData;                       // _CUSTOMDATA_ON: renderer streams must be VfxUber.Streams
        public CullMode cull = CullMode.Off;          // twisting transparent meshes need two-sided (Nordeus [00:23:19])
    }

    public static class VfxUber
    {
        public const string ShaderName = "AgentKit/VFX/Uber";

        /// <summary>The vertex stream contract of the shader with _CUSTOMDATA_ON: TEXCOORD0 = uv.xy + Custom1.xy,
        /// TEXCOORD1 = Custom2.xy. Any other order silently feeds the wrong values (or zeros) to the shader.</summary>
        public static readonly ParticleSystemVertexStream[] Streams =
        {
            ParticleSystemVertexStream.Position, ParticleSystemVertexStream.Color, ParticleSystemVertexStream.UV,
            ParticleSystemVertexStream.Custom1XY, ParticleSystemVertexStream.Custom2XY,
        };

        public static readonly string[] Keywords = { "_RAMP_ON", "_EMISSION_G", "_ALPHA_B", "_LINEARFADE_ON", "_EROSION_ON", "_SECONDALPHA_ON", "_CUSTOMDATA_ON" };

        static void Toggle(Material m, string prop, string kw, bool on)
        {
            m.SetFloat(prop, on ? 1f : 0f);                // keeps the inspector [Toggle] drawer in sync
            if (on) m.EnableKeyword(kw); else m.DisableKeyword(kw);
        }

        /// <summary>Create or update an uber VFX material asset (get-or-create by path).</summary>
        public static Material Create(string assetPath, UberSpec s)
        {
            var sh = Shader.Find(ShaderName);
            if (sh == null) throw new InvalidOperationException(ShaderName + " not found: install scripts/Shaders/VfxUber.shader (ut_vfx.install)");
            var mat = AssetDatabase.LoadAssetAtPath<Material>(assetPath);
            bool created = mat == null;
            if (created) mat = new Material(sh);
            else mat.shader = sh;
            mat.SetTexture("_BaseMap", s.main);
            mat.SetTextureScale("_BaseMap", s.mainTiling);
            mat.SetVector("_MainScroll", s.mainScroll);
            mat.SetColor("_BaseColor", s.tint);
            Toggle(mat, "_RampOn", "_RAMP_ON", s.ramp != null);
            if (s.ramp != null) mat.SetTexture("_RampTex", s.ramp);
            Toggle(mat, "_EmissionG", "_EMISSION_G", s.emission.HasValue);
            if (s.emission.HasValue) mat.SetColor("_EmissionColor", s.emission.Value);
            Toggle(mat, "_AlphaB", "_ALPHA_B", s.alphaFromB);
            Toggle(mat, "_LinearFadeOn", "_LINEARFADE_ON", s.linearFade.HasValue);
            if (s.linearFade.HasValue) mat.SetVector("_FadeParams", s.linearFade.Value);
            Toggle(mat, "_ErosionOn", "_EROSION_ON", s.erosion.HasValue);
            mat.SetFloat("_Erosion", s.erosion ?? 0f);
            mat.SetFloat("_ErosionWidth", Mathf.Clamp(s.erosionWidth, 0.01f, 1f));
            Toggle(mat, "_SecondAlphaOn", "_SECONDALPHA_ON", s.secondAlpha != null);
            if (s.secondAlpha != null)
            {
                mat.SetTexture("_SecondAlphaTex", s.secondAlpha);
                mat.SetTextureScale("_SecondAlphaTex", s.secondTiling);
                mat.SetVector("_SecondScroll", s.secondScroll);
            }
            Toggle(mat, "_CustomDataOn", "_CUSTOMDATA_ON", s.customData);
            switch (s.blend)
            {
                case VfxBlend.Alpha: mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha); break;
                case VfxBlend.Premultiply: mat.SetFloat("_SrcBlend", (float)BlendMode.One); mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha); break;
                default: mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); mat.SetFloat("_DstBlend", (float)BlendMode.One); break;
            }
            mat.SetFloat("_Cull", (float)s.cull);
            mat.SetFloat("_ZWrite", 0f);
            mat.renderQueue = (int)RenderQueue.Transparent;
            if (created)
            {
                System.IO.Directory.CreateDirectory(System.IO.Path.Combine(AgentJob.ProjectRoot, System.IO.Path.GetDirectoryName(assetPath)));
                AssetDatabase.CreateAsset(mat, assetPath);
            }
            else EditorUtility.SetDirty(mat);
            return mat;
        }

        /// <summary>True when the renderer's active vertex streams start with the uber contract.</summary>
        public static bool StreamsMatch(ParticleSystemRenderer r)
        {
            var streams = new List<ParticleSystemVertexStream>();
            r.GetActiveVertexStreams(streams);
            if (streams.Count < Streams.Length) return false;
            for (int i = 0; i < Streams.Length; i++) if (streams[i] != Streams[i]) return false;
            return true;
        }

        /// <summary>True when the Custom Data module is on with Custom1 and Custom2 in Vector mode.</summary>
        public static bool CustomDataReady(ParticleSystem ps)
        {
            var cd = ps.customData;
            return cd.enabled && cd.GetMode(ParticleSystemCustomData.Custom1) == ParticleSystemCustomDataMode.Vector
                   && cd.GetMode(ParticleSystemCustomData.Custom2) == ParticleSystemCustomDataMode.Vector;
        }

        public static bool IsUber(Material m) => m != null && m.shader != null && m.shader.name == ShaderName;

        public static Dictionary<string, object> Describe(Material m)
        {
            var on = new List<string>();
            foreach (var k in Keywords) if (m.IsKeywordEnabled(k)) on.Add(k);
            return new Dictionary<string, object>
            {
                { "name", m.name }, { "shader", m.shader.name }, { "queue", m.renderQueue }, { "keywords", on },
                { "src", m.GetFloat("_SrcBlend") }, { "dst", m.GetFloat("_DstBlend") }, { "cull", m.GetFloat("_Cull") },
                { "srp_batcher_compatible_declared", true },
            };
        }
    }
}
