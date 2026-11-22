// Game.Runtime: input context switching and cached action references.
// - Switch maps for context (Player -> UI on pause) instead of "if (paused) return" everywhere
//   (Unity Input System series, Cd2Erk_bsRY [00:06:10]).
// - FindAction is a string lookup: resolve once, never in Update (1.20 manual, using-actions-workflow).
// - Duplicate action names across maps need "Map/Action" (Cd2Erk_bsRY [00:05:38]).
// - With PlayerInput, read playerInput.actions (its per-player copy), never InputSystem.actions,
//   or automatic device assignment breaks (1.20 manual, using-playerinput-workflow).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A5).
using System;
using UnityEngine.InputSystem;

namespace Game.Runtime
{
    public static class InputContext
    {
        /// <summary>Enables exactly one map of the asset and disables the others.</summary>
        public static void SwitchTo(InputActionAsset asset, string mapName)
        {
            var target = asset.FindActionMap(mapName, throwIfNotFound: true);
            foreach (var m in asset.actionMaps) if (m != target) m.Disable();
            target.Enable();
        }

        /// <summary>Throws with the missing names instead of returning null later in Update.</summary>
        public static InputAction Require(InputActionAsset asset, string mapSlashAction)
        {
            var a = asset.FindAction(mapSlashAction, throwIfNotFound: false);
            if (a == null) throw new ArgumentException("input action not found: " + mapSlashAction + " in " + asset.name);
            return a;
        }
    }
}
