// REQUIRES: com.unity.timeline
// AgentKit.Animation runtime v0.1 (Unity Expert Skills, 2026-09-24). A custom Timeline marker with a payload and
// its receiver (Ciro Continisio, Unite Now 2020, gsEe0_o_934 [00:23:02]): a marker is an instantaneous event,
// a track is a continuous action [00:18:53]; use a Signal when there is no payload, a custom marker when the
// event carries data. The receiver gets EVERY notification routed to its GameObject: type-check before use
// [frame 00:22:57].
// Run in Unity 6000.3.21f1, Timeline 1.8.12, on 2026-09-24: tests/code/unity-animation/test_live_animation.py::test_07.
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

namespace AgentKit.Animation.Runtime
{
    [Serializable, System.ComponentModel.DisplayName("Agent Marker")]   // menu name in the Timeline Add menu
    public class AgentMarker : Marker, INotification, INotificationOptionProvider
    {
        public string payload = "";
        public bool triggerInEditMode = true;   // fire while previewing or evaluating in the editor too

        public PropertyName id => new PropertyName("AgentMarker");

        public NotificationFlags flags =>
            NotificationFlags.TriggerOnce | (triggerInEditMode ? NotificationFlags.TriggerInEditMode : 0);
    }
}
