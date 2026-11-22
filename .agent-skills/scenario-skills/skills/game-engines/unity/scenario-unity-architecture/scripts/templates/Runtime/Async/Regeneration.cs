// Game.Runtime: an Awaitable loop tied to its object's lifetime.
// Awaits are NOT cancelled when the GameObject is destroyed, nor when Play mode ends (Unity,
// "Getting Started with Awaitables", eXkFPoEp3BA [00:13:28]): pass destroyCancellationToken to every
// await and catch OperationCanceledException. Proven on this Mac: procedures.md A7 (the same loop
// without the token keeps ticking after Destroy).
// `async Awaitable Start()` (not async void) is the 6.3 Manual's entry pattern.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System;
using UnityEngine;

namespace Game.Runtime
{
    public sealed class Regeneration : MonoBehaviour
    {
        [SerializeField] Health health;
        [SerializeField, Min(0.01f)] float interval = 0.5f;
        [SerializeField] float amountPerTick = 1f;

        public int Ticks { get; private set; }
        public bool Canceled { get; private set; }
        public event Action<int> Ticked;

        public void Configure(Health h, float everySeconds, float amount)
        {
            health = h; interval = everySeconds; amountPerTick = amount;
        }

        async Awaitable Start()
        {
            var token = destroyCancellationToken;   // raised when this component is destroyed
            try
            {
                while (true)
                {
                    await Awaitable.WaitForSecondsAsync(interval, token);
                    Ticks++;
                    if (health != null) health.Heal(amountPerTick);
                    Ticked?.Invoke(Ticks);
                }
            }
            catch (OperationCanceledException)
            {
                Canceled = true;   // expected on destroy: not an error
            }
        }
    }
}
