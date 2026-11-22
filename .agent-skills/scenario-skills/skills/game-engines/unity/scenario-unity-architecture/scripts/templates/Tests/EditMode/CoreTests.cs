// EditMode tests of the pure core (no scene, no assets): inventory and health rules.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A2).
using System.Collections.Generic;
using Game.Core;
using NUnit.Framework;

namespace Game.Tests
{
    sealed class FakeCatalog : IItemCatalog
    {
        readonly Dictionary<string, int> m_Max;
        public FakeCatalog(Dictionary<string, int> max) { m_Max = max; }
        public bool Contains(string id) => id != null && m_Max.ContainsKey(id);
        public int MaxStack(string id) => m_Max.TryGetValue(id, out var m) ? m : 1;
        public static FakeCatalog Default => new FakeCatalog(new Dictionary<string, int> { { "potion", 5 }, { "sword", 1 }, { "arrow", 99 } });
    }

    public class InventoryTests
    {
        [Test]
        public void Add_FillsExistingStacksThenEmptySlots_ReturnsLeftover()
        {
            var inv = new Inventory(3, FakeCatalog.Default);
            Assert.AreEqual(0, inv.Add("potion", 3));
            Assert.AreEqual(0, inv.Add("potion", 4));          // 5 in slot 0, 2 in slot 1
            Assert.AreEqual(5, inv[0].count);
            Assert.AreEqual(2, inv[1].count);
            Assert.AreEqual(1, inv.Add("sword", 2));           // one slot left, sword stacks to 1
            Assert.AreEqual(7, inv.CountOf("potion"));
        }

        [Test]
        public void Remove_IsAllOrNothing()
        {
            var inv = new Inventory(4, FakeCatalog.Default);
            inv.Add("arrow", 10);
            Assert.IsFalse(inv.Remove("arrow", 11));
            Assert.AreEqual(10, inv.CountOf("arrow"));
            Assert.IsTrue(inv.Remove("arrow", 10));
            Assert.IsTrue(inv[0].IsEmpty);
        }

        [Test]
        public void UnknownId_Throws_AndSlotChangedFires()
        {
            var inv = new Inventory(2, FakeCatalog.Default);
            var changed = new List<int>();
            inv.SlotChanged += changed.Add;
            Assert.Throws<System.ArgumentException>(() => inv.Add("typo", 1));
            inv.Add("potion", 1);
            CollectionAssert.AreEqual(new[] { 0 }, changed);
        }

        [Test]
        public void Restore_DropsIdsTheCatalogNoLongerKnows()
        {
            var inv = new Inventory(3, FakeCatalog.Default);
            var st = new InventoryState { capacity = 3, slots = new List<ItemStack> { new ItemStack("potion", 2), new ItemStack("removed_item", 1) } };
            var dropped = inv.Restore(st);
            CollectionAssert.AreEqual(new[] { "removed_item" }, dropped);
            Assert.AreEqual(2, inv.CountOf("potion"));
        }
    }

    public class HealthTests
    {
        [Test]
        public void Resistance_Invulnerability_And_DeathOnce()
        {
            var h = new HealthModel(100f, invulnerableSeconds: 0.5, multiplier: k => k == DamageKind.Fire ? 0.5f : 1f);
            int deaths = 0;
            h.Died += () => deaths++;
            Assert.AreEqual(20f, h.Apply(new DamageInfo(40f, DamageKind.Fire), now: 0.0), 1e-4);
            Assert.AreEqual(0f, h.Apply(new DamageInfo(40f, DamageKind.Physical), now: 0.2), "inside the invulnerability window");
            Assert.AreEqual(40f, h.Apply(new DamageInfo(40f, DamageKind.Physical), now: 0.6), 1e-4);
            Assert.AreEqual(40f, h.Apply(new DamageInfo(500f, DamageKind.Physical), now: 2.0), 1e-4, "clamped to what is left");
            Assert.IsTrue(h.IsDead);
            h.Apply(new DamageInfo(10f, DamageKind.Physical), now: 5.0);
            Assert.AreEqual(1, deaths, "Died is raised exactly once");
            Assert.AreEqual(0f, h.Heal(10f), "no healing the dead");
        }

        [Test]
        public void Heal_ClampsToMax()
        {
            var h = new HealthModel(50f);
            h.Apply(new DamageInfo(10f, DamageKind.Poison), 0);
            Assert.AreEqual(10f, h.Heal(25f), 1e-4);
            Assert.AreEqual(50f, h.Current, 1e-4);
        }
    }
}
