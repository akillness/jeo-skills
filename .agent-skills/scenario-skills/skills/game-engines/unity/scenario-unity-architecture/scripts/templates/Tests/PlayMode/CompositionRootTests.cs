// PlayMode test of the composition root (procedures.md A14): a consumer that asks for a service in its
// Awake gets it even when its GameObject is created BEFORE the root, because GameRoot carries
// [DefaultExecutionOrder(-1000)] (git-amend, PJcBJ60C970 [00:12:01]); a second root fails loudly.
// A control without the attribute, same creation order, finds nothing (observed). The scene-load case
// (consumer first in the hierarchy) is proven by ArchPlayMode.DoublePlay, procedures.md A11.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System.Collections;
using System.Text.RegularExpressions;
using Game.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Game.Tests
{
    public sealed class SaveConsumer : MonoBehaviour
    {
        public bool FoundInAwake;
        void Awake() { FoundInAwake = Services.TryGet<SaveService>(out _); }
    }

    // control: the same pattern WITHOUT [DefaultExecutionOrder]
    public sealed class ControlService { }
    public sealed class UnorderedRoot : MonoBehaviour
    {
        ControlService m_S;
        void Awake() { m_S = new ControlService(); Services.Register(m_S); }
        void OnDestroy() => Services.Unregister(m_S);
    }
    public sealed class ControlConsumer : MonoBehaviour
    {
        public bool FoundInAwake;
        void Awake() { FoundInAwake = Services.TryGet<ControlService>(out _); }
    }

    public class CompositionRootTests
    {
        [UnityTest]
        public IEnumerator Root_WakesBeforeItsConsumers_AndASecondRootFails()
        {
            var parent = new GameObject("Level");
            parent.SetActive(false);
            var consumerGo = new GameObject("Consumer"); consumerGo.transform.SetParent(parent.transform);
            var consumer = consumerGo.AddComponent<SaveConsumer>();         // added FIRST
            var rootGo = new GameObject("GameRoot"); rootGo.transform.SetParent(parent.transform);
            rootGo.AddComponent<GameRoot>();
            parent.SetActive(true);                                          // both wake now
            yield return null;
            Debug.Log("[CompositionRoot] consumer found the service in Awake on activation: " + consumer.FoundInAwake);
            Assert.IsTrue(consumer.FoundInAwake, "GameRoot's Awake ran first ([DefaultExecutionOrder(-1000)])");

            LogAssert.Expect(LogType.Exception, new Regex("a second GameRoot woke up"));
            var second = new GameObject("SecondRoot");
            second.AddComponent<GameRoot>();
            yield return null;

            Object.Destroy(second);
            Object.Destroy(parent);
            yield return null;
            Assert.IsFalse(Services.TryGet<SaveService>(out _), "the root unregistered its services on destroy");

            // control without the attribute: same creation order, consumer first
            var level2 = new GameObject("Level2");
            level2.SetActive(false);
            var cc = new GameObject("ControlConsumer"); cc.transform.SetParent(level2.transform);
            var control = cc.AddComponent<ControlConsumer>();
            var ur = new GameObject("UnorderedRoot"); ur.transform.SetParent(level2.transform);
            ur.AddComponent<UnorderedRoot>();
            level2.SetActive(true);
            yield return null;
            Debug.Log("[CompositionRoot] control without [DefaultExecutionOrder]: consumer found the service in Awake: " + control.FoundInAwake);
            Object.Destroy(level2);
            yield return null;
            Assert.IsFalse(control.FoundInAwake, "control (observed on 6000.3.21f1): without the attribute the consumer created first wakes first and finds nothing");
        }
    }
}
