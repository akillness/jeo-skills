// Game.Runtime: runtime sets, the live registries of a game (Ryan Hipple, raQ3iHhE_Kk [00:40:06], [00:40:40]).
// Objects add themselves in OnEnable and remove themselves in OnDisable; systems (save, targeting, a UI
// counter) read the set. This replaces tags, FindObjectsByType and "Manager.Instance.Register" calls: there
// is no initialization race, because the asset exists as soon as something references it, and a designer
// makes a new list by creating a new set asset.
// Rules carried in the code:
//  - Items are [NonSerialized]: session state held by an asset, never saved in it (Code Monkey, 5a-ztc5gcFw),
//    so the in-memory SO guard (EditorJsonUtility) does not see membership changes as definition writes.
//  - Every loaded set is cleared at SubsystemRegistration: with domain reload disabled a set would
//    otherwise keep dead entries from the previous Play session (6.3 Manual, domain-reloading).
//  - Members also remove themselves in OnDestroy (idempotent), see SaveableEntity.
// Concrete sets (SaveableSet) live in files named like the class: a generic ScriptableObject cannot be an asset.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A14).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Game.Runtime
{
    public abstract class RuntimeSetBase : ScriptableObject
    {
        static readonly HashSet<RuntimeSetBase> s_Loaded = new HashSet<RuntimeSetBase>();

        protected virtual void OnEnable() { s_Loaded.Add(this); }
        protected virtual void OnDisable() { s_Loaded.Remove(this); }

        public abstract int Count { get; }
        public abstract void Clear();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetAllSets()
        {
            foreach (var s in s_Loaded) if (s != null) s.Clear();
        }
    }

    public abstract class RuntimeSet<T> : RuntimeSetBase where T : class
    {
        [NonSerialized] readonly List<T> m_Items = new List<T>();

        public IReadOnlyList<T> Items => m_Items;
        public override int Count => m_Items.Count;
        public override void Clear() => m_Items.Clear();

        public bool Add(T item)
        {
            if (item == null || m_Items.Contains(item)) return false;
            m_Items.Add(item);
            return true;
        }

        /// <summary>Idempotent: safe from OnDisable and OnDestroy.</summary>
        public bool Remove(T item) => m_Items.Remove(item);
    }
}
