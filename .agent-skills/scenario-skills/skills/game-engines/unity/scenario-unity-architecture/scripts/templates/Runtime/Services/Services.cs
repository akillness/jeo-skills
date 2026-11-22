// Game.Runtime: a minimal service registry filled by ONE composition root (a bootstrap scene or the
// first scene's GameRoot), for plain C# services (save, audio routing, analytics).
// Trade-offs (see references/expert-notes.md, "Singletons, services, injection"):
// - Serialized ScriptableObject references are the injector designers can see (Hipple, raQ3iHhE_Kk
//   [00:14:39]); prefer them for anything designers wire.
// - This registry fails loudly on a missing service (git-amend, PJcBJ60C970 [00:05:01]) and is reset
//   at SubsystemRegistration, so it is safe with domain reload disabled (6.3 Manual).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Game.Runtime
{
    public static class Services
    {
        static readonly Dictionary<Type, object> s_Map = new Dictionary<Type, object>();

        public static void Register<T>(T service) where T : class
        {
            if (service == null) throw new ArgumentNullException(nameof(service));
            s_Map[typeof(T)] = service;
        }

        public static T Get<T>() where T : class
        {
            if (s_Map.TryGetValue(typeof(T), out var s)) return (T)s;
            throw new InvalidOperationException("service not registered: " + typeof(T).Name +
                                                " (register it in the composition root before use)");
        }

        public static bool TryGet<T>(out T service) where T : class
        {
            service = s_Map.TryGetValue(typeof(T), out var s) ? (T)s : null;
            return service != null;
        }

        /// <summary>Removes a service only if it is the given instance (a composition root cleaning up after itself).</summary>
        public static bool Unregister<T>(T service) where T : class
        {
            if (s_Map.TryGetValue(typeof(T), out var s) && ReferenceEquals(s, service)) return s_Map.Remove(typeof(T));
            return false;
        }

        public static int Count => s_Map.Count;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_Map.Clear();
    }
}
