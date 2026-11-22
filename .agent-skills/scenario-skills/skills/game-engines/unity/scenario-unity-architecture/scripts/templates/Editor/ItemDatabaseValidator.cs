// Game.Editor: content validation that tests, CI and a menu item share. Duplicated assets duplicate
// their serialized id, so uniqueness is checked here, not trusted to OnValidate.
// Namespace Game.EditorTools (not Game.Editor): a namespace segment named "Editor" shadows the
// UnityEditor.Editor class inside it [added].
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System.Collections.Generic;
using Game.Runtime;
using UnityEditor;
using UnityEngine;

namespace Game.EditorTools
{
    public static class ItemDatabaseValidator
    {
        public static List<string> Validate(ItemDatabase db)
        {
            var errors = new List<string>();
            if (db == null) { errors.Add("database is null"); return errors; }
            var seen = new Dictionary<string, string>();
            for (int i = 0; i < db.Items.Count; i++)
            {
                var d = db.Items[i];
                if (d == null) { errors.Add("items[" + i + "] is missing (deleted asset or broken .meta GUID)"); continue; }
                if (string.IsNullOrEmpty(d.Id)) errors.Add(d.name + ": empty id");
                else if (seen.TryGetValue(d.Id, out var other)) errors.Add(d.name + ": duplicate id " + d.Id + " (also " + other + ")");
                else seen.Add(d.Id, d.name);
                if (d.MaxStack < 1) errors.Add(d.name + ": maxStack < 1");
                if (string.IsNullOrEmpty(d.DisplayName)) errors.Add(d.name + ": empty display name");
            }
            return errors;
        }

        [MenuItem("Tools/Game/Validate Item Databases")]
        public static void ValidateAll()
        {
            int n = 0;
            foreach (var guid in AssetDatabase.FindAssets("t:" + nameof(ItemDatabase)))
            {
                var db = AssetDatabase.LoadAssetAtPath<ItemDatabase>(AssetDatabase.GUIDToAssetPath(guid));
                foreach (var e in Validate(db)) { Debug.LogError("[ItemDatabase] " + db.name + ": " + e, db); n++; }
            }
            Debug.Log("[ItemDatabase] validation done, " + n + " error(s)");
        }
    }
}
