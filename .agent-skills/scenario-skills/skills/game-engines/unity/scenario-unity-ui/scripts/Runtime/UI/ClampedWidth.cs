// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). A column or panel that fills its parent
// minus margins but never grows past maxWidth (uGUI has no max-width). It writes the size only when
// the parent width changed, the "custom layout code run on demand" the uGUI optimization tips
// recommend over nested layout groups. Horizontal only; the height comes from the anchors or from a
// ContentSizeFitter on this object (top of its layout hierarchy, never under a layout group:
// Christina, HTQV4mukZ2M [00:36:30]).
using UnityEngine;
using UnityEngine.EventSystems;

namespace AgentUI
{
    [ExecuteAlways, RequireComponent(typeof(RectTransform))]
    public class ClampedWidth : UIBehaviour
    {
        [SerializeField] float maxWidth = 1200f;
        [SerializeField] float margin = 32f;
        float m_LastParentWidth = -1f;

        public float MaxWidth { get => maxWidth; set { maxWidth = value; Apply(); } }
        public float Margin { get => margin; set { margin = value; Apply(); } }

        protected override void OnEnable() { base.OnEnable(); Apply(); }
        protected override void OnTransformParentChanged() { base.OnTransformParentChanged(); Apply(); }

        void LateUpdate()
        {
            var parent = transform.parent as RectTransform;
            if (parent != null && !Mathf.Approximately(parent.rect.width, m_LastParentWidth)) Apply();
        }

        public void Apply()
        {
            var rt = (RectTransform)transform;
            var parent = rt.parent as RectTransform;
            if (parent == null) return;
            m_LastParentWidth = parent.rect.width;
            float w = Mathf.Min(maxWidth, Mathf.Max(0f, parent.rect.width - 2f * margin));
            rt.anchorMin = new Vector2(0.5f, rt.anchorMin.y);
            rt.anchorMax = new Vector2(0.5f, rt.anchorMax.y);
            if (!Mathf.Approximately(rt.rect.width, w)) rt.SetSizeWithCurrentAnchors(RectTransform.Axis.Horizontal, w);
        }
    }
}
