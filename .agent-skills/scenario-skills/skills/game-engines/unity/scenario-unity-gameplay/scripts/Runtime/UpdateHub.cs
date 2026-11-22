// scenario-unity-gameplay runtime (Unity Expert Skills v0.2, 2026-09-24). Scene singleton that ticks one
// UpdateRegistry (UpdateRegistry.cs) early in the frame, with the lifecycle hygiene Survival Kids
// insists on (Unite 2025, ZkvK0mX-id4):
//  - the static Instance and the static type keys are reset in SubsystemRegistration, so "Enter Play
//    Mode without domain reload" (6.3: Project Settings > Editor > When entering Play Mode; the default
//    for new projects from 6.6) never sees last session's hub [00:18:04];
//  - a second hub in the scene refuses to become Instance and logs an error;
//  - objects register in Awake or OnEnable through SafeRegister and unregister in OnDestroy or
//    OnDisable through SafeUnregister, which first checks that the hub still exists, because
//    teardown order is not guaranteed [00:19:07].
// Without Entities this MonoBehaviour is the "system"; with Entities 1.4 the same registry lives in a
// SystemBase in SimulationSystemGroup (the talk's version) [00:15:53].
using UnityEngine;

namespace AgentKit.Gameplay
{
    [DefaultExecutionOrder(-90)]
    public class UpdateHub : MonoBehaviour
    {
        public static UpdateHub Instance { get; private set; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        public static void ResetStatics()
        {
            Instance = null;
            UpdateRegistry.ResetStaticKeys();
        }

        [Tooltip("Group updates by concrete type. Off = registration order (for A/B measurements).")]
        public bool sortByType = true;

        public readonly UpdateRegistry registry = new UpdateRegistry(1024);

        void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Debug.LogError("[UpdateHub] a second hub in the scene: " + name + " (keep one)");
                enabled = false;
                return;
            }
            Instance = this;
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        void Update()
        {
            registry.sortByType = sortByType;
            registry.Tick(Time.deltaTime);
        }

        /// <summary>Register with the scene hub if there is one; false when there is none.</summary>
        public static bool SafeRegister(IManualUpdate u) => Instance != null && Instance.registry.Register(u);

        /// <summary>Unregister if the hub still exists (it may be destroyed first on scene unload).</summary>
        public static bool SafeUnregister(IManualUpdate u) => Instance != null && Instance.registry.Unregister(u);
    }
}
