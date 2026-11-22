// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). The key rebinding hook of a settings
// screen: one row = one action binding. Uses the project-wide actions (InputSystem.actions, the
// 6.3 template default) unless an asset is assigned, so the rebind reaches gameplay and the UI
// module alike. Interactive rebind through the Input System 1.20 API; the label always comes from
// GetBindingDisplayString, never from a hard-coded key name. Overrides persist through
// SettingsService.CaptureBindings / Apply (JSON), raised through the static Rebound event.
using System;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace AgentUI
{
    public class RebindRow : MonoBehaviour
    {
        [SerializeField] InputActionAsset actions;           // null = InputSystem.actions (project-wide)
        [SerializeField] string actionPath = "Player/Jump";  // "Map/Action"
        [SerializeField] int bindingIndex;
        [SerializeField] TMP_Text bindingLabel;
        [SerializeField] string waitingText = "Press a key...";

        InputActionRebindingExtensions.RebindingOperation m_Op;
        public static event Action<RebindRow> Rebound;

        public string ActionPath { get => actionPath; set { actionPath = value; Refresh(); } }
        public int BindingIndex { get => bindingIndex; set { bindingIndex = value; Refresh(); } }
        public TMP_Text BindingLabel { get => bindingLabel; set => bindingLabel = value; }
        public bool IsRebinding => m_Op != null;
        public InputActionAsset Asset => actions != null ? actions : InputSystem.actions;
        public InputAction Action => Asset != null ? Asset.FindAction(actionPath) : null;

        void OnEnable() { Refresh(); }

        void OnDisable() { Cancel(); }

        public void StartRebind()
        {
            var a = Action;
            if (a == null) { Debug.LogWarning("RebindRow: action not found " + actionPath); return; }
            Cancel();
            bool wasEnabled = a.enabled;
            a.Disable(); // an enabled action cannot be rebound interactively
            if (bindingLabel != null) bindingLabel.text = waitingText;
            m_Op = a.PerformInteractiveRebinding(bindingIndex)
                .WithControlsExcluding("<Mouse>/position")
                .WithControlsExcluding("<Mouse>/delta")
                .WithCancelingThrough("<Keyboard>/escape")
                .OnMatchWaitForAnother(0.1f)
                .OnComplete(op => Finish(a, wasEnabled, true))
                .OnCancel(op => Finish(a, wasEnabled, false))
                .Start();
        }

        public void Cancel()
        {
            if (m_Op == null) return;
            m_Op.Cancel();
        }

        void Finish(InputAction a, bool reenable, bool completed)
        {
            m_Op?.Dispose();
            m_Op = null;
            if (reenable) a.Enable();
            Refresh();
            if (completed) Rebound?.Invoke(this);
        }

        public void ResetToDefault()
        {
            var a = Action;
            if (a == null) return;
            a.RemoveBindingOverride(bindingIndex);
            Refresh();
            Rebound?.Invoke(this);
        }

        public void Refresh()
        {
            var a = Action;
            if (bindingLabel != null && a != null && bindingIndex < a.bindings.Count)
                bindingLabel.text = a.GetBindingDisplayString(bindingIndex);
        }
    }
}
