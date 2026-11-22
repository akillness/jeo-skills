// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). Connects a HudModel to a UIDocument whose
// UXML already declares its bindings (<Bindings><ui:DataBinding property="text"
// data-source-path="HealthText" binding-mode="ToTarget"/></Bindings>). Only the data source is set in
// code, once, on the root: children inherit it (6.3 Manual; git-amend g2a4ZK8cEso [00:14:27]).
// Gameplay never touches the view: it writes the model (Jason Weimann, 6ztY9-IX3Qg [00:24:57]).
// Hide the whole HUD with display:none for a pause (no GPU cost, bindings keep updating) or remove
// it for long absences (Borromeo's deactivation matrix, bECmaYIvZJg [frame 00:36:49]).
using UnityEngine;
using UnityEngine.UIElements;

namespace AgentUI
{
    [RequireComponent(typeof(UIDocument))]
    public class HudView : MonoBehaviour
    {
        public HudModel Model { get; private set; } = new HudModel();
        UIDocument m_Doc;

        void OnEnable()
        {
            m_Doc = GetComponent<UIDocument>();
            Bind(m_Doc, Model);
        }

        public static void Bind(UIDocument doc, HudModel model)
        {
            if (doc != null && doc.rootVisualElement != null) doc.rootVisualElement.dataSource = model;
        }

        public void SetVisible(bool on)
        {
            if (m_Doc != null && m_Doc.rootVisualElement != null)
                m_Doc.rootVisualElement.style.display = on ? DisplayStyle.Flex : DisplayStyle.None;
        }
    }
}
