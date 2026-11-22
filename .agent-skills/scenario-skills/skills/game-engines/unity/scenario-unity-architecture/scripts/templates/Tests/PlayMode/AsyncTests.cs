// PlayMode tests of Awaitable lifetimes: destroyCancellationToken stops a loop on Destroy, the same
// loop without a token keeps running (the trap, pinned), AsTask allows two awaits, SaveAsync hops to a
// background thread and back. Test Framework methods cannot return Awaitable: a [UnityTest] returns
// the inner async Awaitable as its IEnumerator (6.3 Manual, "Asynchronous tests").
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A7).
using System;
using System.Collections;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Game.Core;
using Game.Runtime;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Game.Tests
{
    /// <summary>The trap, on purpose: no token. Stopped by the test through s_Stop.</summary>
    public sealed class LeakyTicker : MonoBehaviour
    {
        public static int Ticks;
        public static volatile bool Stop;
        async Awaitable Start()
        {
            while (!Stop)
            {
                await Awaitable.WaitForSecondsAsync(0.02f);   // CancellationToken.None: survives Destroy
                Ticks++;
            }
        }
    }

    public class AsyncTests
    {
        [UnityTest]
        public IEnumerator Regeneration_Stops_WhenDestroyed()
        {
            var go = new GameObject("RegenProbe");
            var health = go.AddComponent<Health>();
            health.ApplyDamage(new DamageInfo(50f, DamageKind.Physical));
            var regen = go.AddComponent<Regeneration>();
            regen.Configure(health, 0.02f, 1f);

            float t0 = Time.realtimeSinceStartup;
            while (regen.Ticks < 3 && Time.realtimeSinceStartup - t0 < 5f) yield return null;
            Assert.GreaterOrEqual(regen.Ticks, 3, "the loop never ticked");
            Assert.Greater(health.Model.Current, 50f, "healing applied");

            int atDestroy = regen.Ticks;
            UnityEngine.Object.Destroy(go);
            yield return new WaitForSecondsRealtime(0.3f);        // 15 intervals
            Assert.IsTrue(regen.Canceled, "OperationCanceledException reached the catch");
            Assert.AreEqual(atDestroy, regen.Ticks, "no tick after Destroy");
        }

        [UnityTest]
        public IEnumerator WithoutAToken_TheLoopOutlivesItsObject()
        {
            LeakyTicker.Ticks = 0; LeakyTicker.Stop = false;
            var go = new GameObject("LeakyProbe");
            go.AddComponent<LeakyTicker>();
            float t0 = Time.realtimeSinceStartup;
            while (LeakyTicker.Ticks < 2 && Time.realtimeSinceStartup - t0 < 5f) yield return null;
            UnityEngine.Object.Destroy(go);
            yield return null;
            int atDestroy = LeakyTicker.Ticks;
            yield return new WaitForSecondsRealtime(0.3f);
            int after = LeakyTicker.Ticks;
            LeakyTicker.Stop = true;
            yield return new WaitForSecondsRealtime(0.05f);
            Debug.Log("[AsyncTests] leaky ticks after Destroy: " + (after - atDestroy));
            Assert.Greater(after, atDestroy, "expected the documented trap: awaits are not cancelled by Destroy");
        }

        static async Awaitable<int> NextFrameValue(int v, CancellationToken ct)
        {
            await Awaitable.NextFrameAsync(ct);
            return v;
        }

        [UnityTest]
        public IEnumerator AsTask_AllowsSeveralAwaits()
        {
            async Awaitable Impl()
            {
                var task = NextFrameValue(57, CancellationToken.None).AsTask();
                int a = await task;
                int b = await task;                                   // safe on a Task, undefined on an Awaitable
                Assert.AreEqual(57, a);
                Assert.AreEqual(57, b);
                var both = await Task.WhenAll(NextFrameValue(1, default).AsTask(), NextFrameValue(2, default).AsTask());
                CollectionAssert.AreEqual(new[] { 1, 2 }, both);
            }
            return Impl();
        }

        [UnityTest]
        public IEnumerator WaitUntil_HonoursCancellation()
        {
            async Awaitable Impl()
            {
                using var cts = new CancellationTokenSource();
                int frames = 0;
                var waiting = AwaitableExtensions.WaitUntil(() => ++frames > 1000, cts.Token);
                await Awaitable.NextFrameAsync();
                await Awaitable.NextFrameAsync();
                cts.Cancel();
                bool canceled = false;
                try { await waiting; }
                catch (OperationCanceledException) { canceled = true; }
                Assert.IsTrue(canceled);
                Assert.Less(frames, 1000);
            }
            return Impl();
        }

        [UnityTest]
        public IEnumerator SaveAsync_WritesOnABackgroundThread_AndReturnsOnTheMainThread()
        {
            async Awaitable Impl()
            {
                string dir = Path.Combine(Path.GetTempPath(), "arch-save-async-" + Guid.NewGuid().ToString("N"));
                int main = Environment.CurrentManagedThreadId;
                var svc = new SaveService(dir);
                await svc.SaveAsync(new SaveData { health = new HealthState { current = 12, max = 20 } }, "a", CancellationToken.None);
                Assert.AreEqual(main, Environment.CurrentManagedThreadId, "continuation back on the main thread");
                Assert.IsTrue(svc.TryLoad("a", out var d, out _, out var err), err);
                Assert.AreEqual(12f, d.health.current, 1e-4);
                Directory.Delete(dir, true);
            }
            return Impl();
        }

        [Test, Timeout(10000)]
        public async Task AsyncTaskTestMethods_AreSupported()
        {
            int before = Environment.CurrentManagedThreadId;
            await Task.Yield();
            Assert.AreEqual(before, Environment.CurrentManagedThreadId, "UnitySynchronizationContext resumes on the main thread");
        }
    }
}
