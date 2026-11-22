// REQUIRES: com.unity.timeline
// AgentKit.Animation runtime v0.1 (Unity Expert Skills, 2026-09-24). A custom Timeline track with blending,
// the four patterns of Ciro Continisio's "Extending Timeline" (Unity blog 2018, doc-extending-timeline):
//   1. data (PlayableAsset) separate from logic (PlayableBehaviour);
//   2. the shared target bound on the TRACK ([TrackBindingType]); it arrives as playerData in ProcessFrame;
//   3. blending in a custom mixer (CreateTrackMixer): weighted sum over GetInputWeight(i), your own semantics;
//   4. the template pattern: a [Serializable] behaviour referenced by the asset, created with
//      ScriptPlayable<T>.Create(graph, template), so clip fields are keyframeable on the Timeline.
// Plus [added] IPropertyPreview.GatherProperties so scrubbing in the editor restores the light afterwards
// (mixers run at edit time too: anything they write happens while scrubbing).
// Runtime code (not in an Editor folder): Timeline assets serialize these types. One ScriptableObject or
// MonoBehaviour per file, named after it (AgentLightClip.cs, AgentLightTrack.cs): otherwise the clip assets
// inside the .playable lose their script on the next load and the track silently plays nothing (observed
// 2026-09-24: intensity never changed until AgentLightClip moved to its own file). Installed by
// ut_animation.install into Assets/AgentKitRuntime/Animation/ (Assembly-CSharp).
// Run in Unity 6000.3.21f1, Timeline 1.8.12, on 2026-09-24: tests/code/unity-animation/test_live_animation.py::test_07.
using System;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace AgentKit.Animation.Runtime
{
    [Serializable]
    public class AgentLightBehaviour : PlayableBehaviour
    {
        public Color color = Color.white;
        public float intensity = 1f;
    }

    public class AgentLightMixer : PlayableBehaviour
    {
        public override void ProcessFrame(Playable playable, FrameData info, object playerData)
        {
            var light = playerData as Light;   // the track binding
            if (!light) return;
            var color = Color.clear;           // not Color.black (alpha 1): the weighted sum would end at alpha 2
            float intensity = 0f, total = 0f;
            for (int i = 0; i < playable.GetInputCount(); i++)
            {
                float w = playable.GetInputWeight(i);
                if (w <= 0f) continue;
                var b = ((ScriptPlayable<AgentLightBehaviour>)playable.GetInput(i)).GetBehaviour();
                color += b.color * w;
                intensity += b.intensity * w;
                total += w;
            }
            if (total <= 0f) return;           // between clips: leave the light alone
            light.color = color;
            light.intensity = intensity;
        }
    }

    [TrackColor(0.95f, 0.8f, 0.25f)]
    [TrackClipType(typeof(AgentLightClip))]
    [TrackBindingType(typeof(Light))]
    public class AgentLightTrack : TrackAsset
    {
        public override Playable CreateTrackMixer(PlayableGraph graph, GameObject go, int inputCount)
        {
            return ScriptPlayable<AgentLightMixer>.Create(graph, inputCount);
        }

        public override void GatherProperties(PlayableDirector director, IPropertyCollector driver)
        {
            var light = director.GetGenericBinding(this) as Light;
            if (light == null) return;
            driver.AddFromName<Light>(light.gameObject, "m_Color");
            driver.AddFromName<Light>(light.gameObject, "m_Intensity");
            base.GatherProperties(director, driver);
        }
    }
}
