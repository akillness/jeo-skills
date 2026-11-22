// Game.Runtime: ScriptableObject event channels (Ryan Hipple, Unite 2017, raQ3iHhE_Kk [00:32:49]).
// The sender raises an asset; receivers register with the asset; neither knows the other, and a
// prefab dropped into an empty scene still works because the asset exists as soon as it is referenced.
// Rules carried in the code:
//  - Raise iterates BACKWARDS so a listener may unregister itself while being called ([00:33:23]).
//  - Listeners are C# delegates, not UnityEvents: a UnityEvent is "a serialized function call"
//    ([00:29:26]); keep it for rare, designer-wired responses (VoidEventListener), never per frame.
//  - Listener lists are not serialized. With domain reload disabled they survive Play sessions, so
//    every channel is cleared at RuntimeInitializeLoadType.SubsystemRegistration (6.3 Manual,
//    domain-reloading "Resetting state on entering Play mode").
//  - Debug plan ([00:06:00], [00:36:07], [00:55:31]): ListenerCount, RaiseCount, LastRaiseFrame, a
//    "logRaises" toggle (Debug.Log carries the stack trace), RaiseDebug() that sends the serialized
//    debugValue (the inspector's Raise button, Game.EditorTools.EventChannelEditor, and editor scripts
//    or ArchPlayMode "invoke" call it without knowing T).
//  - Concrete channels (VoidEventChannel, FloatEventChannel, StringEventChannel) each live in a file named
//    like the class: a ScriptableObject asset finds its script through that file name.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A6, A11).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace Game.Runtime
{
    public abstract class EventChannelBase : ScriptableObject
    {
        static readonly HashSet<EventChannelBase> s_Loaded = new HashSet<EventChannelBase>();

        [Tooltip("Debug plan: log every Raise with its listener count (the log line carries the stack trace).")]
        [SerializeField] bool logRaises;

        [NonSerialized] int m_RaiseCount;
        [NonSerialized] int m_LastRaiseFrame = -1;

        protected virtual void OnEnable() { s_Loaded.Add(this); }
        protected virtual void OnDisable() { s_Loaded.Remove(this); }

        public abstract int ListenerCount { get; }
        public abstract void ClearListeners();
        /// <summary>Raises the serialized debug value: inspector button, editor scripts, agent jobs.</summary>
        public abstract void RaiseDebug();

        public int RaiseCount => m_RaiseCount;
        public int LastRaiseFrame => m_LastRaiseFrame;
        public bool LogsRaises => logRaises;   // authored in the Inspector; runtime code never writes it

        protected void NoteRaise(int listeners)
        {
            m_RaiseCount++;
            m_LastRaiseFrame = Time.frameCount;
            if (logRaises) Debug.Log("[" + name + "] raised to " + listeners + " listener(s), frame " + m_LastRaiseFrame, this);
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetAllChannels()
        {
            foreach (var c in s_Loaded)
            {
                if (c == null) continue;
                c.ClearListeners();
                c.m_RaiseCount = 0;
                c.m_LastRaiseFrame = -1;
            }
        }
    }

    public abstract class EventChannel<T> : EventChannelBase
    {
        [Tooltip("Value sent by the inspector's Raise button and by RaiseDebug().")]
        [SerializeField] T debugValue;

        [NonSerialized] readonly List<Action<T>> m_Listeners = new List<Action<T>>();

        public override int ListenerCount => m_Listeners.Count;
        public override void ClearListeners() => m_Listeners.Clear();
        public override void RaiseDebug() => Raise(debugValue);

        public void Register(Action<T> listener)
        {
            if (listener != null && !m_Listeners.Contains(listener)) m_Listeners.Add(listener);
        }

        /// <summary>Idempotent: safe to call from both OnDisable and OnDestroy.</summary>
        public void Unregister(Action<T> listener) => m_Listeners.Remove(listener);

        public void Raise(T value)
        {
            NoteRaise(m_Listeners.Count);
            for (int i = m_Listeners.Count - 1; i >= 0; i--)
            {
                if (i >= m_Listeners.Count) continue; // a listener removed several entries
                m_Listeners[i](value);
            }
        }
    }

    [Serializable] public struct Unit { }
}
