// AgentKit/Fullscreen/Grayscale (scenario-unity-shaders skill v0.1, 2026-09-24): the numeric test effect for
// any full-screen pass. Rec. 709 luminance on the linear camera colour (6.3 Manual low-code
// post-processing example: 0.2126, 0.7152, 0.0722). At _Strength 1 every pixel has R == G == B, so a
// readback proves the pass ran; at 0 the frame is unchanged.
Shader "AgentKit/Fullscreen/Grayscale"
{
    Properties
    {
        _Strength ("Strength", Range(0, 1)) = 1
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        ZWrite Off ZTest Always Cull Off

        Pass
        {
            Name "Grayscale"

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half _Strength;
            CBUFFER_END

            half4 Frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
                half4 color = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_PointClamp, input.texcoord);
                half luma = dot(color.rgb, half3(0.2126h, 0.7152h, 0.0722h));
                return half4(lerp(color.rgb, luma.xxx, _Strength), color.a);
            }
            ENDHLSL
        }
    }
}
