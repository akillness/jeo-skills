// Game.Runtime: which cancellation token an await takes (Unity, "Getting Started with Awaitables",
// eXkFPoEp3BA [00:14:00] to [00:16:12]; 6.3 Manual, async-awaitable-continuations Note).
// Awaits are cancelled neither by Destroy nor by leaving Play mode, so every await names its owner:
//  - a MonoBehaviour: destroyCancellationToken, or Linked(this) when the work must also stop at app or
//    Play-mode exit (background IO, network): "using var cts = Lifetime.Linked(this);"
//  - a plain C# service with no GameObject (SaveService, analytics, a network client): App, which is
//    Application.exitCancellationToken. Observed on 6000.3.21f1: it fires at Play exit and a new Play
//    session gets a live token again (procedures.md A8, A11).
// Dispose the linked source when the method ends (the using above); the video does not [added].
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A14).
using System.Threading;
using UnityEngine;

namespace Game.Runtime
{
    public static class Lifetime
    {
        /// <summary>Cancelled when the component is destroyed OR when the application (or Play mode) exits.
        /// Main thread only (destroyCancellationToken). Dispose it.</summary>
        public static CancellationTokenSource Linked(MonoBehaviour owner) =>
            CancellationTokenSource.CreateLinkedTokenSource(owner.destroyCancellationToken, Application.exitCancellationToken);

        /// <summary>For plain C# services that outlive scenes: cancelled at application or Play-mode exit.</summary>
        public static CancellationToken App => Application.exitCancellationToken;
    }
}
