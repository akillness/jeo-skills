// Game.Runtime: authored item data. ScriptableObjects hold DEFINITIONS (read-only at runtime);
// runtime state lives in plain C# (Game.Core.Inventory) and the save file. Play-mode writes to an SO
// persist in the Editor but reset on every launch of a build (Code Monkey, 5a-ztc5gcFw [00:04:17]),
// proven on this Mac in procedures.md A4.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System.Collections.Generic;
using UnityEngine;

namespace Game.Runtime
{
    [CreateAssetMenu(menuName = "Game/Item Definition", fileName = "Item_")]
    public sealed class ItemDefinition : ScriptableObject
    {
        // Stable id written into save files. Never the asset name (renames) and never an instance id
        // (changes every session). Duplicating the asset duplicates the id: the validator catches it.
        [SerializeField] string id;
        [SerializeField] string displayName;
        [SerializeField, Min(1)] int maxStack = 1;
        [SerializeField] Sprite icon;
        // Polymorphic effects inline in the asset (ItemEffect.cs: [SerializeReference], [MovedFrom], [Serializable]).
        [SerializeReference] List<ItemEffect> effects = new List<ItemEffect>();

        public string Id => id;
        public IReadOnlyList<ItemEffect> Effects => effects;
        public string DisplayName => displayName;
        public int MaxStack => Mathf.Max(1, maxStack);
        public Sprite Icon => icon;

#if UNITY_EDITOR
        void OnValidate()
        {
            if (string.IsNullOrEmpty(id))
            {
                id = System.Guid.NewGuid().ToString("N");
                UnityEditor.EditorUtility.SetDirty(this); // only on a real change: no spurious diffs
            }
        }

        /// <summary>Editor tooling only (tests, importers). Runtime code never writes definitions.</summary>
        public void EditorSet(string newId, string newName, int newMaxStack)
        {
            id = newId; displayName = newName; maxStack = newMaxStack;
            UnityEditor.EditorUtility.SetDirty(this);
        }
#endif
    }
}
