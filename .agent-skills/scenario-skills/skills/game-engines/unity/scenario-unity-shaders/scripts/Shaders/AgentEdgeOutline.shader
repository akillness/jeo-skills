// AgentKit/Fullscreen/EdgeOutline (scenario-unity-shaders skill v0.1, 2026-09-24): full-screen outline for a
// Render Graph blit (AgentFullscreenFeature or the Full Screen Pass Renderer Feature).
// Edges from depth AND normals (Roberts cross, 2x2, like Daniel Ilett 26gbtRTokVo [00:33:50]):
// depth and normal edges survive textured scenes, where colour edges turn noisy (VGEz8oKyMpY [00:02:09]).
// Needs ConfigureInput(Depth | Normal) on the pass, or Requirements Depth + Normal on the Full Screen
// Pass feature; test with SSAO OFF, because SSAO renders the normals texture anyway and hides a
// missing Normal requirement. Thresholds keep a floor above 0 (0 makes every pixel an edge).
Shader "AgentKit/Fullscreen/EdgeOutline"
{
    Properties
    {
        _OutlineColor ("Outline Color", Color) = (0.05, 0.04, 0.08, 1)
        _Thickness ("Thickness (pixels)", Range(0.5, 4)) = 1
        _DepthThreshold ("Depth Threshold (relative)", Range(0.001, 1)) = 0.08
        _NormalThreshold ("Normal Threshold", Range(0.01, 2)) = 0.4
        _Strength ("Strength", Range(0, 1)) = 1
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        ZWrite Off ZTest Always Cull Off

        Pass
        {
            Name "EdgeOutline"

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareNormalsTexture.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _OutlineColor;
                float _Thickness;
                float _DepthThreshold;
                float _NormalThreshold;
                half _Strength;
            CBUFFER_END

            float EyeDepth(float2 uv) { return LinearEyeDepth(SampleSceneDepth(uv), _ZBufferParams); }

            half4 Frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
                float2 uv = input.texcoord;
                half4 color = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_PointClamp, uv);
                float2 texel = _Thickness / _ScaledScreenParams.xy;   // pixel offsets that respect render scale

                float2 uvTR = uv + float2( texel.x,  texel.y), uvBL = uv + float2(-texel.x, -texel.y);
                float2 uvTL = uv + float2(-texel.x,  texel.y), uvBR = uv + float2( texel.x, -texel.y);

                float dTR = EyeDepth(uvTR), dBL = EyeDepth(uvBL), dTL = EyeDepth(uvTL), dBR = EyeDepth(uvBR);
                float dMin = min(min(dTR, dBL), min(dTL, dBR));
                float depthEdge = (abs(dTR - dBL) + abs(dTL - dBR)) / max(dMin, 1e-3);   // relative: same look near and far

                float3 nTR = SampleSceneNormals(uvTR), nBL = SampleSceneNormals(uvBL);
                float3 nTL = SampleSceneNormals(uvTL), nBR = SampleSceneNormals(uvBR);
                float normalEdge = length(nTR - nBL) + length(nTL - nBR);

                half edge = saturate(step(_DepthThreshold, depthEdge) + step(_NormalThreshold, normalEdge));
                // No outline on the sky: far plane on all four taps.
            #if UNITY_REVERSED_Z
                half sky = step(max(max(SampleSceneDepth(uvTR), SampleSceneDepth(uvBL)), max(SampleSceneDepth(uvTL), SampleSceneDepth(uvBR))), 0.0001);
            #else
                half sky = step(0.9999, min(min(SampleSceneDepth(uvTR), SampleSceneDepth(uvBL)), min(SampleSceneDepth(uvTL), SampleSceneDepth(uvBR))));
            #endif
                edge *= (1.0h - sky) * _Strength;
                return half4(lerp(color.rgb, _OutlineColor.rgb, edge * _OutlineColor.a), color.a);
            }
            ENDHLSL
        }
    }
}
