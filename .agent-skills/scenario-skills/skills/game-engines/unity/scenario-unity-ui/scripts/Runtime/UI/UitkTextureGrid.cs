// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). Measurement driver: fills its UIDocument
// with N elements, each with its OWN texture (512 x 512, above the dynamic atlas' default size filter,
// so nothing is atlased), stepping through `steps` every `framesPerStep` frames and publishing N in
// UiCounterSampler.Tag. Used to measure the UI Toolkit rule "a batch samples at most 8 textures; the
// 9th forces a new batch" (Nicolas Borromeo, Unity, bECmaYIvZJg [00:10:22]). Not for shipping UI.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace AgentUI
{
    [RequireComponent(typeof(UIDocument))]
    public class UitkTextureGrid : MonoBehaviour
    {
        public int[] steps = { 4, 8, 9, 16, 17 };
        public int framesPerStep = 40;
        public int textureSize = 512;
        public bool shareOneTexture;          // control: N elements, ONE texture
        readonly List<Texture2D> m_Textures = new List<Texture2D>();
        VisualElement m_Grid;
        int m_Frame, m_Step = -1;

        void OnEnable()
        {
            var root = GetComponent<UIDocument>().rootVisualElement;
            m_Grid = new VisualElement { name = "texture-grid", pickingMode = PickingMode.Ignore };
            m_Grid.style.flexDirection = FlexDirection.Row;
            m_Grid.style.flexWrap = Wrap.Wrap;
            m_Grid.style.position = Position.Absolute;
            m_Grid.style.left = 20; m_Grid.style.top = 20; m_Grid.style.right = 20;
            root.Add(m_Grid);
        }

        void OnDisable()
        {
            m_Grid?.RemoveFromHierarchy();
            foreach (var t in m_Textures) Destroy(t);
            m_Textures.Clear();
        }

        Texture2D Tex(int i)
        {
            while (m_Textures.Count <= i)
            {
                var t = new Texture2D(textureSize, textureSize, TextureFormat.RGBA32, false) { name = "grid" + m_Textures.Count };
                var c = Color.HSVToRGB((m_Textures.Count * 0.13f) % 1f, 0.6f, 0.9f);
                var px = new Color32[textureSize * textureSize];
                for (int p = 0; p < px.Length; p++) px[p] = c;
                t.SetPixels32(px);
                t.Apply(false, true); // upload, then drop the CPU copy (not readable)
                m_Textures.Add(t);
            }
            return m_Textures[shareOneTexture ? 0 : i];
        }

        void Update()
        {
            if (m_Frame++ % framesPerStep != 0 || m_Grid == null) return;
            m_Step = (m_Step + 1) % steps.Length;
            int n = steps[m_Step];
            m_Grid.Clear();
            for (int i = 0; i < n; i++)
            {
                var e = new VisualElement { pickingMode = PickingMode.Ignore };
                e.style.width = 96; e.style.height = 96;
                e.style.marginRight = 8; e.style.marginBottom = 8;
                e.style.backgroundImage = new StyleBackground(Tex(i));
                m_Grid.Add(e);
            }
            UiCounterSampler.Tag = n;
        }
    }
}
