// Game.Runtime: persistence of player rebinds. Only the OVERRIDES are saved (JSON from
// SaveBindingOverridesAsJson), never the whole action asset, so shipping new default bindings still
// reaches players who never rebound that action.
// - Load before enabling the maps; LoadBindingOverridesFromJson first REMOVES all existing overrides
//   unless its second argument is false (Input System 1.20 manual, save-load-rebinds).
// - "Reset all" must also delete the persisted data, or the old overrides come back on the next
//   launch (samyam, csqVa2Vimao [00:33:22]).
// - A file under persistentDataPath rather than PlayerPrefs (the Rebinding UI sample uses the
//   PlayerPrefs key "rebinds"): a file is per-slot, testable against a temp folder, and never shared
//   with the Editor's own PlayerPrefs.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A5).
using System.IO;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Game.Runtime
{
    public static class BindingStore
    {
        public static string DefaultPath => Path.Combine(Application.persistentDataPath, "input_bindings.json");

        public static void Save(InputActionAsset asset, string path)
        {
            string json = asset.SaveBindingOverridesAsJson();
            System.IO.Directory.CreateDirectory(Path.GetDirectoryName(path));
            string tmp = path + ".tmp";
            File.WriteAllText(tmp, json);
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
        }

        /// <summary>Returns true when a file was applied. Call before enabling the maps.
        /// removeExisting (the package default, true) first REMOVES every override already on the asset;
        /// pass false to layer this file over overrides applied earlier (observed, procedures.md A15).</summary>
        public static bool Load(InputActionAsset asset, string path, bool removeExisting = true)
        {
            if (!File.Exists(path)) return false;
            asset.LoadBindingOverridesFromJson(File.ReadAllText(path), removeExisting);
            return true;
        }

        public static void ResetAll(InputActionAsset asset, string path)
        {
            foreach (var map in asset.actionMaps) map.RemoveAllBindingOverrides();
            if (File.Exists(path)) File.Delete(path);
        }

        /// <summary>Reset one binding (a "reset" button next to a rebind row), then persist.</summary>
        public static void ResetBinding(InputAction action, int bindingIndex, string path)
        {
            action.RemoveBindingOverride(bindingIndex);
            Save(action.actionMap.asset, path);
        }
    }
}
