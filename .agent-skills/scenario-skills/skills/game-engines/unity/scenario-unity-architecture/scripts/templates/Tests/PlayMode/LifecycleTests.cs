// PlayMode tests of lifecycle facts behind "unregister in OnDisable" patterns: which objects of a
// destroyed hierarchy get OnDisable and OnDestroy, and what that does to event channel listeners nested
// deeper than one level. The Upgrade to Unity 6.4 guide says that before 6.4 Object.Destroy called
// OnDisable only on the object and its direct children; on 6000.3.21f1 it reached every level
// (observed 2026-09-24), so the behavior depends on the exact editor version: these tests pin it, and
// listeners unregister in OnDestroy too. Also: a listener may unregister itself mid-Raise.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A6).
using System.Collections;
using System.Collections.Generic;
using Game.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Game.Tests
{
    public sealed class LifecycleProbe : MonoBehaviour
    {
        public static readonly List<string> Log = new List<string>();
        void OnDisable() => Log.Add("OnDisable:" + name);
        void OnDestroy() => Log.Add("OnDestroy:" + name);
    }

    /// <summary>The common pattern, on purpose: unregisters in OnDisable only.</summary>
    public sealed class OnDisableOnlyListener : MonoBehaviour
    {
        public VoidEventChannel channel;
        public static int Calls;
        void OnEnable() { if (channel != null) channel.Register(OnRaised); }
        void OnDisable() { if (channel != null) channel.Unregister(OnRaised); }
        void OnRaised(Unit _) => Calls++;
    }

    public class LifecycleTests
    {
        static GameObject Chain(string prefix, int depth, System.Action<GameObject> addAtLeaf = null, bool probes = true)
        {
            GameObject root = null, parent = null;
            for (int i = 0; i < depth; i++)
            {
                var go = new GameObject(prefix + i);
                if (parent != null) go.transform.SetParent(parent.transform);
                if (probes) go.AddComponent<LifecycleProbe>();
                if (root == null) root = go;
                parent = go;
            }
            addAtLeaf?.Invoke(parent);
            return root;
        }

        [UnityTest]
        public IEnumerator Destroy_OnDisableAndOnDestroyReachEveryLevel_On6000_3_21()
        {
            LifecycleProbe.Log.Clear();
            var root = Chain("D", 4);                  // D0 > D1 > D2 > D3
            yield return null;
            Object.Destroy(root);
            yield return null;
            var log = string.Join(", ", LifecycleProbe.Log);
            Debug.Log("[LifecycleTests] Destroy: " + log);
            foreach (var n in new[] { "D0", "D1", "D2", "D3" }) Assert.Contains("OnDestroy:" + n, LifecycleProbe.Log, log);
            // 6.4 guide: "Previously, OnDisable was only invoked for components on the GameObject itself and
            // its direct children". 6000.3.21f1 already reaches D2 and D3: if this fails on another
            // editor, that editor has the old behavior and OnDisable-only unregistration leaks.
            foreach (var n in new[] { "D0", "D1", "D2", "D3" }) Assert.Contains("OnDisable:" + n, LifecycleProbe.Log, log);
            Assert.Less(LifecycleProbe.Log.IndexOf("OnDisable:D3"), LifecycleProbe.Log.IndexOf("OnDestroy:D0"), "every OnDisable before any OnDestroy");
        }

        [UnityTest]
        public IEnumerator SetActiveFalse_OnDisableReachesAllDescendants()
        {
            LifecycleProbe.Log.Clear();
            var root = Chain("S", 4);
            yield return null;
            root.SetActive(false);
            var log = string.Join(", ", LifecycleProbe.Log);
            foreach (var n in new[] { "S0", "S1", "S2", "S3" }) Assert.Contains("OnDisable:" + n, LifecycleProbe.Log, log);
            Object.Destroy(root);
            yield return null;
        }

        [UnityTest]
        public IEnumerator NestedListeners_AreUnregistered_WithOnDisableOnly_AndWithOnDestroy()
        {
            var chA = ScriptableObject.CreateInstance<VoidEventChannel>();
            var chB = ScriptableObject.CreateInstance<VoidEventChannel>();
            OnDisableOnlyListener.Calls = 0;

            var rootA = Chain("A", 3, leaf => { leaf.SetActive(false); var l = leaf.AddComponent<OnDisableOnlyListener>(); l.channel = chA; leaf.SetActive(true); }, probes: false);
            var rootB = Chain("B", 3, leaf => leaf.AddComponent<VoidEventListener>().Bind(chB), probes: false);
            yield return null;
            Assert.AreEqual(1, chA.ListenerCount);
            Assert.AreEqual(1, chB.ListenerCount);

            Object.Destroy(rootA);
            Object.Destroy(rootB);
            yield return null;
            Debug.Log("[LifecycleTests] listeners after Destroy: OnDisable-only=" + chA.ListenerCount + ", OnDisable+OnDestroy=" + chB.ListenerCount);
            Assert.AreEqual(0, chB.ListenerCount, "OnDisable + OnDestroy unregistration cleans up");
            Assert.AreEqual(0, chA.ListenerCount, "6000.3.21f1: the grandchild got OnDisable too (with the pre-6.4 behavior the 6.4 guide describes, this entry would stay)");
            chA.Raise();
            Assert.AreEqual(0, OnDisableOnlyListener.Calls, "no call reaches a destroyed listener");
            Object.DestroyImmediate(chA); Object.DestroyImmediate(chB);
        }

        [Test]
        public void Raise_ToleratesAListenerThatUnregistersItself()
        {
            var ch = ScriptableObject.CreateInstance<StringEventChannel>();
            var got = new List<string>();
            System.Action<string> self = null;
            self = s => { got.Add("self"); ch.Unregister(self); };
            ch.Register(s => got.Add("first"));
            ch.Register(self);
            ch.Register(s => got.Add("last"));
            ch.Raise("x");
            CollectionAssert.AreEquivalent(new[] { "first", "self", "last" }, got);
            Assert.AreEqual(2, ch.ListenerCount);
            Object.DestroyImmediate(ch);
        }
    }
}
