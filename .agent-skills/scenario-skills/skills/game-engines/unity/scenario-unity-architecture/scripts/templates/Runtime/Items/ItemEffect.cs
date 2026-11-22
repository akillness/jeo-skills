// Game.Runtime: polymorphic item effects stored inline in an ItemDefinition through [SerializeReference]
// (Game Dev Guide, mCKeSNdO_S0 [00:07:01], [00:07:34]: without it a List<Base> serializes every entry as
// the base type and loses the derived fields).
// Refactor rules (all run on 6000.3.21f1, procedures.md A13):
//  - Renaming or moving an effect class orphans the stored data ("unknown managed type") unless the new
//    class carries [MovedFrom(autoUpdateAPI: false, sourceClassName: "OldName")] (UnityEngine.Scripting.APIUpdating;
//    mCKeSNdO_S0 [00:11:38]). [FormerlySerializedAs] only covers FIELD renames.
//  - Every type used through [SerializeReference], and its ancestors, is marked [Serializable]: required from
//    6.4 per the version notes [unverified there]; 6.3 behavior is recorded in procedures.md A13.
//  - Plain classes (not MonoBehaviour or ScriptableObject) may share a file; the file-name rule does not apply.
// Agents author the list with ArchJobs.CreateAssets "managed_refs" (SerializedProperty.managedReferenceValue).
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using System;
using UnityEngine;

namespace Game.Runtime
{
    [Serializable]
    public abstract class ItemEffect
    {
        public abstract string Describe();
    }

    [Serializable]
    public sealed class HealEffect : ItemEffect
    {
        [Min(0)] public float amount = 10f;
        public override string Describe() => "heal " + amount;
    }

    [Serializable]
    public sealed class GrantItemEffect : ItemEffect
    {
        public string itemId;
        [Min(1)] public int count = 1;
        public override string Describe() => "grant " + count + " x " + itemId;
    }
}
