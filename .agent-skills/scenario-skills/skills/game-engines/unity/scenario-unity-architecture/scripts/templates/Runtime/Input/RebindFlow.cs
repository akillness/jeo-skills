// Game.Runtime: one interactive rebind, with the fixes the stock Rebinding UI sample lacks
// (samyam, csqVa2Vimao) and the rules of the Input System 1.20 manual:
//  1. The action must be DISABLED while rebinding: RebindingOperation.WithAction throws
//     InvalidOperationException "Cannot rebind action ... while it is enabled" (package source 1.20,
//     observed in procedures.md A5). It is re-enabled on complete AND on cancel.
//  2. PerformInteractiveRebinding(index) throws on a composite binding (WASD): target its parts.
//  3. Escape cancels. For Button actions the package does NOT add Escape as a cancel control by
//     default (it only does for non-button actions), so without WithCancelingThrough Escape becomes the
//     new binding.
//  4. Mouse buttons and pointer position are excluded for keyboard rows, or a stray click becomes the
//     binding ([00:20:53]); pass a device path (for example "<Gamepad>") to keep a row on one device.
//  5. Duplicates are checked on effectivePath (override if set, else the default), within the action
//     map, only against bindings whose control-scheme groups overlap; parts of the SAME composite are
//     compared only with EARLIER parts so players can re-order WASD ([00:27:44], [00:28:53]). A
//     duplicate restores the PREVIOUS override (not just "remove override").
//  6. The RebindingOperation is disposed, or it leaks unmanaged memory (1.20 manual).
//  7. Modifier combos (OneModifier, TwoModifiers, ButtonWith...): with Complexity-Based Shortcut Resolution
//     on (InputSettings.shortcutKeysConsumeInput), Shift+B consumes B, so B and Shift+B on two actions are
//     NOT a conflict and combos are compared as a whole; with it off, pressing Shift+B also fires B, so
//     each part is compared on its own (1.20 manual, binding-conflicts; both cases run in procedures.md A15).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A5).
using System;
using UnityEngine.InputSystem;

namespace Game.Runtime
{
    public sealed class RebindFlow : IDisposable
    {
        public enum Outcome { Rebound, Duplicate, Canceled }

        public struct Result
        {
            public Outcome outcome;
            public string newPath;          // effective path after the flow
            public string conflictAction;   // for Duplicate
            public string conflictPath;
        }

        public struct Options
        {
            public string requiredDevicePath;   // "<Keyboard>", "<Gamepad>", null = any
            public bool excludeMouseButtons;    // true for keyboard rows
            public float waitForAnother;        // package default 0.05 s
            public static Options Keyboard => new Options { requiredDevicePath = "<Keyboard>", excludeMouseButtons = true, waitForAnother = 0.05f };
            public static Options Gamepad => new Options { requiredDevicePath = "<Gamepad>", excludeMouseButtons = true, waitForAnother = 0.05f };
        }

        readonly InputAction m_Action;
        readonly int m_Index;
        readonly bool m_WasEnabled;
        readonly string m_PreviousOverride;
        readonly Action<Result> m_Done;
        InputActionRebindingExtensions.RebindingOperation m_Op;
        bool m_Finished;

        public bool IsRunning => !m_Finished;
        public bool OperationDisposed { get; private set; }

        RebindFlow(InputAction action, int index, Action<Result> done)
        {
            m_Action = action; m_Index = index; m_Done = done;
            m_WasEnabled = action.enabled;
            m_PreviousOverride = action.bindings[index].overridePath;
        }

        public static RebindFlow Start(InputAction action, int bindingIndex, Options options, Action<Result> done)
        {
            if (action == null) throw new ArgumentNullException(nameof(action));
            if (bindingIndex < 0 || bindingIndex >= action.bindings.Count) throw new ArgumentOutOfRangeException(nameof(bindingIndex));
            if (action.bindings[bindingIndex].isComposite)
                throw new ArgumentException("binding " + bindingIndex + " of " + action.name + " is a composite: rebind its parts", nameof(bindingIndex));

            var flow = new RebindFlow(action, bindingIndex, done);
            action.Disable();
            var op = action.PerformInteractiveRebinding(bindingIndex)
                .WithCancelingThrough("<Keyboard>/escape")
                .OnMatchWaitForAnother(options.waitForAnother);
            if (options.excludeMouseButtons)
                op.WithControlsExcluding("<Mouse>/leftButton").WithControlsExcluding("<Mouse>/rightButton")
                  .WithControlsExcluding("<Mouse>/middleButton").WithControlsExcluding("<Mouse>/press")
                  .WithControlsExcluding("<Pointer>/position");
            if (!string.IsNullOrEmpty(options.requiredDevicePath))
                op.WithControlsHavingToMatchPath(options.requiredDevicePath);
            op.OnComplete(_ => flow.Complete()).OnCancel(_ => flow.Finish(new Result { outcome = Outcome.Canceled, newPath = action.bindings[bindingIndex].effectivePath }));
            flow.m_Op = op;
            op.Start();
            return flow;
        }

        void Complete()
        {
            var b = m_Action.bindings[m_Index];
            if (TryFindDuplicate(m_Action, m_Index, out var otherAction, out var otherPath))
            {
                if (string.IsNullOrEmpty(m_PreviousOverride)) m_Action.RemoveBindingOverride(m_Index);
                else m_Action.ApplyBindingOverride(m_Index, m_PreviousOverride);
                Finish(new Result { outcome = Outcome.Duplicate, newPath = m_Action.bindings[m_Index].effectivePath, conflictAction = otherAction, conflictPath = otherPath });
                return;
            }
            Finish(new Result { outcome = Outcome.Rebound, newPath = b.effectivePath });
        }

