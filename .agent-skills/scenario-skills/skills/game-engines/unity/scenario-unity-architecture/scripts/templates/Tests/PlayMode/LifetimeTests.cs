// PlayMode tests of await owners (procedures.md A14): Lifetime.Linked(this) stops on Destroy like
// destroyCancellationToken and also carries Application.exitCancellationToken (live during Play); a plain
// C# service call with a cancelled token throws before it writes anything.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System;
using System.Collections;
using System.IO;
using System.Threading;
using Game.Core;
using Game.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Game.Tests
{
    public sealed class LinkedLoop : MonoBehaviour
    {
        public int Ticks;
        public bool Canceled;
        async Awaitable Start()
        {
            using var cts = Lifetime.Linked(this);     // destroy OR app / Play-mode exit
            try
            {
                while (true) { await Awaitable.WaitForSecondsAsync(0.02f, cts.Token); Ticks++; }
            }
            catch (OperationCanceledException) { Canceled = true; }
        }
    }

    public class LifetimeTests
    {
        [UnityTest]
        public IEnumerator LinkedToken_StopsOnDestroy()
        {
            Assert.IsFalse(Application.exitCancellationToken.IsCancellationRequested, "a live exit token during Play");
            var go = new GameObject("LinkedLoop");
            var loop = go.AddComponent<LinkedLoop>();
            float t0 = Time.realtimeSinceStartup;
            while (loop.Ticks < 3 && Time.realtimeSinceStartup - t0 < 5f) yield return null;
            int atDestroy = loop.Ticks;
            UnityEngine.Object.Destroy(go);
            yield return new WaitForSecondsRealtime(0.3f);
            Assert.GreaterOrEqual(atDestroy, 3);
            Assert.IsTrue(loop.Canceled);
            Assert.AreEqual(atDestroy, loop.Ticks, "no tick after Destroy");
        }

        [UnityTest]
        public IEnumerator ServiceCall_WithACancelledToken_WritesNothing()
        {
            async Awaitable Impl()
            {
                string dir = Path.Combine(Path.GetTempPath(), "arch-lifetime-" + Guid.NewGuid().ToString("N"));
                var svc = new SaveService(dir);
                using var cts = new CancellationTokenSource();
                cts.Cancel();
                bool canceled = false;
                try { await svc.SaveAsync(new SaveData(), "slot", cts.Token); }
                catch (OperationCanceledException) { canceled = true; }
                Assert.IsTrue(canceled);
                Assert.IsFalse(File.Exists(svc.PathFor("slot")), "nothing written");
            }
            return Impl();
        }
    }
}
