// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). A UI Toolkit custom control written as
// text: [UxmlElement] partial class (the 6.x route; UxmlFactory/UxmlTraits are removed in 6.6),
// [UxmlAttribute] for data, custom USS properties for looks (Game Dev Guide, 6DcwHPxCE54 [00:16:54]).
// The fill moves with style.scale, a transform, never width: no layout pass per change, and the
// DynamicTransform/DynamicColor usage hints are set BEFORE the element joins a panel
// (Borromeo, bECmaYIvZJg [00:22:41], [00:27:43]).
// Colour steps (high / mid / low) come from USS custom properties --bar-high, --bar-mid, --bar-low,
// with hard steps like Brackeys' Fixed gradient (BLfNP4Sc_iA [00:11:23]).
using Unity.Properties;
using UnityEngine;
using UnityEngine.UIElements;

namespace AgentUI
{
    [UxmlElement]
    public partial class HudBar : VisualElement
    {
        public static readonly BindingId valueProperty = nameof(value);
        static readonly CustomStyleProperty<Color> s_High = new CustomStyleProperty<Color>("--bar-high");
        static readonly CustomStyleProperty<Color> s_Mid = new CustomStyleProperty<Color>("--bar-mid");
        static readonly CustomStyleProperty<Color> s_Low = new CustomStyleProperty<Color>("--bar-low");

        readonly VisualElement m_Fill;
        float m_Value = 1f;
        Color m_High = new Color(0.27f, 0.74f, 0.2f), m_Mid = new Color(0.88f, 0.69f, 0.17f), m_Low = new Color(0.76f, 0.21f, 0.09f);

        [UxmlAttribute, CreateProperty]
        public float value
        {
            get => m_Value;
            set
            {
                value = Mathf.Clamp01(value);
                if (Mathf.Approximately(value, m_Value)) return;
                m_Value = value;
                Apply();
                NotifyPropertyChanged(valueProperty);
            }
        }

        public VisualElement Fill => m_Fill;

        public HudBar()
        {
            AddToClassList("hud-bar");
            m_Fill = new VisualElement { name = "fill", pickingMode = PickingMode.Ignore };
            m_Fill.AddToClassList("hud-bar__fill");
            m_Fill.usageHints = UsageHints.DynamicTransform | UsageHints.DynamicColor;
            Add(m_Fill);
            pickingMode = PickingMode.Ignore;
            RegisterCallback<CustomStyleResolvedEvent>(OnStyles);
            Apply();
        }

        void OnStyles(CustomStyleResolvedEvent e)
        {
            if (customStyle.TryGetValue(s_High, out var h)) m_High = h;
            if (customStyle.TryGetValue(s_Mid, out var m)) m_Mid = m;
            if (customStyle.TryGetValue(s_Low, out var l)) m_Low = l;
            Apply();
        }

        void Apply()
        {
            m_Fill.style.scale = new Scale(new Vector3(m_Value, 1f, 1f));
            m_Fill.style.backgroundColor = m_Value > 0.5f ? m_High : (m_Value > 0.25f ? m_Mid : m_Low);
        }
    }
}
