//UNITY_SHADER_NO_UPGRADE
// AgentCustomLighting.hlsl (scenario-unity-shaders skill v0.1, 2026-09-24): agent-owned HLSL for Shader Graph 17.3
// Custom Function nodes in File mode. Rules (Shader Graph manual; Daniel Ilett F8bAI6dIrto; MinionsArt
// FIP6I1x6lMA): one include guard per file, every entry point suffixed _float and _half, the node's Name
// field WITHOUT the suffix, inputs first then out parameters in the node's port order, and a
// SHADERGRAPH_PREVIEW branch (previews have no lights). Graph Settings for custom lighting in 6.3: Unlit
// target, Keep Lighting Variants ON (without it the shadow and light keywords are not compiled).
//
// AgentAdditionalLightsHalfLambert: drop-in for the node of Unity's Custom Lighting sample
// (Components/AdditionalLights/AdditionalLightsHalfLambert.shadersubgraph, same ports, same maths) that
// ALSO walks extra directional lights under Forward+: the sample's cluster loop skips them (observed in
// 6000.3.21f1). Repoint the node with ut_shaders.shadergraph_repoint_custom_function.
// AgentToonMainLight: MinionsArt's toon main light, updated for URP 17.3 (no SHADOWS_SCREEN, no
// ComputeScreenPos: TransformWorldToShadowCoord handles screen-space shadows itself).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_shaders.py stage graph.

#ifndef AGENT_CUSTOM_LIGHTING_INCLUDED
#define AGENT_CUSTOM_LIGHTING_INCLUDED

#ifndef SHADERGRAPH_PREVIEW
float3 AgentHalfLambertLight(Light light, float3 WorldPosition, float3 WorldNormal, float3 WorldView, float SpecPower,
                             float3 Reflectance, inout float Diffuse, inout float3 Specular)
{
    float NdotL = dot(WorldNormal, light.direction);
    float atten = light.distanceAttenuation * light.shadowAttenuation;
    float thisDiffuse = atten * (NdotL * 0.5 + 0.5);
    float3 halfAngle = normalize(light.direction + WorldView);
    float3 thisSpecular = pow(saturate(dot(halfAngle, WorldNormal)), SpecPower) * Reflectance * atten;
    Diffuse += thisDiffuse;
    Specular += thisSpecular;
    return light.color * (thisDiffuse + thisSpecular);
}
#endif

void AgentAdditionalLightsHalfLambert_float(float SpecPower, float3 WorldPosition, float3 WorldNormal, float3 WorldView,
                                            float MainDiffuse, float3 MainSpecular, float3 MainColor, float3 Reflectance,
                                            float2 ScreenPosition, out float Diffuse, out float3 Specular, out float3 Color)
{
    Diffuse = MainDiffuse;
    Specular = MainSpecular;
    Color = MainColor * (MainDiffuse + MainSpecular);
#ifndef SHADERGRAPH_PREVIEW
#if defined(_ADDITIONAL_LIGHTS) || defined(_CLUSTER_LIGHT_LOOP)
    uint pixelLightCount = GetAdditionalLightsCount();
    // LIGHT_LOOP_BEGIN reads a local named exactly inputData (positionWS, normalizedScreenSpaceUV).
    InputData inputData = (InputData)0;
    inputData.normalizedScreenSpaceUV = ScreenPosition;
    inputData.positionWS = WorldPosition;
#if USE_CLUSTER_LIGHT_LOOP
    // Forward+ / Deferred+: extra directional lights are not in the cluster loop below.
    [loop] for (uint dirIndex = 0; dirIndex < min(URP_FP_DIRECTIONAL_LIGHTS_COUNT, MAX_VISIBLE_LIGHTS); dirIndex++)
    {
        Light dirLight = GetAdditionalLight(dirIndex, WorldPosition);
        dirLight.shadowAttenuation = AdditionalLightRealtimeShadow(dirIndex, WorldPosition, dirLight.direction);
        Color += AgentHalfLambertLight(dirLight, WorldPosition, WorldNormal, WorldView, SpecPower, Reflectance, Diffuse, Specular);
    }
#endif
    LIGHT_LOOP_BEGIN(pixelLightCount)
        Light light = GetAdditionalLight(lightIndex, WorldPosition);
        light.shadowAttenuation = AdditionalLightRealtimeShadow(lightIndex, WorldPosition, light.direction);
    #if defined(_LIGHT_COOKIES)
        light.color *= SampleAdditionalLightCookie(lightIndex, WorldPosition);
    #endif
        Color += AgentHalfLambertLight(light, WorldPosition, WorldNormal, WorldView, SpecPower, Reflectance, Diffuse, Specular);
    LIGHT_LOOP_END
    float total = Diffuse + dot(Specular, float3(0.333, 0.333, 0.333));
    Color = total <= 0 ? MainColor : Color / total;
#endif
#endif
}

void AgentAdditionalLightsHalfLambert_half(half SpecPower, half3 WorldPosition, half3 WorldNormal, half3 WorldView,
                                           half MainDiffuse, half3 MainSpecular, half3 MainColor, half3 Reflectance,
                                           half2 ScreenPosition, out half Diffuse, out half3 Specular, out half3 Color)
{
    float d; float3 s; float3 c;
    AgentAdditionalLightsHalfLambert_float(SpecPower, WorldPosition, WorldNormal, WorldView, MainDiffuse, MainSpecular,
                                           MainColor, Reflectance, ScreenPosition, d, s, c);
    Diffuse = d; Specular = s; Color = c;
}

// Toon main light. Ports: Normal (Vector3, world), WorldPos (Vector3), RampSmoothness (Float), RampOffset (Float),
// ShadowTint (Vector3) -> ToonRamp (Vector3), Direction (Vector3). Smoothness is floored so smoothstep never divides by 0.
void AgentToonMainLight_float(float3 Normal, float3 WorldPos, float RampSmoothness, float RampOffset, float3 ShadowTint,
                              out float3 ToonRamp, out float3 Direction)
{
#ifdef SHADERGRAPH_PREVIEW
    ToonRamp = float3(0.5, 0.5, 0.5);
    Direction = float3(0.5, 0.5, 0);
#else
    Light light = GetMainLight(TransformWorldToShadowCoord(WorldPos));
    float halfLambert = dot(Normal, light.direction) * 0.5 + 0.5;
    float ramp = smoothstep(RampOffset, RampOffset + max(RampSmoothness, 1e-3), halfLambert) * light.shadowAttenuation;
    ToonRamp = light.color * lerp(ShadowTint, 1.0, ramp);
    Direction = light.direction;
#endif
}

void AgentToonMainLight_half(half3 Normal, half3 WorldPos, half RampSmoothness, half RampOffset, half3 ShadowTint,
                             out half3 ToonRamp, out half3 Direction)
{
    float3 r; float3 d;
    AgentToonMainLight_float(Normal, WorldPos, RampSmoothness, RampOffset, ShadowTint, r, d);
    ToonRamp = r; Direction = d;
}

#endif // AGENT_CUSTOM_LIGHTING_INCLUDED
