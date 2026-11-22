// scenario-unity-ui runtime (Unity Expert Skills v0.2, 2026-09-24). Measurement driver for the UI Toolkit
// deactivation matrix (Nicolas Borromeo, Unity, bECmaYIvZJg [frame 00:36:49], [00:38:08]; UI Toolkit
// manual "Best practices for managing elements", hiding table). Builds a settings-sized screen
// (`rows` rows, each a label bound to a model that changes every frame plus a bar), then for each
// hiding method: visible frames, the hide frame, hidden frames, the show frame. Tags published in
// UiCounterSampler.Tag = method * 10 + phase (phase 1 hide frame, 2 hidden, 3 show frame, 4 visible),
// so one Play Mode counter run compares toggle spikes and steady cost per method. Whether bindings
// kept updating while hidden goes to UiCounterSampler.Extra. Not for shipping UI.
using System;
using Unity.Properties;
using UnityEngine;
using UnityEngine.UIElements;

namespace AgentUI
{
    [GeneratePropertyBag]
    public partial class HideProbeModel : INotifyBindablePropertyChanged, IDataSourceViewHashProvider
    {
        public event EventHandler<BindablePropertyChangedEventArgs> propertyChanged;
        long m_Version;
        int m_Value;
        string m_Text = "0";

        [CreateProperty]
        public int Value
        {
            get => m_Value;
            set
            {
                if (value == m_Value) return;
                m_Value = value;
                m_Text = m_Value.ToString();
                m_Version++;
                propertyChanged?.Invoke(this, new BindablePropertyChangedEventArgs(nameof(Value)));
                propertyChanged?.Invoke(this, new BindablePropertyChangedEventArgs(nameof(Text)));
            }
        }

        [CreateProperty] public string Text => m_Text;
        public long GetViewHashCode() => m_Version;
    }

    [RequireComponent(typeof(UIDocument))]
    public class UitkHideDriver : MonoBehaviour
    {
        public enum Method { Visible = 0, Opacity0 = 1, Offscreen = 2, VisibilityHidden = 3, DisplayNone = 4, Removed = 5 }

        public int rows = 120;
        public int visibleFrames = 20, hiddenFrames = 20;
        public static readonly string[] Names = { "visible", "opacity0", "offscreen", "visibility_hidden", "display_none", "removed" };

        readonly HideProbeModel m_Model = new HideProbeModel();
        VisualElement m_Root, m_Screen;
        Label m_Probe;
        int m_Method = 1, m_PhaseFrame = -1, m_Phase = 4;

        void OnEnable()
        {
            m_Root = GetComponent<UIDocument>().rootVisualElement;
            m_Screen = new VisualElement { name = "settings-screen" };
            m_Screen.style.position = Position.Absolute;
            m_Screen.style.left = 40; m_Screen.style.top = 40; m_Screen.style.width = 900;
            m_Screen.style.flexDirection = FlexDirection.Row; m_Screen.style.flexWrap = Wrap.Wrap;
            m_Screen.dataSource = m_Model;
            for (int i = 0; i < rows; i++)
            {
                var row = new VisualElement();
                row.style.flexDirection = FlexDirection.Row; row.style.width = 440; row.style.height = 18;
                var label = new Label("0");
                label.style.width = 120; label.style.fontSize = 12;
                label.SetBinding("text", new DataBinding { dataSourcePath = new PropertyPath(nameof(HideProbeModel.Text)), bindingMode = BindingMode.ToTarget });
                var bar = new VisualElement();
                bar.style.width = 280; bar.style.height = 10; bar.style.marginTop = 4;
                bar.style.backgroundColor = new Color(0.25f, 0.45f, 0.62f);
                bar.style.borderTopLeftRadius = 3; bar.style.borderTopRightRadius = 3;
                bar.style.borderBottomLeftRadius = 3; bar.style.borderBottomRightRadius = 3;
                row.Add(label); row.Add(bar);
                m_Screen.Add(row);
                if (i == 0) m_Probe = label;
            }
            m_Root.Add(m_Screen);
        }

        void OnDisable() { m_Screen?.RemoveFromHierarchy(); }

        void Update()
        {
            m_Model.Value++;                       // bindings have something to update every frame
            m_PhaseFrame++;
            if (m_Phase == 4 && m_PhaseFrame >= visibleFrames)
            {
                if (m_Method > 5) m_Method = 1;    // loop until the sampler has its frames
                Hide((Method)m_Method); m_Phase = 1; m_PhaseFrame = 0;
            }
            else if (m_Phase == 1) { m_Phase = 2; }
            else if (m_Phase == 2 && m_PhaseFrame >= hiddenFrames)
            {
                // bindings updated while hidden? (label text lags the model by at most a frame when they are live)
                int shown;
                bool live = int.TryParse(m_Probe.text, out shown) && m_Model.Value - shown <= 2;
                UiCounterSampler.Extra["bindings_live_while_hidden." + Names[m_Method]] = live ? "true" : "false";
                Show((Method)m_Method); m_Phase = 3; m_PhaseFrame = 0;
            }
            else if (m_Phase == 3) { m_Phase = 4; m_Method++; }
            UiCounterSampler.Tag = (m_Phase == 4 ? 0 : Mathf.Min(m_Method, 5)) * 10 + m_Phase;
        }

        public void Hide(Method m)
        {
            switch (m)
            {
                case Method.Opacity0: m_Screen.style.opacity = 0f; break;
                case Method.Offscreen:
                    m_Screen.usageHints |= UsageHints.DynamicTransform;   // set earlier in real UI (before it joins a panel)
                    m_Screen.style.translate = new Translate(-5000, -5000); break;
                case Method.VisibilityHidden: m_Screen.style.visibility = Visibility.Hidden; break;
                case Method.DisplayNone: m_Screen.style.display = DisplayStyle.None; break;
                case Method.Removed: m_Screen.RemoveFromHierarchy(); break;
            }
        }

        public void Show(Method m)
        {
            switch (m)
            {
                case Method.Opacity0: m_Screen.style.opacity = 1f; break;
                case Method.Offscreen: m_Screen.style.translate = new Translate(0, 0); break;
                case Method.VisibilityHidden: m_Screen.style.visibility = Visibility.Visible; break;
                case Method.DisplayNone: m_Screen.style.display = DisplayStyle.Flex; break;
                case Method.Removed: m_Root.Add(m_Screen); break;
            }
        }
    }
}
