// Game.Runtime: the runtime set of every saveable object currently alive (see RuntimeSet.cs).
// The save code iterates Items (stable ids) instead of searching the scene.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A14).
using System.Collections.Generic;
using UnityEngine;

namespace Game.Runtime
{
    [CreateAssetMenu(menuName = "Game/Sets/Saveable Set", fileName = "SET_Saveables")]
    public sealed class SaveableSet : RuntimeSet<SaveableEntity>
    {
        /// <summary>Ids of the live members, in registration order.</summary>
        public List<string> Ids()
        {
            var ids = new List<string>(Count);
            foreach (var e in Items) if (e != null) ids.Add(e.Id);
            return ids;
        }
    }
}
