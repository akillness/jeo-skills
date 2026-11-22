// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). Pure C# client prediction and
// server reconciliation (Gambetta, Fast-Paced Multiplayer II), the part Netcode for GameObjects
// 2.x does NOT provide ("doesn't support full client-side prediction and reconciliation", NGO 2.7
// manual; it offers client anticipation). No Unity types, no network: Edit Mode tests drive it with
// a scripted latency so the logic is proven before any NGO wiring.
// Rules encoded: inputs carry sequence numbers; the server simulates on its own tick and reports
// the last input it processed; the client resets to the authoritative state and replays every
// unacknowledged input (never compares its CURRENT position with an old server state:
// git-amend's on-camera fix, -lGsuCEWkM0 [00:22:21]); movement scales by the tick interval, not
// Time.deltaTime (-lGsuCEWkM0 [00:16:51]); the server clamps inputs (never trust the client).
using System;
using System.Collections.Generic;

namespace AgentKit.Gameplay
{
    public struct NetInput { public int seq; public float move; }          // move in [-1, 1]
    public struct NetState { public int lastSeq; public float x; }

    public static class NetModel
    {
        public const float Speed = 5f;   // units per second
        /// <summary>Deterministic step shared by client prediction, client replay and the server.</summary>
        public static float Step(float x, float move, float dt) => x + Math.Max(-1f, Math.Min(1f, move)) * Speed * dt;
    }

    /// <summary>Messages delivered after a fixed number of ticks (one-way latency).</summary>
    public class LatencyPipe<T>
    {
        readonly Queue<(int due, T msg)> m_Q = new Queue<(int, T)>();
        public int delayTicks;
        public LatencyPipe(int delayTicks) { this.delayTicks = delayTicks; }
        public void Send(int now, T msg) => m_Q.Enqueue((now + delayTicks, msg));
        public IEnumerable<T> Receive(int now)
        {
            while (m_Q.Count > 0 && m_Q.Peek().due <= now) yield return m_Q.Dequeue().msg;
        }
    }

    public class NetServer
    {
        public float x;
        public int lastSeq = -1;
        public float maxMove = 1f;       // validation: a hacked client sending move = 3 is clamped
        public float wallX = float.PositiveInfinity;   // world the client cannot know (a door closed by another player)
        public int rejected;
        public void Apply(NetInput i, float dt)
        {
            if (i.seq <= lastSeq) return;                      // duplicate or reordered
            float m = i.move;
            if (Math.Abs(m) > maxMove) { rejected++; m = Math.Sign(m) * maxMove; }
            x = Math.Min(NetModel.Step(x, m, dt), wallX);
            lastSeq = i.seq;
        }
        public NetState Snapshot() => new NetState { lastSeq = lastSeq, x = x };
    }

    public class NetClient
    {
        public float x;                                  // predicted, shown to the player
        public int nextSeq;
        public readonly List<NetInput> pending = new List<NetInput>();
        public int corrections;                          // reconciliations that moved the prediction
        public float maxCorrection;
        public bool reconcile = true;

        public NetInput Predict(float move, float dt)
        {
            var i = new NetInput { seq = nextSeq++, move = move };
            pending.Add(i);
            x = NetModel.Step(x, move, dt);              // apply locally at once
            return i;
        }

        public void OnServerState(NetState s, float dt)
        {
            if (!reconcile) { x = s.x; pending.Clear(); return; }   // naive: snap to the past
            pending.RemoveAll(p => p.seq <= s.lastSeq);             // acknowledged
            float replay = s.x;
            foreach (var p in pending) replay = NetModel.Step(replay, p.move, dt);   // replay the rest
            float err = Math.Abs(replay - x);
            if (err > 1e-4f) { corrections++; maxCorrection = Math.Max(maxCorrection, err); }
            x = replay;
        }
    }
}
