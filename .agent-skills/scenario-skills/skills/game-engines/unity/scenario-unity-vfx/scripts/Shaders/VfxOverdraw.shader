// AgentKit.Vfx v0.1 (scenario-unity-vfx, 2026-09-24). Overdraw counter: every rasterized fragment adds
// _Weight (1) to the red channel of a half-float target, so the red value of a pixel = number of
// transparent layers drawn there. Used by AgentKit.Vfx.VfxBudget with ParticleSystemRenderer.BakeMesh
// and a CommandBuffer (no render pipeline involved, so no tonemapping, no LDR clamp, no sRGB).
// Counts every fragment of each quad, including texels whose alpha is 0: that is the real fill cost
// (a tight mesh or an octagon cuts it, Orson Favrel uNz [00:16:54]). No depth test: conservative.
Shader "Hidden/AgentKit/VfxOverdraw"
{
    Properties
    {
        _Weight ("Weight per layer", Float) = 1
    }
    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Name "Overdraw"
            Blend One One
            ZWrite Off
            ZTest Always
            Cull Off
            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float _Weight;
            struct appdata { float4 vertex : POSITION; };
            struct v2f { float4 pos : SV_POSITION; };
            v2f vert (appdata v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); return o; }
            float4 frag (v2f i) : SV_Target { return float4(_Weight, 0, 0, 1); }
            ENDHLSL
        }
    }
}
