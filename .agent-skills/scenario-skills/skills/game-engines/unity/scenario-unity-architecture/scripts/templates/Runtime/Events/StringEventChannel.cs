// Game.Runtime: concrete event channel asset type (see EventChannel.cs). One ScriptableObject class per
// file named like the class, or saved assets lose their script.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24.
using UnityEngine;

namespace Game.Runtime
{
    [CreateAssetMenu(menuName = "Game/Events/String Channel", fileName = "EVT_")]
    public sealed class StringEventChannel : EventChannel<string> { }
}
