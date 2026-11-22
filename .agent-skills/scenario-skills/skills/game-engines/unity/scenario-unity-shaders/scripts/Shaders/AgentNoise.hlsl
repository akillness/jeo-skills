// AgentNoise.hlsl (scenario-unity-shaders skill v0.1, 2026-09-24). Noise that matches Shader Graph 17.3.
// Port the graph's own node code instead of improvising a noise (visual notes on gRq-IdShxpU and
// taMp1g1pBeE): AgentGradientNoise2D = Gradient Noise node (Deterministic hash), AgentSimpleNoise2D =
// Simple Noise node (3 octaves of value noise). AgentValueNoise3D is object- or world-space noise:
// no UV seams or stretching on a dissolving mesh [added].
// Uses Core RP Hashes.hlsl (Hash_Tchou_*), the same hashes Shader Graph generates.

#ifndef AGENT_NOISE_INCLUDED
#define AGENT_NOISE_INCLUDED

#include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Hashes.hlsl"

float2 AgentGradientDir(float2 p)
{
    float x; Hash_Tchou_2_1_float(p, x);
    return normalize(float2(x - floor(x + 0.5), abs(x) - 0.5));
}

// Shader Graph "Gradient Noise" (Deterministic): output about 0..1, centred on 0.5.
float AgentGradientNoise2D(float2 uv, float scale)
{
    float2 p = uv * scale;
    float2 ip = floor(p);
    float2 fp = frac(p);
    float d00 = dot(AgentGradientDir(ip), fp);
    float d01 = dot(AgentGradientDir(ip + float2(0, 1)), fp - float2(0, 1));
    float d10 = dot(AgentGradientDir(ip + float2(1, 0)), fp - float2(1, 0));
    float d11 = dot(AgentGradientDir(ip + float2(1, 1)), fp - float2(1, 1));
    fp = fp * fp * fp * (fp * (fp * 6 - 15) + 10);
    return lerp(lerp(d00, d01, fp.y), lerp(d10, d11, fp.y), fp.x) + 0.5;
}

float AgentValueNoise2D(float2 uv)
{
    float2 i = floor(uv);
    float2 f = frac(uv);
    f = f * f * (3.0 - 2.0 * f);
    float r0, r1, r2, r3;
    Hash_Tchou_2_1_float(i, r0);
    Hash_Tchou_2_1_float(i + float2(1, 0), r1);
    Hash_Tchou_2_1_float(i + float2(0, 1), r2);
    Hash_Tchou_2_1_float(i + float2(1, 1), r3);
    return lerp(lerp(r0, r1, f.x), lerp(r2, r3, f.x), f.y);
}

// Shader Graph "Simple Noise": three octaves, amplitudes 0.125, 0.25, 0.5 (sum 0.875).
float AgentSimpleNoise2D(float2 uv, float scale)
{
    float o = 0;
    [unroll] for (int octave = 0; octave < 3; octave++)
    {
        float freq = pow(2.0, float(octave));
        float amp = pow(0.5, float(3 - octave));
        o += AgentValueNoise2D(uv * (scale / freq)) * amp;
    }
    return o;
}

float AgentValueNoise3D(float3 p)
{
    float3 i = floor(p);
    float3 f = frac(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000, n100, n010, n110, n001, n101, n011, n111;
    Hash_Tchou_3_1_float(i, n000);
    Hash_Tchou_3_1_float(i + float3(1, 0, 0), n100);
    Hash_Tchou_3_1_float(i + float3(0, 1, 0), n010);
    Hash_Tchou_3_1_float(i + float3(1, 1, 0), n110);
    Hash_Tchou_3_1_float(i + float3(0, 0, 1), n001);
    Hash_Tchou_3_1_float(i + float3(1, 0, 1), n101);
    Hash_Tchou_3_1_float(i + float3(0, 1, 1), n011);
    Hash_Tchou_3_1_float(i + float3(1, 1, 1), n111);
    float x00 = lerp(n000, n100, f.x), x10 = lerp(n010, n110, f.x);
    float x01 = lerp(n001, n101, f.x), x11 = lerp(n011, n111, f.x);
    return lerp(lerp(x00, x10, f.y), lerp(x01, x11, f.y), f.z);
}

// Two-octave 3D value noise, 0..1.
float AgentFbm3D(float3 p)
{
    return AgentValueNoise3D(p) * 0.6667 + AgentValueNoise3D(p * 2.03 + 17.1) * 0.3333;
}

#endif // AGENT_NOISE_INCLUDED
