// scenario-unity-ui runtime (Unity Expert Skills v0.1, 2026-09-24). UI in its own scene, loaded additively
// over any level (Jason Weimann, 6ztY9-IX3Qg [00:04:31]): one UI to maintain, no per-level copies or
// prefab overrides, designers edit UI without touching level files. The UI scene holds the only
// EventSystem; levels hold none. Loads with Awaitable.FromAsyncOperation (the 6.x idiom); the level
// stays the active scene so its lighting applies ([00:37:34]).
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;

namespace AgentUI
{
    public class UILoader : MonoBehaviour
    {
        [SerializeField] string uiScene = "UI_Menu";
        [SerializeField] bool loadOnStart = true;

        public string UIScene { get => uiScene; set => uiScene = value; }
        public bool LoadOnStart { get => loadOnStart; set => loadOnStart = value; }
        public bool IsLoaded => SceneManager.GetSceneByName(uiScene).isLoaded;
        bool m_Busy;

        async void Start()
        {
            if (loadOnStart) await Load();
        }

        /// <summary>Idempotent: a second call while loading returns at once (two overlapping additive
        /// loads give two UI scenes and two EventSystems: observed 2026-09-24 in the Play Mode test).</summary>
        public async Awaitable Load()
        {
            if (IsLoaded || m_Busy) return;
            m_Busy = true;
            try
            {
                var active = SceneManager.GetActiveScene();
                var op = SceneManager.LoadSceneAsync(uiScene, LoadSceneMode.Additive);
                if (op == null) { Debug.LogError("UILoader: scene not in the build list: " + uiScene); return; }
                await Awaitable.FromAsyncOperation(op);
                SceneManager.SetActiveScene(active); // lighting and instantiation stay in the level
            }
            finally { m_Busy = false; }
        }

        public async Awaitable Unload()
        {
            if (!IsLoaded || m_Busy) return;
            m_Busy = true;
            try { await Awaitable.FromAsyncOperation(SceneManager.UnloadSceneAsync(uiScene)); }
            finally { m_Busy = false; }
        }

        /// <summary>Exactly one EventSystem across all loaded scenes (an audit and a Play Mode test call it).</summary>
        public static int EventSystemCount()
        {
            return FindObjectsByType<EventSystem>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length;
        }
    }
}
