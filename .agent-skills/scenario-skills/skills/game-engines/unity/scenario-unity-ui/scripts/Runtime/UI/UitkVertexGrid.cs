// scenario-unity-ui runtime (Unity Expert Skills v0.2, 2026-09-24). Measurement driver: fills its UIDocument with
// N plain coloured elements (one quad each, no texture: only the vertex buffer can split the batch),
// stepping through `steps` every `framesPerStep` frames and publishing N in UiCounterSampler.Tag.
// Used to measure Borromeo's rule "a static panel that needs two draw calls spilled into a second
// vertex buffer: raise Panel Settings > Vertex Budget" (bECmaYIvZJg [00:08:08], [00:09:13]), by running
// the same scene with vertexBudget 0 (automatic) and a raised value. Not for shipping UI.
using UnityEngine;
using UnityEngine.UIElements;

namespace AgentUI
{
    [RequireComponent(typeof(UIDocument))]
    public class UitkVertexGrid : MonoBehaviour
    {
        public int[] steps = { 250, 1000, 2000, 4000, 8000, 12000 };
        public int framesPerStep = 30;
        VisualElement m_Grid;
        int m_Frame, m_Step = -1;

        void OnEnable()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;
            m_Grid = new VisualElement { name = "vertex-grid", pickingMode = PickingMode.Ignore };
            m_Grid.style.flexDirection = FlexDirection.Row;
            m_Grid.style.flexWrap = Wrap.Wrap;
            m_Grid.style.position = Position.Absolute;
            m_Grid.style.left = 0; m_Grid.style.top = 0; m_Grid.style.right = 0; m_Grid.style.bottom = 0;
            root.Add(m_Grid);
        }

        void OnDisable() { m_Grid?.RemoveFromHierarchy(); }

        void Update()
        {
            if (m_Frame++ % framesPerStep != 0 || m_Grid == null) return;
            m_Step = (m_Step + 1) % steps.Length;
            int n = steps[m_Step];
            m_Grid.Clear();
            for (int i = 0; i < n; i++)
            {
                var e = new VisualElement { pickingMode = PickingMode.Ignore };
                e.style.width = 8; e.style.height = 8;
                e.style.backgroundColor = Color.HSVToRGB((i * 0.013f) % 1f, 0.5f, 0.8f);
                m_Grid.Add(e);
            }
            UiCounterSampler.Tag = n;
        }
    }
}
