// Game.Runtime: designer-facing listener (Hipple's GameEventListener): the prefab declares which
// outside message it listens to and wires its own response in the Inspector.
// Why OnDestroy too: the Upgrade to Unity 6.4 guide says that before 6.4 Object.Destroy called OnDisable
// only on the destroyed object and its DIRECT children, so a listener nested deeper never unregistered
// and left a dead entry. On 6000.3.21f1 OnDisable already reached every level (observed, procedures.md
// A6); an older 6.x editor may still have the old behavior and Remove is idempotent, so both hooks unregister.
// UnityEvent is a serialized function call, not an event: fine for rare, designer-wired responses,
// never for per-frame traffic (Hipple [00:29:26], [00:32:15]).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using UnityEngine;
using UnityEngine.Events;

namespace Game.Runtime
{
    public sealed class VoidEventListener : MonoBehaviour
    {
        [SerializeField] VoidEventChannel channel;
        [SerializeField] UnityEvent response = new UnityEvent();

        public int Received { get; private set; }
        public VoidEventChannel Channel => channel;
        public UnityEvent Response => response;

        public void Bind(VoidEventChannel c)
        {
            if (isActiveAndEnabled && channel != null) channel.Unregister(OnRaised);
            channel = c;
            if (isActiveAndEnabled && channel != null) channel.Register(OnRaised);
        }

        void OnEnable() { if (channel != null) channel.Register(OnRaised); }
        void OnDisable() { if (channel != null) channel.Unregister(OnRaised); }
        void OnDestroy() { if (channel != null) channel.Unregister(OnRaised); } // 6.3: see header

        void OnRaised(Unit _)
        {
            Received++;
            response.Invoke();
        }
    }
}
