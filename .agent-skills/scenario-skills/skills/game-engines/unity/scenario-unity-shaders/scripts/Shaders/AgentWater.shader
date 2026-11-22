// AgentKit/StylizedWater (scenario-unity-shaders skill v0.1, 2026-09-24): hand-written URP 17.3 transparent
// water, the text twin of Unity's URP Water Shader Graph (gRq-IdShxpU) with its beginner shortcuts
// fixed. One 0..1 depth mask drives colour, alpha and normal strength at the shore:
//   waterDepth = sceneEyeDepth - surfaceEyeDepth (metres along the view ray), g = saturate(waterDepth / _DepthDistance)
// Needs the camera Depth Texture on EVERY URP asset that renders it (URP asset > Depth Texture).
// Fixes versus the tutorial [added]: waves are ADDED to Y with an analytic normal (not a replaced Y),
// two scrolled normal samples are blended with RNM (not added), UVs come from world XZ so tiles stay
// continuous, time is _Time.y * _TimeScale + _TimeOffset so captures are deterministic
// (_TimeScale = 0 freezes it). Transparent: no ShadowCaster, renderer Cast Shadows Off.
// Perspective cameras only (orthographic eye depth is linear in raw depth).
Shader "AgentKit/StylizedWater"
{
    Properties
    {
        _ShallowColor ("Shallow Color", Color) = (0.20, 0.80, 0.80, 0.30)
        _DeepColor ("Deep Color", Color) = (0.02, 0.16, 0.34, 0.92)
        _DepthDistance ("Depth Distance (m)", Float) = 2.0
        _FoamColor ("Foam Color", Color) = (1, 1, 1, 1)
        _FoamDistance ("Foam Distance (m)", Float) = 0.35
        _FoamNoiseScale ("Foam Noise Scale", Float) = 6
        [Normal][NoScaleOffset] _NormalMap ("Normal Map", 2D) = "bump" {}
        _NormalTiling ("Normal Tiling (per m)", Float) = 0.35
        _NormalStrength ("Normal Strength", Range(0, 1)) = 0.6
        _ScrollA ("Scroll A (m/s, xy)", Vector) = (0.035, 0.02, 0, 0)
        _ScrollB ("Scroll B (m/s, xy)", Vector) = (-0.02, 0.03, 0, 0)
        _Smoothness ("Smoothness", Range(0, 1)) = 0.9
        _WaveAmplitude ("Wave Amplitude (m)", Float) = 0.06
        _WaveLength ("Wave Length (m)", Float) = 5
        _WaveSpeed ("Wave Speed (m/s)", Float) = 1.2
        _TimeScale ("Time Scale (0 = frozen)", Float) = 1
        _TimeOffset ("Time Offset (s)", Float) = 0
    }

    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent" "RenderPipeline" = "UniversalPipeline" "IgnoreProjector" = "True" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        TEXTURE2D(_NormalMap); SAMPLER(sampler_NormalMap);
        CBUFFER_START(UnityPerMaterial)
            half4 _ShallowColor;
            half4 _DeepColor;
            float _DepthDistance;
            half4 _FoamColor;
            float _FoamDistance;
            float _FoamNoiseScale;
            float _NormalTiling;
            half _NormalStrength;
            float4 _ScrollA;
            float4 _ScrollB;
            half _Smoothness;
            float _WaveAmplitude;
            float _WaveLength;
            float _WaveSpeed;
            float _TimeScale;
            float _TimeOffset;
        CBUFFER_END
        ENDHLSL

        Pass
        {
            Name "WaterForward"
            Tags { "LightMode" = "UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha   // traditional alpha blend
            ZWrite Off                        // transparent = ZWrite Off AND the Transparent queue (Freya Holmer, kfM-yu0iQBk [02:44:37])
            Cull Back

            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex WaterVert
            #pragma fragment WaterFrag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_instancing
            #include_with_pragmas "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Fog.hlsl"

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
            #include "AgentNoise.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 positionWS : TEXCOORD0;
                float3 normalWS   : TEXCOORD1;
                float  eyeDepth   : TEXCOORD2;
                half   fogFactor  : TEXCOORD3;
                UNITY_VERTEX_INPUT_INSTANCE_ID
                UNITY_VERTEX_OUTPUT_STEREO
            };

            float WaterTime() { return _Time.y * _TimeScale + _TimeOffset; }

            // Two crossing sine waves in world XZ; returns height and writes the analytic normal.
            float WaveHeight(float2 xz, float t, out float3 normalWS)
            {
                float k = TWO_PI / max(_WaveLength, 0.01);
                float2 d1 = float2(0.8, 0.6), d2 = float2(-0.45, 0.89);
                float p1 = k * dot(d1, xz) + k * _WaveSpeed * t;
                float p2 = 1.7 * k * dot(d2, xz) + 1.3 * k * _WaveSpeed * t;
                float h = _WaveAmplitude * (sin(p1) + 0.5 * sin(p2));
                float2 dh = _WaveAmplitude * (k * cos(p1) * d1 + 0.5 * 1.7 * k * cos(p2) * d2);
                normalWS = normalize(float3(-dh.x, 1.0, -dh.y));
                return h;
            }

            Varyings WaterVert(Attributes input)
            {
                Varyings output = (Varyings)0;
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_TRANSFER_INSTANCE_ID(input, output);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
                float3 positionWS = TransformObjectToWorld(input.positionOS.xyz);
                float3 waveNormal;
                positionWS.y += WaveHeight(positionWS.xz, WaterTime(), waveNormal);   // added, not replaced
                output.positionWS = positionWS;
                output.normalWS = waveNormal;
                output.positionCS = TransformWorldToHClip(positionWS);
                output.eyeDepth = -TransformWorldToView(positionWS).z;
                output.fogFactor = ComputeFogFactor(output.positionCS.z);
                return output;
            }

            half4 WaterFrag(Varyings input) : SV_Target
            {
                UNITY_SETUP_INSTANCE_ID(input);
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
                float t = WaterTime();

                // Depth fade. Screen UV from _ScaledScreenParams (dynamic resolution safe, 6.3 Manual).
                float2 screenUV = input.positionCS.xy / _ScaledScreenParams.xy;
                float sceneEye = LinearEyeDepth(SampleSceneDepth(screenUV), _ZBufferParams);
                float waterDepth = max(sceneEye - input.eyeDepth, 0.0);
                half g = saturate(waterDepth / max(_DepthDistance, 0.001));
                half4 water = lerp(_ShallowColor, _DeepColor, g);

                // Detail normals: one map, two scroll directions and scales, RNM blend, calm at the shore.
                float2 uv = input.positionWS.xz * _NormalTiling;
                half3 n1 = UnpackNormal(SAMPLE_TEXTURE2D(_NormalMap, sampler_NormalMap, uv + _ScrollA.xy * t));
                half3 n2 = UnpackNormal(SAMPLE_TEXTURE2D(_NormalMap, sampler_NormalMap, uv * 1.37 + _ScrollB.xy * t));
                half3 nTS = BlendNormalRNM(n1, n2);
                nTS.xy *= _NormalStrength * saturate(g * 2.0);
                half3 N = normalize(input.normalWS + half3(nTS.x, 0, nTS.y));

                // Shore foam: a noise-broken band where the water is shallower than _FoamDistance.
                half shore = 1.0h - saturate(waterDepth / max(_FoamDistance, 0.001));
                half foamNoise = AgentGradientNoise2D(input.positionWS.xz + float2(t * 0.05, t * 0.03), _FoamNoiseScale);
                half foam = step(foamNoise, shore);

                // Lighting: main light (with shadows), sky from the ambient probe, Blinn specular, Schlick-style fresnel.
                Light mainLight = GetMainLight(TransformWorldToShadowCoord(input.positionWS));
                half3 V = GetWorldSpaceNormalizeViewDir(input.positionWS);
                half3 H = SafeNormalize(mainLight.direction + V);
                half ndl = saturate(dot(N, mainLight.direction));
                half shadow = mainLight.shadowAttenuation;
                half3 ambient = SampleSH(N);
                half3 color = water.rgb * (ambient + mainLight.color * (0.4h + 0.6h * ndl) * shadow);
                half specPower = exp2(10.0h * _Smoothness + 1.0h);
                color += mainLight.color * shadow * pow(saturate(dot(N, H)), specPower) * _Smoothness * 2.0h;
                half fresnel = pow(1.0h - saturate(dot(N, V)), 5.0h);
                color += ambient * fresnel * 0.6h;
                half alpha = saturate(water.a + fresnel * 0.4h);

                color = lerp(color, _FoamColor.rgb * (ambient + mainLight.color * shadow), foam * _FoamColor.a);
                alpha = max(alpha, foam * _FoamColor.a);
                color = MixFog(color, InitializeInputDataFog(float4(input.positionWS, 1.0), input.fogFactor));
                return half4(color, alpha);
            }
            ENDHLSL
        }
    }
    FallBack "Hidden/Universal Render Pipeline/FallbackError"
}
