// REQUIRES: com.unity.timeline
// AgentKit.Animation runtime v0.1 (Unity Expert Skills, 2026-09-24). Receiver of AgentMarker notifications and of a
// Signal reaction. Its own file: a MonoBehaviour in a file with another name saves as a missing script.
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Playables;

namespace AgentKit.Animation.Runtime
{
    public class AgentMarkerReceiver : MonoBehaviour, INotificationReceiver
    {
        public List<string> received = new List<string>();
        public int signals;

        public void OnNotify(Playable origin, INotification notification, object context)
        {
            if (notification is AgentMarker m) received.Add(m.payload + "@" + m.time.ToString("0.###"));
        }

        // wired as a Signal Receiver reaction (UnityEvent) by the Timeline builder
        public void OnSignal() => signals++;
    }
}
