// AgentPasses.hlsl (scenario-unity-shaders skill v0.1, 2026-09-24). Shared ShadowCaster, DepthOnly and
// DepthNormals passes for hand-written URP 17.3 shaders (Unity 6000.3).
//
// Why: every pass of one shader must produce the same fragments in the same positions (6.3 Manual,
// depth-only page), so vertex displacement and clip() must run in ShadowCaster, DepthOnly and
// DepthNormals too (Daniel Ilett, bH--RU6qyTw [00:37:52]). Writing them once here keeps them in sync.
//
// Contract. Before including this file the shader:
//   1. includes URP Core.hlsl and declares its CBUFFER_START(UnityPerMaterial) (identical in every
//      pass: put it in the SubShader's HLSLINCLUDE),
//   2. optionally #defines AGENT_DISPLACE(positionOS, normalOS, uv) as a statement that edits the
//      float3 positionOS / normalOS in place, and AGENT_CLIP(uv, positionOS, positionWS) as a
//      statement that calls clip(). Both default to nothing.
// Then a pass selects its functions with #pragma vertex/fragment:
//   ShadowCaster : AgentShadowVertex / AgentShadowFragment  (+ multi_compile_vertex _ _CASTING_PUNCTUAL_LIGHT_SHADOW)
//   DepthOnly    : AgentDepthOnlyVertex / AgentDepthOnlyFragment  (ColorMask R, like URP Lit)
//   DepthNormals : AgentDepthOnlyVertex / AgentDepthNormalsFragment
// DepthNormals writes the RAW world normal (URP's _CameraNormalsTexture is signed, and
// SampleSceneNormals does not decode). The 6.3 Manual example returns normal * 0.5 + 0.5, which
// SSAO and normal-based outlines then read as a different normal (verified in URP 17.3 source).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/ (all shaders built on it compile
// with zero errors and cast, receive and clip shadows).

#ifndef AGENT_URP_PASSES_INCLUDED
#define AGENT_URP_PASSES_INCLUDED

#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
#include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Shadows.hlsl"

#ifndef AGENT_DISPLACE
#define AGENT_DISPLACE(positionOS, normalOS, uv)
#endif
#ifndef AGENT_CLIP
#define AGENT_CLIP(uv, positionOS, positionWS)
#endif

// Set by URP (ShadowUtils.SetupShadowCasterConstantBuffer), never material properties: outside the CBUFFER.
float3 _LightDirection;
float3 _LightPosition;

struct AgentDepthAttributes
{
    float4 positionOS : POSITION;
    float3 normalOS   : NORMAL;
    float2 uv         : TEXCOORD0;
    UNITY_VERTEX_INPUT_INSTANCE_ID
};

struct AgentDepthVaryings
{
    float4 positionCS : SV_POSITION;
    float2 uv         : TEXCOORD0;
    float3 positionOS : TEXCOORD1;
    float3 positionWS : TEXCOORD2;
    float3 normalWS   : TEXCOORD3;
    UNITY_VERTEX_INPUT_INSTANCE_ID
    UNITY_VERTEX_OUTPUT_STEREO
};

AgentDepthVaryings AgentDepthCommon(AgentDepthAttributes input, out float3 positionWS, out float3 normalWS)
{
    AgentDepthVaryings output = (AgentDepthVaryings)0;
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_TRANSFER_INSTANCE_ID(input, output);
    UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
    float3 positionOS = input.positionOS.xyz;
    float3 normalOS = input.normalOS;
    float2 uv = input.uv;
    AGENT_DISPLACE(positionOS, normalOS, uv);
    positionWS = TransformObjectToWorld(positionOS);
    normalWS = TransformObjectToWorldNormal(normalOS);
    output.uv = uv;
    output.positionOS = positionOS;
    output.positionWS = positionWS;
    output.normalWS = normalWS;
    return output;
}

AgentDepthVaryings AgentShadowVertex(AgentDepthAttributes input)
{
    float3 positionWS, normalWS;
    AgentDepthVaryings output = AgentDepthCommon(input, positionWS, normalWS);
#if _CASTING_PUNCTUAL_LIGHT_SHADOW
    float3 lightDirectionWS = normalize(_LightPosition - positionWS);
#else
    float3 lightDirectionWS = _LightDirection;
#endif
    // ApplyShadowBias pushes the caster along its normal (no acne); clamping keeps it in the map.
    float4 positionCS = TransformWorldToHClip(ApplyShadowBias(positionWS, normalWS, lightDirectionWS));
    output.positionCS = ApplyShadowClamping(positionCS);
    return output;
}

half4 AgentShadowFragment(AgentDepthVaryings input) : SV_TARGET
{
    UNITY_SETUP_INSTANCE_ID(input);
    AGENT_CLIP(input.uv, input.positionOS, input.positionWS);
    return 0;
}

AgentDepthVaryings AgentDepthOnlyVertex(AgentDepthAttributes input)
{
    float3 positionWS, normalWS;
    AgentDepthVaryings output = AgentDepthCommon(input, positionWS, normalWS);
    output.positionCS = TransformWorldToHClip(positionWS);
    return output;
}

half AgentDepthOnlyFragment(AgentDepthVaryings input) : SV_TARGET
{
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
    AGENT_CLIP(input.uv, input.positionOS, input.positionWS);
    return input.positionCS.z;
}

half4 AgentDepthNormalsFragment(AgentDepthVaryings input, bool isFrontFace : SV_IsFrontFace) : SV_TARGET
{
    UNITY_SETUP_INSTANCE_ID(input);
    UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
    AGENT_CLIP(input.uv, input.positionOS, input.positionWS);
    float3 normalWS = NormalizeNormalPerPixel(input.normalWS);
    normalWS = isFrontFace ? normalWS : -normalWS;   // double-sided (Cull Off) shaders
#if defined(_GBUFFER_NORMALS_OCT)
    float2 octNormalWS = PackNormalOctQuadEncode(normalWS);
    float2 remapped = saturate(octNormalWS * 0.5 + 0.5);
    return half4(PackFloat2To888(remapped), 0.0);
#else
    return half4(normalWS, 0.0);
#endif
}

#endif // AGENT_URP_PASSES_INCLUDED
