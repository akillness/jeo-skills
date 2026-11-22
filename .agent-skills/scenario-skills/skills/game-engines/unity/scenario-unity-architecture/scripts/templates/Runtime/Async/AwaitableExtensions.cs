// Game.Runtime: Awaitable helpers (Unity 6.3 Manual, async-awaitable-examples).
// - An Awaitable is POOLED: awaiting the same instance twice is undefined (exception or hang).
//   Wrap it once with AsTask() when several consumers await it or for Task.WhenAll / WhenAny; that
//   costs one Task allocation.
// - WaitUntil with a token replaces the coroutine WaitUntil.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A7).
using System;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace Game.Runtime
{
    public static class AwaitableExtensions
    {
        public static async Task AsTask(this Awaitable a) { await a; }
        public static async Task<T> AsTask<T>(this Awaitable<T> a) { return await a; }

        public static async Awaitable WaitUntil(Func<bool> condition, CancellationToken token)
        {
            while (!condition())
            {
                token.ThrowIfCancellationRequested();
                await Awaitable.NextFrameAsync(token);
            }
        }
    }
}
