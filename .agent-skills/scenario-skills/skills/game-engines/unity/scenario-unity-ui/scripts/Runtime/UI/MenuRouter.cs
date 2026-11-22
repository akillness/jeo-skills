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
//   listeners, so a designer sees the wiring in the Inspector (uGUI's serialized events). A screen
//   marked CoversScene hides the whole game: while it is up the router disables every other camera
//   and lowers Application.targetFrameRate, and restores both when it goes (uGUI optimization tips,
//   "When using a fullscreen UI, hide everything else"). HideAll() closes the menu (pause resumed).
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace AgentUI
{
    public class MenuRouter : MonoBehaviour
    {
        [SerializeField] List<MenuScreen> screens = new List<MenuScreen>();
        public List<MenuScreen> Screens => screens;
        public MenuScreen Current { get; private set; }

        [SerializeField] int fullscreenFrameRate = 30;
        readonly List<Camera> m_Disabled = new List<Camera>();
        int m_SavedFrameRate = int.MinValue;
        public bool SceneHidden => m_SavedFrameRate != int.MinValue;

        public void ShowScreen(string screenName)
        {
            MenuScreen target = null;
            foreach (var s in screens) if (s != null && (s.name == screenName || s.name == "Screen - " + screenName)) target = s;
            if (target == null) { Debug.LogWarning("MenuRouter: no screen " + screenName); return; }
            foreach (var s in screens) if (s != null && s != target) s.Show(false);
            target.Show(true);
            Current = target;
            SetSceneHidden(target.CoversScene);
        }

        public void HideAll()
        {
            foreach (var s in screens) if (s != null) s.Show(false);
            Current = null;
            SetSceneHidden(false);
        }

        void Start()
        {
            foreach (var s in screens) if (s != null && s.ShownAtStart) { ShowScreen(s.name); break; }
        }

        void OnDisable() { SetSceneHidden(false); }

        void SetSceneHidden(bool hide)
        {
            if (hide && !SceneHidden)
            {
                foreach (var cam in Camera.allCameras)   // enabled cameras only
                    if (cam.gameObject.scene != gameObject.scene) { cam.enabled = false; m_Disabled.Add(cam); }
                m_SavedFrameRate = Application.targetFrameRate;
                Application.targetFrameRate = fullscreenFrameRate;
            }
            else if (!hide && SceneHidden)
            {
                foreach (var cam in m_Disabled) if (cam != null) cam.enabled = true;
                m_Disabled.Clear();
                Application.targetFrameRate = m_SavedFrameRate;
                m_SavedFrameRate = int.MinValue;
            }
        }

        public void Quit()
        {
#if UNITY_EDITOR
            Debug.Log("MenuRouter.Quit (ignored in the Editor)");
#else
            Application.Quit();
#endif
        }
    }
}
