// AgentKit.Animation runtime v0.1 (Unity Expert Skills, 2026-09-24). The code-driven alternative to an Animator
// Controller: a PlayableGraph with a locomotion mixer and a one-shot slot (Adam Myhre, git-amend, fQzKJO-0dS8).
//   top mixer: input 0 = locomotion mixer (idle, walk), input 1 = the current one-shot clip
//   locomotion weight = InverseLerp(0, maxSpeed, speed); weights always complementary (w, 1 - w)
//   one-shot blend = clamp(10% of the clip, 0.1 s, half the clip); the blend out starts at length - blend
//   same clip playing: ignore; other clip: reset weights, disconnect AND destroy the old playable, connect the new
//   Destroy() the graph when done (an undestroyed graph logs an error; git-amend calls it a leak)
// Plain C# class ticked by its owner (no coroutine package needed: Tick(dt) advances the blends), so it runs in
// Play mode, in tests, and in edit mode with DirectorUpdateMode.Manual for deterministic sampling.
// Run in Unity 6000.3.21f1 on 2026-09-24 through AnimProcedural.GraphOneShotCheck (test_live_animation.py::test_09).
using UnityEngine;
using UnityEngine.Animations;
using UnityEngine.Playables;

namespace AgentKit.Animation.Runtime
{
    public class AgentAnimationGraph
    {
        public PlayableGraph Graph { get; private set; }
        public AnimationMixerPlayable Top { get; private set; }
        public AnimationMixerPlayable Locomotion { get; private set; }
        AnimationClipPlayable oneShot;
        AnimationClip oneShotClip;
        float oneShotTime, blend;

        public AgentAnimationGraph(Animator animator, AnimationClip idle, AnimationClip walk, bool manual = false)
        {
            Graph = PlayableGraph.Create("AgentAnimationGraph");   // named: the PlayableGraph Visualizer lists it
            Graph.SetTimeUpdateMode(manual ? DirectorUpdateMode.Manual : DirectorUpdateMode.GameTime);
            var output = AnimationPlayableOutput.Create(Graph, "Animation", animator);
            Top = AnimationMixerPlayable.Create(Graph, 2);
            output.SetSourcePlayable(Top);
            Locomotion = AnimationMixerPlayable.Create(Graph, 2);
            Top.ConnectInput(0, Locomotion, 0);
            Top.SetInputWeight(0, 1f);
            Locomotion.ConnectInput(0, AnimationClipPlayable.Create(Graph, idle), 0);
            Locomotion.ConnectInput(1, AnimationClipPlayable.Create(Graph, walk), 0);
            Graph.Play();
        }

        public static float BlendDuration(float length) => Mathf.Clamp(0.1f * length, 0.1f, 0.5f * length);

        public void UpdateLocomotion(float speed, float maxSpeed)
        {
            float w = Mathf.InverseLerp(0f, maxSpeed, speed);
            Locomotion.SetInputWeight(0, 1f - w);
            Locomotion.SetInputWeight(1, w);
        }

        public void PlayOneShot(AnimationClip clip)
        {
            if (oneShotClip == clip && oneShot.IsValid()) return;   // same clip: ignore
            InterruptOneShot();
            oneShot = AnimationClipPlayable.Create(Graph, clip);
            Top.ConnectInput(1, oneShot, 0);
            oneShotClip = clip;
            oneShotTime = 0f;
            blend = BlendDuration(clip.length);
        }

        public void InterruptOneShot()
        {
            if (oneShot.IsValid())
            {
                Top.DisconnectInput(1);
                oneShot.Destroy();   // a disconnected playable still belongs to the graph
            }
            // weights AFTER the disconnect: an empty input reads weight 1 again once disconnected (observed
            // 2026-09-24), which breaks the "weights sum to 1" invariant the rest of the code relies on
            Top.SetInputWeight(0, 1f);
            Top.SetInputWeight(1, 0f);
            oneShotClip = null;
        }

        /// <summary>Advance the one-shot blends by dt (call every frame before the graph evaluates).</summary>
        public void Tick(float dt)
        {
            if (!oneShot.IsValid()) return;
            oneShotTime += dt;
            float len = oneShotClip.length;
            float w = oneShotTime < blend ? oneShotTime / blend
                    : oneShotTime > len - blend ? Mathf.Clamp01((len - oneShotTime) / blend) : 1f;
            Top.SetInputWeight(0, 1f - w);
            Top.SetInputWeight(1, w);
            if (oneShotTime >= len) InterruptOneShot();
        }

        public bool OneShotActive => oneShot.IsValid();

        public void Destroy()
        {
            if (Graph.IsValid()) Graph.Destroy();
        }
    }
}