        void Finish(Result r)
        {
            if (m_Finished) return;
            m_Finished = true;
            m_Op?.Dispose();
            OperationDisposed = true;
            if (m_WasEnabled) m_Action.Enable();
            m_Done?.Invoke(r);
        }

        /// <summary>Cancel from UI (closing the menu). Safe to call twice.</summary>
        public void Dispose()
        {
            if (m_Finished) return;
            m_Op?.Cancel(); // raises OnCancel -> Finish
            if (!m_Finished) Finish(new Result { outcome = Outcome.Canceled, newPath = m_Action.bindings[m_Index].effectivePath });
        }

        // ------------------------------------------------------------------ duplicate rule
        public static bool TryFindDuplicate(InputAction action, int bindingIndex, out string otherAction, out string otherPath) =>
            TryFindDuplicate(action, bindingIndex, InputSystem.settings.shortcutKeysConsumeInput, out otherAction, out otherPath);

        public static bool TryFindDuplicate(InputAction action, int bindingIndex, bool shortcutsConsumeInput, out string otherAction, out string otherPath)
        {
            otherAction = null; otherPath = null;
            var bindings = action.bindings;
            var nb = bindings[bindingIndex];
            string path = nb.effectivePath;
            if (string.IsNullOrEmpty(path)) return false;
            int head = CompositeHead(action, bindingIndex);

            var candidates = action.actionMap != null ? action.actionMap.bindings : bindings;
            int nbFlat = -1;
            for (int i = 0; i < candidates.Count; i++) if (candidates[i].id == nb.id) { nbFlat = i; break; }
            int nbHead = nbFlat >= 0 ? HeadIn(candidates, nbFlat) : -1;
            bool nbCombo = shortcutsConsumeInput && nbHead >= 0 && IsModifierComposite(candidates[nbHead]);
            string nbKey = nbCombo ? ComboKey(candidates, nbHead) : path.ToLowerInvariant();

            for (int i = 0; i < candidates.Count; i++)
            {
                var b = candidates[i];
                if (b.isComposite || b.id == nb.id || string.IsNullOrEmpty(b.effectivePath)) continue;
                if (!GroupsOverlap(b.groups, nb.groups)) continue;
                int bHead = HeadIn(candidates, i);
                bool bCombo = shortcutsConsumeInput && bHead >= 0 && IsModifierComposite(candidates[bHead]);
                if (nbCombo || bCombo)
                {
                    if (bHead >= 0 && bHead == nbHead) continue;          // own combo: compared as a whole
                    string bKey = bCombo ? ComboKey(candidates, bHead) : b.effectivePath.ToLowerInvariant();
                    if (bKey != nbKey) continue;                          // B is not Shift+B when shortcuts consume input
                    otherAction = string.IsNullOrEmpty(b.action) ? action.name : b.action;
                    otherPath = bCombo ? bKey : b.effectivePath;
                    return true;
                }
                if (!string.Equals(b.effectivePath, path, StringComparison.OrdinalIgnoreCase)) continue;
                if (head >= 0 && b.action == action.name)
                {
                    int j = IndexOfId(action, b.id);
                    if (j > bindingIndex && CompositeHead(action, j) == head) continue; // later part of the same composite
                }
                otherAction = string.IsNullOrEmpty(b.action) ? action.name : b.action;
                otherPath = b.effectivePath;
                return true;
            }
            return false;
        }

        static readonly string[] k_ModifierComposites = { "OneModifier", "TwoModifiers", "ButtonWithOneModifier", "ButtonWithTwoModifiers" };

        static bool IsModifierComposite(InputBinding compositeHead)
        {
            string p = compositeHead.path ?? "";
            foreach (var m in k_ModifierComposites) if (p.StartsWith(m, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        static int HeadIn(UnityEngine.InputSystem.Utilities.ReadOnlyArray<InputBinding> list, int i)
        {
            if (!list[i].isPartOfComposite) return -1;
            int h = i;
            while (h > 0 && !list[h].isComposite) h--;
            return h;
        }

        static string ComboKey(UnityEngine.InputSystem.Utilities.ReadOnlyArray<InputBinding> list, int head)
        {
            var parts = new System.Collections.Generic.List<string>();
            for (int j = head + 1; j < list.Count && list[j].isPartOfComposite; j++) parts.Add((list[j].effectivePath ?? "").ToLowerInvariant());
            parts.Sort(StringComparer.Ordinal);
            return string.Join("+", parts);
        }

        static int CompositeHead(InputAction action, int index)
        {
            var bindings = action.bindings;
            if (!bindings[index].isPartOfComposite) return -1;
            int h = index;
            while (h > 0 && !bindings[h].isComposite) h--;
            return h;
        }

        static int IndexOfId(InputAction action, Guid id)
        {
            var bindings = action.bindings;
            for (int i = 0; i < bindings.Count; i++) if (bindings[i].id == id) return i;
            return -1;
        }

        static bool GroupsOverlap(string a, string b)
        {
            if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b)) return true;
            foreach (var ga in a.Split(';'))
                foreach (var gb in b.Split(';'))
                    if (ga.Length > 0 && ga == gb) return true;
            return false;
        }

        /// <summary>Index of the first binding of an action in a control-scheme group ("Keyboard&amp;Mouse", "Gamepad"),
        /// skipping composite heads; -1 if none.</summary>
        public static int BindingIndexForGroup(InputAction action, string group, string partName = null)
        {
            var bindings = action.bindings;
            for (int i = 0; i < bindings.Count; i++)
            {
                var b = bindings[i];
                if (b.isComposite) continue;
                if (partName != null && !string.Equals(b.name, partName, StringComparison.OrdinalIgnoreCase)) continue;
                if (b.groups != null && Array.IndexOf(b.groups.Split(';'), group) >= 0) return i;
            }
            return -1;
        }
    }
}
