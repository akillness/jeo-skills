// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). One reference resolution for every
// device, plus a handheld multiplier.
// Why: Canvas Scaler "Scale With Screen Size" at 1920 x 1080 with Match 0.5 keeps the layout the
// same shape in portrait and landscape (the log-space blend gives exactly 1.0 for a swapped aspect:
// uGUI multi-resolution manual; CanvasScaler.HandleScaleWithScreenSize source), but a 1080 x 1920
// phone then shows reference pixels at 1:1 on a screen about 2.5x denser than a laptop, so a
// 88 px control is under 6 mm. On handhelds this component divides the reference resolution by
// `handheldMultiplier`, which scales the whole canvas up [added: the value comes from the capture
// job's touch-target check at the device DPI, not from a source].
// forceHandheld lets a capture job preview the phone layout in the Editor.
using UnityEngine;
using UnityEngine.UI;

namespace AgentUI
{
    [ExecuteAlways, RequireComponent(typeof(CanvasScaler))]
    public class CanvasDeviceScale : MonoBehaviour
    {
        [SerializeField] Vector2 referenceResolution = new Vector2(1920, 1080);
        [SerializeField, Range(1f, 2f)] float handheldMultiplier = 1.35f;
        [SerializeField] bool forceHandheld;

        public bool ForceHandheld { get => forceHandheld; set { forceHandheld = value; Apply(); } }
        public float HandheldMultiplier { get => handheldMultiplier; set { handheldMultiplier = value; Apply(); } }
        public Vector2 ReferenceResolution { get => referenceResolution; set { referenceResolution = value; Apply(); } }

        public static bool IsHandheld => SystemInfo.deviceType == DeviceType.Handheld;

        void OnEnable() { Apply(); }

        public void Apply()
        {
            var s = GetComponent<CanvasScaler>();
            if (s == null) return;
            float k = (forceHandheld || IsHandheld) ? handheldMultiplier : 1f;
            s.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            s.referenceResolution = referenceResolution / k;
        }
    }
}
