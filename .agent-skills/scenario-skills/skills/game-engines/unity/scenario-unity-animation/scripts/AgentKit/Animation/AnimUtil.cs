// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). Unity-safe null handling.
//
// Never use ?? or ?. on a UnityEngine.Object: they test C# null and skip Unity's overloaded == null. In the
// Editor, GetComponent<T>() of a missing component can return a "fake null" object, so
// `go.GetComponent<PlayableDirector>() ?? go.AddComponent<PlayableDirector>()` adds nothing and the next
// access throws MissingComponentException (observed 2026-09-24, PlayableDirector on a new GameObject).
using System;
using UnityEngine;

namespace AgentKit.Animation
{
    public static class AnimUtil
    {
        public static T GetOrAdd<T>(GameObject go) where T : Component
        {
            var c = go.GetComponent<T>();
            return c != null ? c : go.AddComponent<T>();
        }

        public static T Require<T>(T o, string message) where T : UnityEngine.Object
        {
            if (o == null) throw new ArgumentException(message);
            return o;
        }

        public static GameObject FindOrCreate(string name)
        {
            var g = GameObject.Find(name);
            return g != null ? g : new GameObject(name);
        }

        public static T Or<T>(T o, T fallback) where T : UnityEngine.Object => o != null ? o : fallback;
    }
}
