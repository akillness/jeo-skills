// AgentKit/Dissolve (scenario-unity-shaders skill v0.1, 2026-09-24): hand-written URP 17.3 lit dissolve, the
// text twin of Brackeys' Dissolve Shader Graph (taMp1g1pBeE) made production-safe:
//   field = object-space 3D noise (no UV seams), optionally blended with a bottom-to-top height ramp
//   clip(field - amount) runs in EVERY pass (forward, ShadowCaster, DepthOnly, DepthNormals) through
//   AGENT_CLIP, so the shadow and the depth texture dissolve with the mesh
//   edge = step(field, amount + _EdgeWidth): the emissive band is the clip test shifted by the edge
//   width (a band equal to the clip test is entirely clipped, Brackeys [00:05:31]); HDR colour above 1
//   plus Bloom makes it glow (intensity about 4, [00:07:11]); Cull Off shows the inside.
// amount = _Dissolve (per material instance) or, with _UseRendererValue, the per-renderer value from
// Renderer.SetShaderUserValue (6.3, unity_RendererUserValue in UnityPerDraw: many renderers share ONE
// material and stay SRP Batcher and GPU Resident Drawer friendly; MaterialPropertyBlock breaks the
// SRP Batcher). Encoding: low 16 bits = amount * 65535.
Shader "AgentKit/Dissolve"
{
    Properties
    {
        [MainTexture] _BaseMap ("Base Map", 2D) = "white" {}
        [MainColor] _BaseColor ("Base Color", Color) = (1, 1, 1, 1)
        _Metallic ("Metallic", Range(0, 1)) = 0
        _Smoothness ("Smoothness", Range(0, 1)) = 0.4
        _Dissolve ("Dissolve Amount", Range(0, 1)) = 0
        [Toggle] _UseRendererValue ("Amount From Renderer (SetShaderUserValue)", Float) = 0
        _NoiseScale ("Noise Scale (per object unit)", Float) = 4
        _DirectionWeight ("Height Ramp Weight", Range(0, 1)) = 0
        _HeightMin ("Height Min (object space)", Float) = -1
        _HeightMax ("Height Max (object space)", Float) = 1
        [HDR] _EdgeColor ("Edge Color (HDR)", Color) = (4, 1.3, 0.25, 1)
        _EdgeWidth ("Edge Width", Range(0.001, 0.2)) = 0.05
    }

    SubShader
    {
        Tags { "RenderType" = "TransparentCutout" "Queue" = "AlphaTest" "RenderPipeline" = "UniversalPipeline" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "AgentNoise.hlsl"
        TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            half4 _BaseColor;
            half _Metallic;
            half _Smoothness;
            half _Dissolve;
            half _UseRendererValue;
            float _NoiseScale;
            half _DirectionWeight;
            float _HeightMin;
            float _HeightMax;
            half4 _EdgeColor;
            half _EdgeWidth;
        CBUFFER_END

        float DissolveAmount()
        {
            float fromRenderer = (unity_RendererUserValue & 0xFFFFu) / 65535.0;
            return _UseRendererValue > 0.5 ? fromRenderer : _Dissolve;
        }

        float DissolveField(float3 positionOS)
        {
            float n = AgentFbm3D(positionOS * _NoiseScale);
            float h = saturate((positionOS.y - _HeightMin) / max(_HeightMax - _HeightMin, 1e-4));
            return saturate(lerp(n, h * 0.85 + n * 0.15, _DirectionWeight));
        }

        // One definition used by all passes (AgentPasses.hlsl reads this macro).
        #define AGENT_CLIP(uv, positionOS, positionWS) clip(DissolveField(positionOS) - DissolveAmount())
        ENDHLSL

        Pass
        {
            Name "DissolveForward"
            Tags { "LightMode" = "UniversalForward" }
            ZWrite On
            Cull Off

            HLSLPROGRAM
            #pragma target 2.0
            #pragma vertex DissolveVert
            #pragma fragment DissolveFrag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile_instancing
            #include_with_pragmas "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Fog.hlsl"

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
                float2 uv         : TEXCOORD0;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv         : TEXCOORD0;
                float3 positionWS : TEXCOORD1;
                float3 normalWS   : TEXCOORD2;
                float3 positionOS : TEXCOORD3;
                half   fogFactor  : TEXCOORD4;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings DissolveVert(Attributes input)
            {
                Varyings output = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                VertexPositionInputs pos = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = pos.positionCS;
                output.positionWS = pos.positionWS;
                output.positionOS = input.positionOS.xyz;
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                output.fogFactor = ComputeFogFactor(pos.positionCS.z);
                return output;
            }

            half4 DissolveFrag(Varyings input, bool isFrontFace : SV_IsFrontFace) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);

                float field = DissolveField(input.positionOS);
                float amount = DissolveAmount();
                clip(field - amount);
                half edge = step(field, amount + _EdgeWidth) * step(0.001, amount);   // no edge at amount 0

                half4 albedo = SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv) * _BaseColor;
                SurfaceData surface = (SurfaceData)0;
                surface.albedo = albedo.rgb;
                surface.alpha = 1;
                surface.metallic = _Metallic;
                surface.smoothness = _Smoothness;
                surface.occlusion = 1;
                surface.normalTS = half3(0, 0, 1);
                surface.emission = _EdgeColor.rgb * edge;

                float3 normalWS = NormalizeNormalPerPixel(input.normalWS);
                normalWS = isFrontFace ? normalWS : -normalWS;   // Cull Off: light the inside correctly

                InputData inputData = (InputData)0;
                inputData.positionWS = input.positionWS;
                inputData.positionCS = input.positionCS;
                inputData.normalWS = normalWS;
                inputData.viewDirectionWS = GetWorldSpaceNormalizeViewDir(input.positionWS);
                inputData.shadowCoord = TransformWorldToShadowCoord(input.positionWS);
                inputData.fogCoord = InitializeInputDataFog(float4(input.positionWS, 1.0), input.fogFactor);
                inputData.bakedGI = SampleSH(normalWS);
                inputData.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(input.positionCS);
                inputData.shadowMask = half4(1, 1, 1, 1);

                half4 color = UniversalFragmentPBR(inputData, surface);
                color.rgb = MixFog(color.rgb, inputData.fogCoord);
                return half4(color.rgb, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode" = "ShadowCaster" }
            ZWrite On
            ZTest LEqual
            ColorMask 0
            Cull Off

            HLSLPROGRAM
            #pragma target 2.0
            #pragma vertex AgentShadowVertex
            #pragma fragment AgentShadowFragment
            #pragma multi_compile_instancing
            #pragma multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW
            #include "AgentPasses.hlsl"
            ENDHLSL
        }

        Pass
        {
            Name "DepthOnly"
            Tags { "LightMode" = "DepthOnly" }
            ZWrite On
            ColorMask R
            Cull Off

            HLSLPROGRAM
            #pragma target 2.0
            #pragma vertex AgentDepthOnlyVertex
            #pragma fragment AgentDepthOnlyFragment
            #pragma multi_compile_instancing
            #include "AgentPasses.hlsl"
            ENDHLSL
        }

        Pass
        {
            Name "DepthNormals"
            Tags { "LightMode" = "DepthNormals" }
            ZWrite On
            Cull Off

            HLSLPROGRAM
            #pragma target 2.0
            #pragma vertex AgentDepthOnlyVertex
            #pragma fragment AgentDepthNormalsFragment
            #pragma multi_compile_instancing
            #include "AgentPasses.hlsl"
            ENDHLSL
        }
    }
    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
