// EditMode tests: ScriptableObject definitions are valid, and the save round trip goes through a
// FILE with fresh objects (never through the SO), with backup fallback and version migration.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A2, A3).
using System;
using System.Collections.Generic;
using System.IO;
using Game.Core;
using Game.EditorTools;
using Game.Runtime;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Game.Tests
{
    public class DefinitionTests
    {
        internal static T LoadFirst<T>() where T : UnityEngine.Object
        {
            var guids = AssetDatabase.FindAssets("t:" + typeof(T).Name);
            Assert.IsNotEmpty(guids, "no " + typeof(T).Name + " asset in the project: run the CreateAssets job first");
            return AssetDatabase.LoadAssetAtPath<T>(AssetDatabase.GUIDToAssetPath(guids[0]));
        }

        [Test]
        public void ItemDatabase_IsValid()
        {
            var db = LoadFirst<ItemDatabase>();
            var errors = ItemDatabaseValidator.Validate(db);
            Assert.IsEmpty(errors, string.Join("\n", errors));
            Assert.GreaterOrEqual(db.Items.Count, 2);
        }

        [Test]
        public void Validator_CatchesDuplicatedIds()
        {
            var a = ScriptableObject.CreateInstance<ItemDefinition>();
            var b = ScriptableObject.CreateInstance<ItemDefinition>();
            a.EditorSet("same", "A", 1);
            b.EditorSet("same", "B", 1);   // what Ctrl+D on an asset produces
            var db = ScriptableObject.CreateInstance<ItemDatabase>();
            db.EditorSetItems(new List<ItemDefinition> { a, b });
            var errors = ItemDatabaseValidator.Validate(db);
            Assert.AreEqual(1, errors.Count, string.Join("\n", errors));
            StringAssert.Contains("duplicate id", errors[0]);
            UnityEngine.Object.DestroyImmediate(a); UnityEngine.Object.DestroyImmediate(b); UnityEngine.Object.DestroyImmediate(db);
        }
    }

    public class SaveTests
    {
        string m_Dir;

        [SetUp] public void SetUp() { m_Dir = Path.Combine(Path.GetTempPath(), "arch-save-tests-" + Guid.NewGuid().ToString("N")); }
        [TearDown] public void TearDown() { if (Directory.Exists(m_Dir)) Directory.Delete(m_Dir, true); }

        static Dictionary<string, string> Snapshot(ItemDatabase db)
        {
            var d = new Dictionary<string, string> { { "db", EditorJsonUtility.ToJson(db) } };
            foreach (var it in db.Items) d[it.name] = EditorJsonUtility.ToJson(it);
            return d;
        }

        [Test]
        public void RoundTrip_ThroughFile_WithFreshObjects_LeavesDefinitionsUntouched()
        {
            var db = DefinitionTests.LoadFirst<ItemDatabase>();
            var cfg = DefinitionTests.LoadFirst<HealthConfig>();
            var before = Snapshot(db);
            string idA = db.Items[0].Id, idB = db.Items[1].Id;

            // play a little
            var inv = new Inventory(8, db);
            var hp = cfg.CreateModel();
            inv.Add(idA, 3);
            inv.Add(idB, 1);
            hp.Apply(new DamageInfo(30f, DamageKind.Physical), now: 0);

            var svc = new SaveService(m_Dir);
            svc.Save(SaveMapper.Capture(inv, hp, DateTime.UtcNow), "slot1");
            string text = File.ReadAllText(svc.PathFor("slot1"));
            StringAssert.Contains(idA, text, "the file stores stable ids");
            StringAssert.DoesNotContain("instanceID", text, "no object references in a save");
            StringAssert.DoesNotContain("fileID", text);

            // "relaunch": nothing survives but the file
            inv = null; hp = null;
            var svc2 = new SaveService(m_Dir);
            Assert.IsTrue(svc2.TryLoad("slot1", out var data, out var src, out var err), err);
            Assert.AreEqual(SaveService.LoadSource.Main, src);
            var inv2 = new Inventory(8, db);
            var hp2 = cfg.CreateModel();
            var dropped = SaveMapper.Restore(data, inv2, hp2);
            Assert.IsEmpty(dropped);
            Assert.AreEqual(3, inv2.CountOf(idA));
            Assert.AreEqual(1, inv2.CountOf(idB));
            Assert.AreEqual(cfg.maxHealth - 30f * cfg.Multiplier(DamageKind.Physical), hp2.Current, 1e-3);

            CollectionAssert.AreEquivalent(before, Snapshot(db), "gameplay must not write into ScriptableObject definitions");
        }

        [Test]
        public void CorruptMainFile_FallsBackToBackup()
        {
            var svc = new SaveService(m_Dir);
            var first = new SaveData { health = new HealthState { current = 42, max = 100 } };
            svc.Save(first, "slot");
            svc.Save(new SaveData { health = new HealthState { current = 7, max = 100 } }, "slot");   // first becomes .bak
            Assert.IsTrue(File.Exists(svc.PathFor("slot") + ".bak"), "File.Replace kept a backup");
            File.WriteAllText(svc.PathFor("slot"), "{ this is not json");                            // crash mid-write
            Assert.IsTrue(svc.TryLoad("slot", out var data, out var src, out var err));
            Assert.AreEqual(SaveService.LoadSource.Backup, src, err);
            Assert.AreEqual(42f, data.health.current, 1e-4);
        }

        [Test]
        public void Version1_IsMigrated_UnknownVersion_IsRefused()
        {
            Directory.CreateDirectory(m_Dir);
            var svc = new SaveService(m_Dir) { MaxHealthForMigration = 80f, InventoryCapacityForMigration = 12 };
            File.WriteAllText(svc.PathFor("old"), "{\"version\":1,\"items\":[{\"itemId\":\"potion\",\"count\":2}],\"hp\":95}");
            Assert.IsTrue(svc.TryLoad("old", out var d, out _, out var err), err);
            Assert.AreEqual(SaveData.CurrentVersion, d.version);
            Assert.AreEqual(12, d.inventory.capacity);
            Assert.AreEqual("potion", d.inventory.slots[0].itemId);
            Assert.AreEqual(80f, d.health.current, 1e-4, "clamped to the new max");

            File.WriteAllText(svc.PathFor("future"), "{\"version\":9}");
            Assert.IsFalse(svc.TryLoad("future", out _, out _, out var err2));
            StringAssert.Contains("unknown save version 9", err2);
            Assert.IsFalse(svc.TryLoad("missing", out _, out _, out var err3));
            StringAssert.Contains("missing", err3);
        }
    }
}
