// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24) [added]. uGUI's ScrollRect does not follow
// the EventSystem selection: a keyboard or gamepad player who navigates below the viewport selects
// an item they cannot see. This component, on the ScrollRect, scrolls just enough to reveal the
// selected descendant (vertical lists). It reads the selection once per frame and writes the scroll
// position only when the selection is outside the viewport.
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace AgentUI
{
    [RequireComponent(typeof(ScrollRect))]
    public class ScrollToSelection : MonoBehaviour
    {
        [SerializeField] float padding = 16f;
        ScrollRect m_Scroll;
        GameObject m_Last;

        void Awake() { m_Scroll = GetComponent<ScrollRect>(); }

        void LateUpdate()
        {
            var es = EventSystem.current;
            var sel = es != null ? es.currentSelectedGameObject : null;
            if (sel == null || sel == m_Last) return;
            m_Last = sel;
            if (m_Scroll.content == null || !sel.transform.IsChildOf(m_Scroll.content)) return;
            Reveal((RectTransform)sel.transform);
        }

        public void Reveal(RectTransform item)
        {
            var viewport = m_Scroll.viewport != null ? m_Scroll.viewport : (RectTransform)m_Scroll.transform;
            var content = m_Scroll.content;
            float overflow = content.rect.height - viewport.rect.height;
            if (overflow <= 0f) return;
            var corners = new Vector3[4];
            item.GetWorldCorners(corners);
            float top = viewport.InverseTransformPoint(corners[1]).y, bottom = viewport.InverseTransformPoint(corners[0]).y;
            float vTop = viewport.rect.yMax - padding, vBottom = viewport.rect.yMin + padding;
            float delta = 0f;
            if (top > vTop) delta = top - vTop;            // above the viewport: move content down
            else if (bottom < vBottom) delta = bottom - vBottom; // below: move content up
            if (Mathf.Approximately(delta, 0f)) return;
            m_Scroll.verticalNormalizedPosition = Mathf.Clamp01(m_Scroll.verticalNormalizedPosition + delta / overflow);
        }
    }
}
