// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). uGUI menu navigation that works the same
// with mouse, keyboard and gamepad, and screens that hide without a canvas rebuild.
//
// SelectableFeedback: pointer enter SELECTS instead of highlighting (Sasquatch B Studios,
//   u3YdlUW1nx0 [00:05:03]), so there is one current item whatever the device; feedback runs from
//   ISelectHandler/IDeselectHandler; one cancellable tween on unscaled time (a pause menu runs at
//   timeScale 0); code tween, not an Animator (Animators dirty the canvas every frame, uGUI
//   optimization tips; u3YdlUW1nx0 [00:01:31]).
// MenuScreen: selects its first item ONE FRAME after it is shown (u3YdlUW1nx0 [00:07:38]) and
//   remembers the last selection, so a gamepad resumes after the mouse left everything
//   ([00:08:41]). Show(false) hides through Canvas.enabled (no rebuild on show, uGUI optimization
//   tips "How to hide a Canvas") plus GraphicRaycaster.enabled and CanvasGroup.interactable: a
//   Canvas-disabled screen keeps its Selectables in the navigation graph otherwise (observed
//   2026-09-24, see references/procedures.md P13).
// MenuRouter: one visible screen at a time; buttons call ShowScreen("Settings") through persistent
//   listeners, so a designer sees the wiring in the Inspector (uGUI's serialized events).
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace AgentUI
{
    [RequireComponent(typeof(Canvas))]
    public class MenuScreen : MonoBehaviour
    {
        [SerializeField] Selectable firstSelected;
        [SerializeField] bool shownAtStart;
        [SerializeField] bool coversScene;   // opaque full-screen: the router stops the game cameras behind it
        GameObject m_Last;
        Canvas m_Canvas;
        GraphicRaycaster m_Raycaster;
        CanvasGroup m_Group;

        public Selectable FirstSelected { get => firstSelected; set => firstSelected = value; }
        public bool ShownAtStart { get => shownAtStart; set => shownAtStart = value; }
        public bool CoversScene { get => coversScene; set => coversScene = value; }
        public GameObject LastSelected => m_Last;
        public bool IsShown => Canvas.enabled;
        Canvas Canvas => m_Canvas != null ? m_Canvas : (m_Canvas = GetComponent<Canvas>());

        void Awake()
        {
            m_Raycaster = GetComponent<GraphicRaycaster>();
            m_Group = GetComponent<CanvasGroup>();
        }

        void OnEnable() { SelectableFeedback.AnySelected += Track; }
        void OnDisable() { SelectableFeedback.AnySelected -= Track; }

        void Start() { Show(shownAtStart); }

        void Track(GameObject go)
        {
            if (IsShown && go != null && go.transform.IsChildOf(transform)) m_Last = go;
        }

        /// <summary>Hide or show without a rebuild: Canvas.enabled keeps the batched meshes; the
        /// raycaster and CanvasGroup take the hidden screen out of pointer and navigation input.</summary>
        public void Show(bool on)
        {
            Canvas.enabled = on;
            if (m_Raycaster == null) m_Raycaster = GetComponent<GraphicRaycaster>();
            if (m_Group == null) m_Group = GetComponent<CanvasGroup>();
            if (m_Raycaster != null) m_Raycaster.enabled = on;
            if (m_Group != null) { m_Group.interactable = on; m_Group.blocksRaycasts = on; }
            if (on && Application.isPlaying && isActiveAndEnabled) StartCoroutine(SelectNextFrame());
        }

        IEnumerator SelectNextFrame()
        {
            yield return null; // selecting in the same frame the screen appears glitches (u3YdlUW1nx0 [00:07:38])
            Select(m_Last != null ? m_Last : (firstSelected != null ? firstSelected.gameObject : null));
        }

        public static void Select(GameObject go)
        {
            var es = EventSystem.current;
            if (es != null && go != null) es.SetSelectedGameObject(go);
        }

        void Update()
        {
            var es = EventSystem.current;
            if (es == null || !IsShown || es.currentSelectedGameObject != null) return;
            if (!NavigationHeld(es)) return;
            // nothing selected (the mouse left the last item) and a keyboard or gamepad move arrived
            var target = m_Last != null && m_Last.activeInHierarchy ? m_Last : (firstSelected != null ? firstSelected.gameObject : null);
            Select(target);
        }

        static bool NavigationHeld(EventSystem es)
        {
            if (es.currentInputModule is InputSystemUIInputModule m && m.move != null && m.move.action != null)
                return m.move.action.ReadValue<Vector2>().sqrMagnitude > 0.25f;
            return false;
        }
    }
}
