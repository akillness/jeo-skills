// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). Measurement driver for Play Mode counter
// runs: changes one TMP text every frame (the "ammo counter on a big canvas" case) and, when a
// HudView is assigned, one HUD model value every frame. Canvas rebuild scope is what the split
// canvas test measures (uGUI optimization tips, "Split up your Canvases"). Not for shipping UI.
using TMPro;
using UnityEngine;

namespace AgentUI
{
    public class UiPerfDriver : MonoBehaviour
    {
        public TMP_Text dynamicText;
        public HudView hud;
        public bool changeEveryFrame = true;
        int m_N;

        void Update()
        {
            if (!changeEveryFrame) return;
            m_N++;
            if (dynamicText != null) dynamicText.SetText("{0}", m_N % 1000);   // SetText(format, value): no string allocation
            if (hud != null) hud.Model.Ammo = m_N % 31;
        }
    }
}
