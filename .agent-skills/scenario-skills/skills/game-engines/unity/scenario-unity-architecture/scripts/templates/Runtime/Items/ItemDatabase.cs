// Game.Runtime: registry of item definitions referenced directly (serialized list), replacing
// Resources.LoadAll lookups, which ship every Resources asset and index it at startup.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System.Collections.Generic;
using Game.Core;
using UnityEngine;

namespace Game.Runtime
{
    [CreateAssetMenu(menuName = "Game/Item Database", fileName = "ItemDatabase")]
    public sealed class ItemDatabase : ScriptableObject, IItemCatalog
    {
        [SerializeField] List<ItemDefinition> items = new List<ItemDefinition>();

        // Not serialized: rebuilt on demand. With domain reload disabled this cache survives Play
        // sessions, so it is rebuilt whenever the list changed size (cheap guard).
        [System.NonSerialized] Dictionary<string, ItemDefinition> m_ById;
        [System.NonSerialized] int m_BuiltFor = -1;

        public IReadOnlyList<ItemDefinition> Items => items;

        Dictionary<string, ItemDefinition> Map
        {
            get
            {
                if (m_ById == null || m_BuiltFor != items.Count)
                {
                    m_ById = new Dictionary<string, ItemDefinition>();
                    foreach (var d in items)
                        if (d != null && !string.IsNullOrEmpty(d.Id) && !m_ById.ContainsKey(d.Id)) m_ById.Add(d.Id, d);
                    m_BuiltFor = items.Count;
                }
                return m_ById;
            }
        }

        public ItemDefinition Find(string itemId) => itemId != null && Map.TryGetValue(itemId, out var d) ? d : null;
        public bool Contains(string itemId) => Find(itemId) != null;
        public int MaxStack(string itemId) => Find(itemId)?.MaxStack ?? 1;

#if UNITY_EDITOR
        public void EditorSetItems(List<ItemDefinition> list)
        {
            items = list;
            m_ById = null;
            UnityEditor.EditorUtility.SetDirty(this);
        }
#endif
    }
}
