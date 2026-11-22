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
    [RequireComponent(typeof(Selectable))]
    public class SelectableFeedback : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, ISelectHandler, IDeselectHandler
    {
        [SerializeField, Range(1f, 1.3f)] float selectedScale = 1.05f;
        [SerializeField, Range(0.02f, 0.5f)] float duration = 0.12f;

        public static event System.Action<GameObject> AnySelected;
        Coroutine m_Tween;
        Selectable m_Selectable;

        void Awake() { m_Selectable = GetComponent<Selectable>(); }

        void OnDisable()
        {
            if (m_Tween != null) StopCoroutine(m_Tween);
            m_Tween = null;
            transform.localScale = Vector3.one; // UI elements stay at scale 1 at rest (Christina, HTQV4mukZ2M [00:11:24])
        }

        public void OnPointerEnter(PointerEventData e)
        {
            if (m_Selectable != null && m_Selectable.IsInteractable()) e.selectedObject = gameObject;
        }

        public void OnPointerExit(PointerEventData e)
        {
            if (e.selectedObject == gameObject) e.selectedObject = null;
        }

        public void OnSelect(BaseEventData e)
        {
            AnySelected?.Invoke(gameObject);
            Tween(selectedScale);
        }

        public void OnDeselect(BaseEventData e) { Tween(1f); }

        void Tween(float target)
        {
            if (!isActiveAndEnabled || !Application.isPlaying) { transform.localScale = Vector3.one * target; return; }
            if (m_Tween != null) StopCoroutine(m_Tween); // fast hovering never runs two tweens against each other
            m_Tween = StartCoroutine(Run(Vector3.one * target));
        }

        IEnumerator Run(Vector3 to)
        {
            var from = transform.localScale;
            for (float t = 0; t < duration; t += Time.unscaledDeltaTime)
            {
                float x = t / duration;
                transform.localScale = Vector3.LerpUnclamped(from, to, 1f - (1f - x) * (1f - x));
                yield return null;
            }
            transform.localScale = to;
            m_Tween = null;
        }
    }
}
