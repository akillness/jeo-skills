// EditMode tests of three data rules (procedures.md A13, A14):
//  - runtime modifiers apply to a struct COPY of the definition, never to the ScriptableObject (Tarodev,
//    tE1qH8OxO2Y [00:11:18]);
//  - polymorphic [SerializeReference] effects survive a serialization round trip of the asset with their
//    concrete types and fields (Game Dev Guide, mCKeSNdO_S0 [00:07:34]);
//  - what JsonUtility does with a [SerializeReference] field in a plain save class (recorded, so save
//    DTOs are designed from the observed behavior, not from memory).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System;
using System.Collections.Generic;
using Game.Core;
using Game.Runtime;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace Game.Tests
{
    [Serializable]
    public class PolySaveProbe
    {
        [SerializeReference] public List<ItemEffect> effects = new List<ItemEffect>();
    }

    public class DataRulesTests
    {
        [Test]
        public void RuntimeModifiers_ChangeACopy_NotTheDefinition()
        {
            var cfg = ScriptableObject.CreateInstance<HealthConfig>();
            cfg.maxHealth = 100f;
            var boosted = cfg.Stats.Scaled(2f);                     // a potion doubles max health this run
            var model = cfg.CreateModel(boosted);
            Assert.AreEqual(200f, model.Max, 1e-4);
            Assert.AreEqual(100f, cfg.maxHealth, 1e-4, "the asset is untouched");
            Assert.AreEqual(100f, cfg.Stats.maxHealth, 1e-4);
            UnityEngine.Object.DestroyImmediate(cfg);
        }

        [Test]
        public void SerializeReference_Effects_KeepTheirConcreteTypes()
        {
            var def = ScriptableObject.CreateInstance<ItemDefinition>();
            var so = new SerializedObject(def);
            var list = so.FindProperty("effects");
            list.arraySize = 2;
            list.GetArrayElementAtIndex(0).managedReferenceValue = new HealEffect { amount = 25f };
            list.GetArrayElementAtIndex(1).managedReferenceValue = new GrantItemEffect { itemId = "arrow", count = 3 };
            so.ApplyModifiedPropertiesWithoutUndo();

            string json = EditorJsonUtility.ToJson(def);
            var copy = ScriptableObject.CreateInstance<ItemDefinition>();
            EditorJsonUtility.FromJsonOverwrite(json, copy);
            Assert.AreEqual(2, copy.Effects.Count);
            Assert.IsInstanceOf<HealEffect>(copy.Effects[0]);
            Assert.AreEqual(25f, ((HealEffect)copy.Effects[0]).amount, 1e-4);
            Assert.IsInstanceOf<GrantItemEffect>(copy.Effects[1]);
            Assert.AreEqual("heal 25", copy.Effects[0].Describe());
            UnityEngine.Object.DestroyImmediate(def);
            UnityEngine.Object.DestroyImmediate(copy);
        }

        [Test]
        public void JsonUtility_WithSerializeReference_InAPlainSaveClass()
        {
            var probe = new PolySaveProbe();
            probe.effects.Add(new HealEffect { amount = 7f });
            probe.effects.Add(new GrantItemEffect { itemId = "potion_small", count = 2 });
            string json = JsonUtility.ToJson(probe);
            var back = JsonUtility.FromJson<PolySaveProbe>(json);
            string types = back.effects == null ? "null" : string.Join(",", back.effects.ConvertAll(e => e == null ? "null" : e.GetType().Name));
            Debug.Log("[JsonUtility+SerializeReference] json=" + json + " | restored types=" + types);
            Assert.IsNotNull(back.effects);
            Assert.AreEqual(2, back.effects.Count, "entries kept");
            Assert.IsInstanceOf<HealEffect>(back.effects[0], "JsonUtility restores the concrete type (observed on 6000.3.21f1)");
            Assert.AreEqual(7f, ((HealEffect)back.effects[0]).amount, 1e-4);
        }
    }
}
