// PlayMode tests of runtime sets (Hipple, raQ3iHhE_Kk [00:40:40]; procedures.md A14): members register on
// enable, leave on disable, and leave when a root several levels above them is destroyed; the save code
// reads ids from the set, never from a scene search.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System.Collections;
using Game.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Game.Tests
{
    public class RuntimeSetTests
    {
        SaveableSet m_Set;

        [SetUp] public void SetUp() { m_Set = ScriptableObject.CreateInstance<SaveableSet>(); }
        [TearDown] public void TearDown() { Object.Destroy(m_Set); }

        SaveableEntity Spawn(string id, Transform parent = null)
        {
            var go = new GameObject("Saveable_" + id);
            if (parent != null) go.transform.SetParent(parent);
            var e = go.AddComponent<SaveableEntity>();
            e.Bind(m_Set, id);
            return e;
        }

        [UnityTest]
        public IEnumerator Members_Register_Unregister_AndLeaveWithADestroyedRoot()
        {
            var a = Spawn("a");
            var root = new GameObject("Root");
            var mid = new GameObject("Mid"); mid.transform.SetParent(root.transform);
            var deep = new GameObject("Deep"); deep.transform.SetParent(mid.transform);
            Spawn("b", deep.transform);                     // three levels under Root
            var c = Spawn("c");
            yield return null;
            CollectionAssert.AreEqual(new[] { "a", "b", "c" }, m_Set.Ids());

            c.gameObject.SetActive(false);
            Assert.AreEqual(2, m_Set.Count, "disabled members leave");
            c.gameObject.SetActive(true);
            Assert.AreEqual(3, m_Set.Count, "and come back");

            Object.Destroy(root);
            yield return null;
            CollectionAssert.AreEquivalent(new[] { "a", "c" }, m_Set.Ids(), "a member deep under a destroyed root left the set");

            Object.Destroy(a.gameObject);
            Object.Destroy(c.gameObject);
            yield return null;
            Assert.AreEqual(0, m_Set.Count);
        }
    }
}
