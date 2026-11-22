// Game.Core: pure C# (asmdef noEngineReferences), so EditMode tests run in milliseconds with no
// scene and no assets. The inventory only knows item ids and a catalog lookup.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (see procedures.md A2).
using System;
using System.Collections.Generic;

namespace Game.Core
{
    /// <summary>What the inventory needs from the item data. ItemDatabase (a ScriptableObject)
    /// implements it at runtime; tests pass a dictionary.</summary>
    public interface IItemCatalog
    {
        bool Contains(string itemId);
        int MaxStack(string itemId);
    }

    [Serializable]
    public struct ItemStack
    {
        public string itemId;   // public fields: JsonUtility serializes fields, not properties
        public int count;
        public ItemStack(string id, int n) { itemId = id; count = n; }
        public bool IsEmpty => string.IsNullOrEmpty(itemId) || count <= 0;
        public override string ToString() => IsEmpty ? "(empty)" : itemId + " x" + count;
    }

    public sealed class Inventory
    {
        readonly ItemStack[] m_Slots;
        readonly IItemCatalog m_Catalog;

        /// <summary>Slot index that changed. Systems (UI, audio) subscribe; the inventory never knows them.</summary>
        public event Action<int> SlotChanged;

        public Inventory(int capacity, IItemCatalog catalog)
        {
            if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity));
            m_Slots = new ItemStack[capacity];
            m_Catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
        }

        public int Capacity => m_Slots.Length;
        public ItemStack this[int slot] => m_Slots[slot];

        public int CountOf(string itemId)
        {
            int n = 0;
            foreach (var s in m_Slots) if (s.itemId == itemId) n += s.count;
            return n;
        }

        /// <summary>Adds up to count items: fills existing stacks first, then empty slots.
        /// Returns the leftover that did not fit (0 when everything fit). Unknown ids throw:
        /// a typo in content must fail loudly, not vanish.</summary>
        public int Add(string itemId, int count)
        {
            if (count <= 0) return 0;
            if (!m_Catalog.Contains(itemId)) throw new ArgumentException("unknown item id: " + itemId, nameof(itemId));
            int max = Math.Max(1, m_Catalog.MaxStack(itemId));
            int left = count;
            for (int i = 0; i < m_Slots.Length && left > 0; i++)
            {
                if (m_Slots[i].itemId != itemId || m_Slots[i].count >= max) continue;
                int put = Math.Min(max - m_Slots[i].count, left);
                m_Slots[i].count += put;
                left -= put;
                SlotChanged?.Invoke(i);
            }
            for (int i = 0; i < m_Slots.Length && left > 0; i++)
            {
                if (!m_Slots[i].IsEmpty) continue;
                int put = Math.Min(max, left);
                m_Slots[i] = new ItemStack(itemId, put);
                left -= put;
                SlotChanged?.Invoke(i);
            }
            return left;
        }

        /// <summary>All-or-nothing removal: returns false and changes nothing when there are too few.</summary>
        public bool Remove(string itemId, int count)
        {
            if (count <= 0) return true;
            if (CountOf(itemId) < count) return false;
            int left = count;
            for (int i = m_Slots.Length - 1; i >= 0 && left > 0; i--)
            {
                if (m_Slots[i].itemId != itemId) continue;
                int take = Math.Min(m_Slots[i].count, left);
                m_Slots[i].count -= take;
                left -= take;
                if (m_Slots[i].count == 0) m_Slots[i] = default;
                SlotChanged?.Invoke(i);
            }
            return true;
        }

        /// <summary>Plain data for the save file: ids and counts, never asset references.</summary>
        public InventoryState Capture()
        {
            var st = new InventoryState { capacity = m_Slots.Length, slots = new List<ItemStack>() };
            foreach (var s in m_Slots) st.slots.Add(s.IsEmpty ? default : s);
            return st;
        }

        /// <summary>Restores slots from a save. Ids the catalog no longer knows (content removed
        /// since the save) are dropped and counted, never crash the load. Returns the dropped ids.</summary>
        public List<string> Restore(InventoryState state)
        {
            var dropped = new List<string>();
            for (int i = 0; i < m_Slots.Length; i++) m_Slots[i] = default;
            if (state?.slots == null) return dropped;
            for (int i = 0; i < state.slots.Count && i < m_Slots.Length; i++)
            {
                var s = state.slots[i];
                if (s.IsEmpty) continue;
                if (!m_Catalog.Contains(s.itemId)) { dropped.Add(s.itemId); continue; }
                m_Slots[i] = new ItemStack(s.itemId, Math.Min(s.count, Math.Max(1, m_Catalog.MaxStack(s.itemId))));
            }
            for (int i = 0; i < m_Slots.Length; i++) SlotChanged?.Invoke(i);
            return dropped;
        }
    }
}
