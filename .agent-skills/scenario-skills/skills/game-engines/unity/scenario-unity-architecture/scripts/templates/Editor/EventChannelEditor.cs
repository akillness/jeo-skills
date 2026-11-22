// Game.EditorTools: the debug plan of an event channel in the Inspector (Ryan Hipple, raQ3iHhE_Kk
// [00:36:07]: "a Raise button on the asset" fires the event without recreating the game situation; the
// studio's debugger lists listeners and logs invocations [00:55:31]).
// Shows listener count, raise count and last frame; "Raise (debug value)" calls RaiseDebug() in Play mode
// (listeners only register in Play mode). An agent without a mouse calls the same RaiseDebug() from an
// editor script: ArchPlayMode.PlayProbe {"invoke": [{"path": "<channel.asset>", "method": "RaiseDebug"}]}.
// scenario-unity-architecture skill template, run in Unity 6000.3.21f1 on 2026-09-24 (procedures.md A11).
using Game.Runtime;
using UnityEditor;
using UnityEngine;

namespace Game.EditorTools
{
    [CustomEditor(typeof(EventChannelBase), true)]
    public sealed class EventChannelEditor : UnityEditor.Editor
    {
        public override void OnInspectorGUI()
        {
            DrawDefaultInspector();
            var channel = (EventChannelBase)target;
            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Debug", EditorStyles.boldLabel);
            EditorGUILayout.LabelField("Listeners", channel.ListenerCount.ToString());
            EditorGUILayout.LabelField("Raised", channel.RaiseCount + " (last frame " + channel.LastRaiseFrame + ")");
            using (new EditorGUI.DisabledScope(!Application.isPlaying))
            {
                if (GUILayout.Button("Raise (debug value)")) channel.RaiseDebug();
            }
            if (!Application.isPlaying) EditorGUILayout.HelpBox("Enter Play mode to raise: listeners register in OnEnable at runtime.", MessageType.None);
        }

        public override bool RequiresConstantRepaint() => Application.isPlaying;
    }
}
