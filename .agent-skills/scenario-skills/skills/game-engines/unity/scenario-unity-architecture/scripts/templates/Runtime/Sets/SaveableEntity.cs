// Game.Runtime: a scene object the save system must find. It registers itself into a SaveableSet asset
// (Hipple's runtime set, raQ3iHhE_Kk [00:40:40]); the save code reads the set, never FindObjectsByType.
// - Stable string id, generated once in the Editor. Duplicating an object duplicates its id: validate
//   uniqueness per scene (as ItemDatabaseValidator does for item ids).
// - Unregisters in OnDisable AND OnDestroy (idempotent). On 6000.3.21f1 Object.Destroy reached OnDisable on
//   every level of a destroyed hierarchy (verified live, procedures.md A6); the 6.4 upgrade guide says
//   earlier editors stopped at direct children, so OnDestroy keeps the set clean there too.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A14).
using UnityEngine;

namespace Game.Runtime
{
    [DisallowMultipleComponent]
    public sealed class SaveableEntity : MonoBehaviour
    {
        [SerializeField] string id;
        [SerializeField] SaveableSet set;

        public string Id => id;
        public SaveableSet Set => set;

        /// <summary>For objects spawned at runtime (and tests): bind before or after enabling.</summary>
        public void Bind(SaveableSet s, string newId)
        {
            if (isActiveAndEnabled && set != null) set.Remove(this);
            set = s;
            id = newId;
            if (isActiveAndEnabled && set != null) set.Add(this);
        }

        void OnEnable() { if (set != null) set.Add(this); }
        void OnDisable() { if (set != null) set.Remove(this); }
        void OnDestroy() { if (set != null) set.Remove(this); }

#if UNITY_EDITOR
        void OnValidate()
        {
            if (string.IsNullOrEmpty(id))
            {
                id = System.Guid.NewGuid().ToString("N");
                UnityEditor.EditorUtility.SetDirty(this); // only on a real change: no spurious diffs
            }
        }
#endif
    }
}
