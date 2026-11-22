// REQUIRES: com.unity.timeline
// AgentKit.Animation runtime v0.1 (Unity Expert Skills, 2026-09-24). The clip asset of AgentLightTrack (template
// pattern, see AgentLightTrack.cs). Its own file: a PlayableAsset is a ScriptableObject, and Unity resolves its
// script by file name when the Timeline asset loads.
using System;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace AgentKit.Animation.Runtime
{
    [Serializable]
    public class AgentLightClip : PlayableAsset, ITimelineClipAsset
    {
        public AgentLightBehaviour template = new AgentLightBehaviour();

        // Blending must be declared, or overlapping clips cannot crossfade in the Timeline window
        public ClipCaps clipCaps => ClipCaps.Blending | ClipCaps.Extrapolation;

        public override Playable CreatePlayable(PlayableGraph graph, GameObject owner)
        {
            return ScriptPlayable<AgentLightBehaviour>.Create(graph, template);
        }
    }
}
