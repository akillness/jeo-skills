// AgentFullscreenFeature (scenario-unity-shaders skill v0.1, 2026-09-24). A Render Graph renderer feature for
// one-material full-screen effects in URP 17.3 (Unity 6000.3), written the way the 6.3 docs and
// Unity's own dither sample do it:
//   - gate in AddRenderPasses (no material, preview or reflection camera, strength 0): a pass that is not
//     enqueued costs nothing and does not force an intermediate texture (the 6.3 template warns that
//     requiresIntermediateTexture and ConfigureInput break TBDR render passes on mobile),
//   - RecordRenderGraph only declares; no commands, no allocations (the graph owns the textures),
//   - refuse the back buffer (After Rendering in 6.2+ always follows the final blit: use
//     AfterRenderingPostProcessing),
//   - ONE blit into a new texture, then resourceData.cameraColor = destination (no blit back),
//   - depth, normals or motion inputs: ConfigureInput(...) so URP produces them, and UseTexture(...) on the
//     builder that AddBlitPass returns in 6.3 (returnBuilder: true) so the graph knows the pass reads them.
// Runtime code: it must live OUTSIDE an Editor folder (the renderer asset references it in players).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-shaders/test_live_shaders.py (on/off captures,
// grayscale readback R == G == B).
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.RenderGraphModule.Util;
using UnityEngine.Rendering.Universal;

namespace AgentKit.Rendering
{
    public class AgentFullscreenFeature : ScriptableRendererFeature
    {
        [Tooltip("Serialized material: keeps the shader in builds (Shader.Find does not).")]
        public Material material;
        public int passIndex = 0;
        public RenderPassEvent injectionPoint = RenderPassEvent.AfterRenderingPostProcessing;
        [Tooltip("Camera textures the shader samples. Only request what it reads: each costs a pass or a copy.")]
        public ScriptableRenderPassInput requirements = ScriptableRenderPassInput.None;

        AgentFullscreenPass m_Pass;

        public override void Create()
        {
            // Create() reruns on every Inspector change: build the pass here, never in AddRenderPasses.
            m_Pass = new AgentFullscreenPass(string.IsNullOrEmpty(name) ? "AgentFullscreen" : name);
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            if (material == null || passIndex < 0 || passIndex >= material.passCount)
                return;
            var cameraType = renderingData.cameraData.cameraType;
            if (cameraType == CameraType.Preview || cameraType == CameraType.Reflection)
                return;
            if (material.HasProperty(AgentFullscreenPass.StrengthId) && material.GetFloat(AgentFullscreenPass.StrengthId) <= 0f)
                return;
            m_Pass.Setup(material, passIndex, injectionPoint, requirements);
            renderer.EnqueuePass(m_Pass);
        }
    }

    public class AgentFullscreenPass : ScriptableRenderPass
    {
        public static readonly int StrengthId = Shader.PropertyToID("_Strength");
        readonly string m_Name;
        Material m_Material;
        int m_PassIndex;
        ScriptableRenderPassInput m_Inputs;

        public AgentFullscreenPass(string name)
        {
            m_Name = name;
            profilingSampler = new ProfilingSampler(name);   // readable name in the Profiler and Render Graph Viewer
        }

        public void Setup(Material material, int passIndex, RenderPassEvent evt, ScriptableRenderPassInput inputs)
        {
            m_Material = material;
            m_PassIndex = passIndex;
            m_Inputs = inputs;
            renderPassEvent = evt;
            ConfigureInput(inputs);
            requiresIntermediateTexture = true;   // the effect samples the camera colour
        }

        public override void RecordRenderGraph(RenderGraph renderGraph, ContextContainer frameData)
        {
            var resourceData = frameData.Get<UniversalResourceData>();
            if (resourceData.isActiveTargetBackBuffer)
            {
                Debug.LogError($"{m_Name}: the active target is the back buffer, which cannot be sampled. " +
                               "Use RenderPassEvent.AfterRenderingPostProcessing or earlier.");
                return;
            }

            TextureHandle source = resourceData.activeColorTexture;
            TextureDesc desc = renderGraph.GetTextureDesc(source);   // graph-derived descriptor, change only what differs
            desc.name = "CameraColor-" + m_Name;
            desc.clearBuffer = false;                               // we overwrite every pixel
            TextureHandle destination = renderGraph.CreateTexture(desc);

            var blit = new RenderGraphUtils.BlitMaterialParameters(source, destination, m_Material, m_PassIndex);
            if (m_Inputs == ScriptableRenderPassInput.None)
            {
                renderGraph.AddBlitPass(blit, passName: m_Name);
            }
            else
            {
                using (var builder = renderGraph.AddBlitPass(blit, passName: m_Name, returnBuilder: true))
                {
                    if ((m_Inputs & ScriptableRenderPassInput.Depth) != 0 && resourceData.cameraDepthTexture.IsValid())
                        builder.UseTexture(resourceData.cameraDepthTexture);
                    if ((m_Inputs & ScriptableRenderPassInput.Normal) != 0 && resourceData.cameraNormalsTexture.IsValid())
                        builder.UseTexture(resourceData.cameraNormalsTexture);
                    if ((m_Inputs & ScriptableRenderPassInput.Motion) != 0 && resourceData.motionVectorColor.IsValid())
                        builder.UseTexture(resourceData.motionVectorColor);
                    if ((m_Inputs & ScriptableRenderPassInput.Color) != 0 && resourceData.cameraOpaqueTexture.IsValid())
                        builder.UseTexture(resourceData.cameraOpaqueTexture);
                }
            }

            resourceData.cameraColor = destination;   // later passes read our output: no blit back
        }
    }
}
