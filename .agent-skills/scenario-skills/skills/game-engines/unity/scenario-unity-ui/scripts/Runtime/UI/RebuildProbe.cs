// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). Measurement instrument: a plain quad
// Graphic that counts how often uGUI regenerates its mesh (OnPopulateMesh). A test fills a canvas
// with probes and toggles it: SetActive(false/true) regenerates every probe (OnEnable -> SetAllDirty),
// Canvas.enabled = false/true regenerates none (uGUI optimization tips, "How to hide a Canvas";
// measured in references/procedures.md P10). Not for shipping UI.
// Trap (observed 2026-09-24): Graphic itself does not require a CanvasRenderer (Image, RawImage and
// TextMeshProUGUI declare it); a custom Graphic without [RequireComponent(typeof(CanvasRenderer))]
// added by AddComponent draws nothing and never rebuilds, silently (Rebuild returns when
// canvasRenderer is null).
using UnityEngine;
using UnityEngine.UI;

namespace AgentUI
{
    [RequireComponent(typeof(CanvasRenderer))]
    public class RebuildProbe : MaskableGraphic
    {
        public static int Populations;
        public static void ResetCount() { Populations = 0; }

        protected override void OnPopulateMesh(VertexHelper vh)
        {
            Populations++;
            base.OnPopulateMesh(vh);
        }
    }
}
