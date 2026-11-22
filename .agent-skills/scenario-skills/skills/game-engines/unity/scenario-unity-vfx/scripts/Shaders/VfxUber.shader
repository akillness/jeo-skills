// AgentKit.Vfx v0.2 (scenario-unity-vfx, 2026-09-24). The mobile "uber VFX shader" of Nordeus's Spellsouls crew
// (Nikola Damjanov, Unite Europe 2017, YZWKdw03Gls [00:13:49] to [00:24:01]) written as URP text:
// one unlit transparent shader whose features are shader_feature_local toggles set on the MATERIAL at
// authoring time (only the combinations used by shipped materials are compiled; never toggle them at runtime).
//   R  = main grayscale: color through a LUT ramp (_RAMP_ON, 256 x 1, uncompressed, clamp, no mips) and alpha
//   G  = optional emission mask (_EMISSION_G): a glow on top of the main color, same draw call
//   B  = optional alpha override (_ALPHA_B) when the gray value is not the wanted transparency
//   linear fade along UV with direction, position and width (_LINEARFADE_ON), alpha erosion with a black point
//   and softness (_EROSION_ON), a second alpha texture with its own tiling and scroll (_SECONDALPHA_ON),
//   exposed Blend and Cull (twisting meshes need two-sided).
// Per-particle data (_CUSTOMDATA_ON) comes from the Particle System's Custom Data module through custom vertex
// streams, in THIS order (VfxUber.Streams): Position, Color, UV, Custom1.xy, Custom2.xy, so
//   TEXCOORD0 = (uv.x, uv.y, Custom1.x, Custom1.y), TEXCOORD1 = (Custom2.x, Custom2.y, -, -)
//   Custom1.x adds to the erosion black point (dissolve over life), Custom1.y multiplies the emission,
//   Custom2.x offsets both texture UVs (a random value per particle: "a random number cannot be made in a
//   shader", Hovl Studio 5SosGQwPXdY [00:10:22]), Custom2.y adds to the linear fade position (a wipe).
// Without _CUSTOMDATA_ON the same material works on a MeshRenderer or on particles with the default streams.
// Non-instanced path only: GPU-instanced mesh particles read unity_ParticleInstanceData instead of the streams
// (Fred Moreau, Posts 3 and 6), so keep "Enable GPU Instancing" off on renderers that use Custom Data here.
// Live-tested in Unity 6000.3.21f1 (tests/code/unity-vfx/test_live_meshfx.py).
Shader "AgentKit/VFX/Uber"
{
    Properties
    {
        [MainTexture] _BaseMap ("Main (R gray + alpha, G emission mask, B alpha override)", 2D) = "white" {}
        [MainColor][HDR] _BaseColor ("Tint (x ramp x vertex color)", Color) = (1, 1, 1, 1)
        _MainScroll ("Main scroll, UV per second (xy)", Vector) = (0, 0, 0, 0)
        [Toggle(_RAMP_ON)] _RampOn ("LUT ramp from R", Float) = 0
        [NoScaleOffset] _RampTex ("Ramp LUT (256 x 1, uncompressed, clamp, no mips)", 2D) = "white" {}
        [Toggle(_EMISSION_G)] _EmissionG ("G channel = emission", Float) = 0
        [HDR] _EmissionColor ("Emission color", Color) = (1, 0.6, 0.2, 1)
        [Toggle(_ALPHA_B)] _AlphaB ("B channel = alpha override", Float) = 0
        [Toggle(_LINEARFADE_ON)] _LinearFadeOn ("Linear fade along UV", Float) = 0
        _FadeParams ("Fade: direction in UV (xy), position (z), width (w)", Vector) = (1, 0, 0, 0.3)
        [Toggle(_EROSION_ON)] _ErosionOn ("Alpha erosion", Float) = 0
        _Erosion ("Erosion black point", Range(0, 1)) = 0
        _ErosionWidth ("Erosion softness (white point - black point)", Range(0.01, 1)) = 1
        [Toggle(_SECONDALPHA_ON)] _SecondAlphaOn ("Second alpha texture", Float) = 0
        _SecondAlphaTex ("Second alpha (R), own tiling", 2D) = "white" {}
        _SecondScroll ("Second alpha scroll, UV per second (xy)", Vector) = (0, 0, 0, 0)
        [Toggle(_CUSTOMDATA_ON)] _CustomDataOn ("Per-particle Custom Data (streams: Position, Color, UV, Custom1.xy, Custom2.xy)", Float) = 0
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src blend", Float) = 5
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst blend", Float) = 10
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 0
        [Enum(Off, 0, On, 1)] _ZWrite ("ZWrite", Float) = 0
    }

    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent" "RenderPipeline" = "UniversalPipeline" "IgnoreProjector" = "True" "PreviewType" = "Plane" }

        Pass
        {
            Name "ForwardUnlit"
            Tags { "LightMode" = "UniversalForward" }
            Blend [_SrcBlend] [_DstBlend]
            ZWrite [_ZWrite]
            Cull [_Cull]

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma shader_feature_local _RAMP_ON
            #pragma shader_feature_local _EMISSION_G
            #pragma shader_feature_local _ALPHA_B
            #pragma shader_feature_local _LINEARFADE_ON
            #pragma shader_feature_local _EROSION_ON
            #pragma shader_feature_local _SECONDALPHA_ON
            #pragma shader_feature_local _CUSTOMDATA_ON
            #pragma multi_compile_fog

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_BaseMap);        SAMPLER(sampler_BaseMap);
            TEXTURE2D(_RampTex);        SAMPLER(sampler_RampTex);
            TEXTURE2D(_SecondAlphaTex); SAMPLER(sampler_SecondAlphaTex);

            // Global (not a material property): capture jobs set (1, simulated time) so scrolling matches ParticleSystem.Simulate
            // and captures repeat; left at (0, 0) the shader uses _Time.y (VfxSequence.CaptureEffect resets it).
            float4 _AgentVfxTime;

            CBUFFER_START(UnityPerMaterial)      // every material property here: SRP Batcher compatible
                float4 _BaseMap_ST;
                half4 _BaseColor;
                float4 _MainScroll;
                half4 _EmissionColor;
                float4 _FadeParams;
                half _Erosion;
                half _ErosionWidth;
                float4 _SecondAlphaTex_ST;
                float4 _SecondScroll;
                half _RampOn, _EmissionG, _AlphaB, _LinearFadeOn, _ErosionOn, _SecondAlphaOn, _CustomDataOn;
                half _SrcBlend, _DstBlend, _Cull, _ZWrite;
            CBUFFER_END

            struct Attributes
            {
                float4 positionOS : POSITION;
                half4 color : COLOR;
                float4 texcoord0 : TEXCOORD0;   // uv.xy (+ Custom1.xy in zw with _CUSTOMDATA_ON)
                float4 texcoord1 : TEXCOORD1;   // Custom2.xy with _CUSTOMDATA_ON
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                half4 color : COLOR;
                float4 uv : TEXCOORD0;          // xy main (tiled, scrolled, offset), zw raw uv (linear fade)
                float2 uv2 : TEXCOORD1;         // second alpha
                half4 custom : TEXCOORD2;       // Custom1.x erosion, Custom1.y emission, Custom2.x offset, Custom2.y fade
                half fogFactor : TEXCOORD3;
            };

            Varyings vert(Attributes v)
            {
                Varyings o;
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.color = v.color;
            #if defined(_CUSTOMDATA_ON)
                half4 c = half4(v.texcoord0.zw, v.texcoord1.xy);
            #else
                half4 c = half4(0, 1, 0, 0);
            #endif
                o.custom = c;
                float2 offset = float2(c.z, c.z * 0.618);
                float2 raw = v.texcoord0.xy;
                float t = lerp(_Time.y, _AgentVfxTime.y, saturate(_AgentVfxTime.x));
                o.uv.xy = raw * _BaseMap_ST.xy + _BaseMap_ST.zw + _MainScroll.xy * t + offset;
                o.uv.zw = raw;
                o.uv2 = raw * _SecondAlphaTex_ST.xy + _SecondAlphaTex_ST.zw + _SecondScroll.xy * t + offset * 1.7;
                o.fogFactor = ComputeFogFactor(o.positionCS.z);
                return o;
            }

            half4 frag(Varyings i) : SV_Target
            {
                half4 tex = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, i.uv.xy);
                half gray = tex.r;
            #if defined(_RAMP_ON)
                half3 rgb = SAMPLE_TEXTURE2D(_RampTex, sampler_RampTex, float2(gray, 0.5)).rgb;
            #else
                half3 rgb = gray.xxx;
            #endif
            #if defined(_ALPHA_B)
                half alpha = tex.b;
            #else
                half alpha = gray;
            #endif
            #if defined(_SECONDALPHA_ON)
                alpha *= SAMPLE_TEXTURE2D(_SecondAlphaTex, sampler_SecondAlphaTex, i.uv2).r;
            #endif
            #if defined(_EROSION_ON)
                half black = saturate(_Erosion + i.custom.x);
                half white = min(1.0h, black + _ErosionWidth);
                alpha = saturate((alpha - black) / max(white - black, 1e-3h));
            #endif
            #if defined(_LINEARFADE_ON)
                float2 dir = normalize(_FadeParams.xy + float2(1e-5, 0));
                float along = dot(i.uv.zw - 0.5, dir) + 0.5;       // 0..1 across the mesh in the fade direction
                float pos = _FadeParams.z + i.custom.w;
                alpha *= saturate((along - pos) / max(_FadeParams.w, 1e-3));   // visible ahead of the fade front
            #endif
                half4 col;
                col.rgb = rgb * _BaseColor.rgb * i.color.rgb;
                col.a = saturate(alpha * _BaseColor.a * i.color.a);
            #if defined(_EMISSION_G)
                half e = tex.g * i.custom.y * i.color.a;
                col.rgb += e * _EmissionColor.rgb;
                col.a = max(col.a, saturate(e * _EmissionColor.a));
            #endif
                col.rgb = MixFog(col.rgb, i.fogFactor);
                return col;
            }
            ENDHLSL
        }
    }
    FallBack Off
}
