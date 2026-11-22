// AgentKit/Toon (scenario-unity-shaders skill v0.1, 2026-09-24): hand-written URP 17.3 toon shading with
// custom lighting, the text twin of MinionsArt's Lit Toon Shader Graph (FIP6I1x6lMA) updated to 6.3.
//   ramp  = smoothstep(offset, offset + smoothness, halfLambert) * shadowAttenuation   (cast shadows join the band)
//   color = albedo * lightColor * lerp(shadowTint, 1, ramp) + ambient                   (tint is the shadow floor)
//   rim   = step(threshold, fresnel * N.L)                                              (rim only on the lit side)
// Additional lights under Forward+ need the 6.3 cluster loop: LIGHT_LOOP_BEGIN skips directional
// lights, so extra directional lights get their own pre-loop, as URP's Lighting.hlsl does; the macro
// needs a local variable named exactly `inputData` (installed RealtimeLights.hlsl lines 27 to 33).
Shader "AgentKit/Toon"
{
    Properties
    {
        [MainTexture] _BaseMap ("Base Map", 2D) = "white" {}
        [MainColor] _BaseColor ("Base Color", Color) = (1, 1, 1, 1)
        _ShadowTint ("Shadow Tint (floor)", Color) = (0.35, 0.38, 0.55, 1)
        _RampOffset ("Ramp Offset", Range(0, 1)) = 0.5
        _RampSmoothness ("Ramp Smoothness", Range(0.001, 0.5)) = 0.03
        _AmbientStrength ("Ambient Strength", Range(0, 1)) = 0.35
        [HDR] _SpecColor ("Specular Color", Color) = (1, 1, 1, 1)
        _SpecSize ("Specular Size", Range(0, 1)) = 0.12
        [HDR] _RimColor ("Rim Color", Color) = (1, 1, 1, 1)
        _RimPower ("Rim Power", Range(0.5, 12)) = 3
        _RimThreshold ("Rim Threshold", Range(0.01, 1)) = 0.35
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" "Queue" = "Geometry" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
        CBUFFER_START(UnityPerMaterial)
            float4 _BaseMap_ST;
            half4 _BaseColor;
            half4 _ShadowTint;
            half _RampOffset;
            half _RampSmoothness;
            half _AmbientStrength;
            half4 _SpecColor;
            half _SpecSize;
            half4 _RimColor;
            half _RimPower;
            half _RimThreshold;
        CBUFFER_END
        ENDHLSL

        Pass
        {
            Name "ToonForward"
            Tags { "LightMode" = "UniversalForward" }
            ZWrite On
            Cull Back

            HLSLPROGRAM
            #pragma target 2.0
            #pragma vertex ToonVert
            #pragma fragment ToonFrag

            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS            // no per-vertex variant: toon bands need per-pixel light
            #pragma multi_compile_fragment _ _ADDITIONAL_LIGHT_SHADOWS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
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
                half   fogFactor  : TEXCOORD3;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            Varyings ToonVert(Attributes input)
            {
                Varyings output = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                VertexPositionInputs pos = GetVertexPositionInputs(input.positionOS.xyz);
                output.positionCS = pos.positionCS;
                output.positionWS = pos.positionWS;
                output.normalWS = TransformObjectToWorldNormal(input.normalOS);
                output.uv = TRANSFORM_TEX(input.uv, _BaseMap);
                output.fogFactor = ComputeFogFactor(pos.positionCS.z);
                return output;
            }

            half ToonRamp(half ndl)
            {
                half halfLambert = ndl * 0.5h + 0.5h;
                return smoothstep(_RampOffset, _RampOffset + max(_RampSmoothness, 0.001h), halfLambert);
            }

            // One additional light: a hard band scaled by its (clamped) attenuation.
            half3 ToonAdditional(Light light, half3 normalWS)
            {
                half atten = saturate(light.distanceAttenuation * light.shadowAttenuation);
                return light.color * ToonRamp(dot(normalWS, light.direction)) * atten;
            }

            half4 ToonFrag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);

                half3 albedo = (SAMPLE_TEXTURE2D(_BaseMap, sampler_BaseMap, input.uv) * _BaseColor).rgb;

                // LIGHT_LOOP_BEGIN reads inputData.normalizedScreenSpaceUV and inputData.positionWS.
                InputData inputData = (InputData)0;
                inputData.positionWS = input.positionWS;
                inputData.normalWS = NormalizeNormalPerPixel(input.normalWS);
                inputData.viewDirectionWS = GetWorldSpaceNormalizeViewDir(input.positionWS);
                inputData.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(input.positionCS);
                inputData.shadowMask = half4(1, 1, 1, 1);
                half3 N = inputData.normalWS;
                half3 V = inputData.viewDirectionWS;

                // Main light: toon band times the shadow term.
                Light mainLight = GetMainLight(TransformWorldToShadowCoord(input.positionWS), input.positionWS, inputData.shadowMask);
                half ndl = dot(N, mainLight.direction);
                half ramp = ToonRamp(ndl) * mainLight.shadowAttenuation;
                half3 lightColor = mainLight.color * mainLight.distanceAttenuation;
                half3 color = albedo * lightColor * lerp(_ShadowTint.rgb, 1.0h, ramp);

                // Stylised specular dot and lit-side rim (Fresnel x N.L, then a step).
                half3 H = SafeNormalize(mainLight.direction + V);
                half spec = step(1.0h - _SpecSize * 0.1h, dot(N, H)) * ramp;
                half fresnel = pow(1.0h - saturate(dot(N, V)), _RimPower);
                half rim = step(_RimThreshold, fresnel * saturate(ndl)) * ramp;
                color += spec * _SpecColor.rgb * lightColor + rim * _RimColor.rgb * lightColor;

                // Ambient once (indirect light), never per light.
                color += albedo * SampleSH(N) * _AmbientStrength;

            #if defined(_ADDITIONAL_LIGHTS)
                half3 additional = 0;
                uint lightCount = GetAdditionalLightsCount();
                #if USE_CLUSTER_LIGHT_LOOP
                // Forward+: extra directional lights are NOT in the cluster loop below.
                [loop] for (uint dirIndex = 0; dirIndex < min(URP_FP_DIRECTIONAL_LIGHTS_COUNT, MAX_VISIBLE_LIGHTS); dirIndex++)
                {
                    additional += ToonAdditional(GetAdditionalLight(dirIndex, inputData.positionWS, inputData.shadowMask), N);
                }
                #endif
                LIGHT_LOOP_BEGIN(lightCount)
                    additional += ToonAdditional(GetAdditionalLight(lightIndex, inputData.positionWS, inputData.shadowMask), N);
                LIGHT_LOOP_END
                color += albedo * additional;
            #endif

                color = MixFog(color, InitializeInputDataFog(float4(input.positionWS, 1.0), input.fogFactor));
                return half4(color, 1);
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
            Cull Back

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
            Cull Back

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
            Cull Back

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
