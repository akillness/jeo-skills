// Game.Core: the save file's shape. Plain [Serializable] classes with public fields, so
// JsonUtility (Game.Runtime) can write them; no UnityEngine types, no asset references, a version
// number and an explicit migration chain so old saves keep loading.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (see procedures.md A3).
using System;
using System.Collections.Generic;

namespace Game.Core
{
    [Serializable]
    public class InventoryState
    {
        public int capacity;
        public List<ItemStack> slots = new List<ItemStack>();
    }

    [Serializable]
    public class HealthState
    {
        public float current;
        public float max;
    }

    /// <summary>Current save format (version 2).</summary>
    [Serializable]
    public class SaveData
    {
        public const int CurrentVersion = 2;
        public int version = CurrentVersion;
        public string savedAtUtc;
        public InventoryState inventory = new InventoryState();
        public HealthState health = new HealthState();
    }

    /// <summary>Version 1 as shipped before: a flat item list and an "hp" number.</summary>
    [Serializable]
    public class SaveDataV1
    {
        public int version = 1;
        public List<ItemStack> items = new List<ItemStack>();
        public float hp;
    }

    [Serializable]
    public class SaveHeader
    {
        public int version;
    }

    public static class SaveMigrations
    {
        public static SaveData FromV1(SaveDataV1 v1, int capacity, float maxHp)
        {
            var d = new SaveData { savedAtUtc = null };
            d.inventory.capacity = capacity;
            foreach (var s in v1.items) if (!s.IsEmpty) d.inventory.slots.Add(s);
            d.health.max = maxHp;
            d.health.current = Math.Min(v1.hp, maxHp);
            return d;
        }
    }

    /// <summary>Maps live objects to the save DTO and back. Pure, so the round trip is tested
    /// without Unity; the file part lives in Game.Runtime.SaveService.</summary>
    public static class SaveMapper
    {
        public static SaveData Capture(Inventory inventory, HealthModel health, DateTime utcNow)
        {
            return new SaveData
            {
                savedAtUtc = utcNow.ToString("o"),
                inventory = inventory.Capture(),
                health = health.Capture(),
            };
        }

        /// <returns>item ids dropped because the catalog no longer knows them</returns>
        public static List<string> Restore(SaveData data, Inventory inventory, HealthModel health)
        {
            if (data == null) throw new ArgumentNullException(nameof(data));
            var dropped = inventory.Restore(data.inventory);
            health.Restore(data.health);
            return dropped;
        }
    }
}
