// Game.Runtime: the ONE composition root. It builds the plain C# services and registers them before any
// other script's Awake reads them.
// - Runs first: [DefaultExecutionOrder(-1000)] (git-amend, PJcBJ60C970 [00:12:01]: "the injector runs before
//   everything else"). Without it, the Awake order of different scripts in a loaded scene is not defined
//   (6.3 Manual, execution-order "Limitations"), so a consumer that happens to wake first gets nothing.
// - Fails loudly: a second root, or a consumer asking for an unregistered service, throws
//   (PJcBJ60C970 [00:05:01]; Services.Get).
// - Designers still wire gameplay through serialized ScriptableObject references (Hipple, raQ3iHhE_Kk
//   [00:14:39]); this root only owns services that have no asset (save files, analytics, platform APIs).
// - Services are cleared at SubsystemRegistration (Services.cs), so domain reload off is safe.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A14).
using System;
using System.IO;
using UnityEngine;

namespace Game.Runtime
{
    [DefaultExecutionOrder(-1000)]
    [DisallowMultipleComponent]
    public sealed class GameRoot : MonoBehaviour
    {
        [SerializeField] string saveFolder = "saves";

        SaveService m_Save;

        void Awake()
        {
            if (Services.TryGet<SaveService>(out _))
                throw new InvalidOperationException("a second GameRoot woke up (" + gameObject.scene.name + "): keep one composition root");
            m_Save = new SaveService(Path.Combine(Application.persistentDataPath, saveFolder));
            Services.Register(m_Save);
        }

        // A root in a scene that unloads takes its services with it; a bootstrap root marked
        // DontDestroyOnLoad lives for the whole session.
        void OnDestroy() => Services.Unregister(m_Save);
    }
}
