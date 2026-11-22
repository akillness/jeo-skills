// scenario-unity-world-building v0.1 (2026-09-24). Automated profiling tour (Alba, YOtDVv5-0A4
// [00:29:46]): teleport the camera to fixed anchors, turn 360 degrees in steps at each, record
// frame statistics per anchor and per heading. Direction-dependent spikes ("a spot on the island
// looking one direction that tanks", [00:15:23]) are what averages hide, so the report keeps the
// worst heading per anchor.
// Use: put TourAnchor_* transforms in the scene (position = eye point, forward = first heading),
// add ProfileTour, run the shared AgentKit.AgentProfile.PlayModeTimings job on the scene: AgentProfile
// records the whole run to CSV (budget_check), this component writes per-anchor JSON to outputPath.
// Editor Play mode numbers are for iteration; the verdict comes from a development player on the
// target device (Alba ran the same tour on devices from Jenkins).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-world-building/test_live_world.py (tour).
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Unity.Profiling;
using UnityEngine;

namespace AgentKit.World
{
    [Serializable]
    public class TourHeading { public float yaw; public float maxMs; public float meanMs; public long maxBatches; public long maxTriangles; }

    [Serializable]
    public class TourAnchorStats
    {
        public string name;
        public Vector3 position;
        public int frames;
        public float p50Ms, p95Ms, maxMs, arrivalMaxMs;
        public float worstYaw;
        public long maxBatches, maxDrawCalls, maxTriangles;
        public List<TourHeading> headings = new List<TourHeading>();
    }

    [Serializable]
    public class TourReport
    {
        public string scene;
        public string counterSource = "ProfilerRecorder Internal/CPU Total Frame Time";
        public bool editorPlayMode;
        public int steps, framesPerStep, settleFrames;
        public float budgetMs;
        public List<TourAnchorStats> anchors = new List<TourAnchorStats>();
        public string worstAnchor;
        public float worstP95Ms;
    }

    public class ProfileTour : MonoBehaviour
    {
        public Camera tourCamera;                  // null: Camera.main (AgentProfile renders Camera.main offscreen)
        public List<Transform> anchors = new List<Transform>();
        public string anchorPrefix = "TourAnchor_";
        public int startDelayFrames = 60;          // match AgentProfile "warmup"
        public int steps = 8;                      // headings per anchor (45 degrees)
        public int framesPerStep = 12;
        public int settleFrames = 2;               // frames after a teleport reported as arrival cost
        public float pitch = 5f;
        public float budgetMs = 16.667f;
        public string outputPath = "";             // absolute; empty = persistentDataPath/profile_tour.json
        public bool loop = true;

        ProfilerRecorder m_Cpu, m_Batches, m_Draws, m_Tris;
        int m_Frame, m_Anchor, m_Step, m_InStep;
        bool m_Done;
        readonly List<float> m_Ms = new List<float>();
        readonly List<float> m_StepMs = new List<float>();
        long m_StepBatches, m_StepTris, m_AnchorDraws;
        float m_Arrival;
        TourAnchorStats m_Cur;
        readonly TourReport m_Report = new TourReport();

        public bool Done => m_Done;
        public TourReport Report => m_Report;

        void OnEnable()
        {
            m_Cpu = ProfilerRecorder.StartNew(ProfilerCategory.Internal, "CPU Total Frame Time");
            m_Batches = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Batches Count");
            m_Draws = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Draw Calls Count");
            m_Tris = ProfilerRecorder.StartNew(ProfilerCategory.Render, "Triangles Count");
        }

        void OnDisable() { m_Cpu.Dispose(); m_Batches.Dispose(); m_Draws.Dispose(); m_Tris.Dispose(); }

        void Start()
        {
            if (anchors.Count == 0)
                foreach (var t in FindObjectsByType<Transform>(FindObjectsInactive.Include, FindObjectsSortMode.None))
                    if (t.name.StartsWith(anchorPrefix)) anchors.Add(t);
            anchors = anchors.Where(a => a != null).OrderBy(a => a.name, StringComparer.Ordinal).ToList();
            m_Report.scene = gameObject.scene.path;
            m_Report.editorPlayMode = Application.isEditor;
            m_Report.steps = steps; m_Report.framesPerStep = framesPerStep; m_Report.settleFrames = settleFrames;
            m_Report.budgetMs = budgetMs;
        }

        Camera Cam => tourCamera != null ? tourCamera : Camera.main;

        void LateUpdate()
        {
            if (anchors.Count == 0 || Cam == null) return;
            m_Frame++;
            if (m_Frame < startDelayFrames) return;
            if (m_Frame == startDelayFrames) { BeginAnchor(0); return; }

            // LastValue = the previous completed frame, i.e. the frame rendered at the current pose
            float ms = m_Cpu.Valid ? m_Cpu.LastValue / 1e6f : Time.unscaledDeltaTime * 1000f;
            long batches = m_Batches.Valid ? m_Batches.LastValue : 0, tris = m_Tris.Valid ? m_Tris.LastValue : 0;
            long draws = m_Draws.Valid ? m_Draws.LastValue : 0;
            if (m_InStep < settleFrames && m_Step == 0) m_Arrival = Mathf.Max(m_Arrival, ms);
            else
            {
                m_Ms.Add(ms); m_StepMs.Add(ms);
                m_StepBatches = Math.Max(m_StepBatches, batches); m_StepTris = Math.Max(m_StepTris, tris);
                m_AnchorDraws = Math.Max(m_AnchorDraws, draws);
            }
            if (++m_InStep < framesPerStep) return;
            EndStep();
            if (++m_Step < steps) { m_InStep = 0; Pose(); return; }
            EndAnchor();
            if (m_Anchor + 1 < anchors.Count) BeginAnchor(m_Anchor + 1);
            else
            {
                if (!m_Done) { m_Done = true; Write(); }
                if (loop) BeginAnchor(0); else enabled = false;
            }
        }

        void BeginAnchor(int i)
        {
            m_Anchor = i; m_Step = 0; m_InStep = 0; m_Ms.Clear(); m_Arrival = 0; m_AnchorDraws = 0;
            m_Cur = m_Done ? null : new TourAnchorStats { name = anchors[i].name, position = anchors[i].position };
            Pose();
        }

        void Pose()
        {
            var a = anchors[m_Anchor];
            float yaw0 = a.eulerAngles.y;
            Cam.transform.SetPositionAndRotation(a.position, Quaternion.Euler(pitch, yaw0 + 360f * m_Step / steps, 0));
            m_StepMs.Clear(); m_StepBatches = 0; m_StepTris = 0;
        }

        void EndStep()
        {
            if (m_Cur == null || m_StepMs.Count == 0) return;
            m_Cur.headings.Add(new TourHeading
            {
                yaw = Mathf.Repeat(anchors[m_Anchor].eulerAngles.y + 360f * m_Step / steps, 360f),
                maxMs = m_StepMs.Max(), meanMs = m_StepMs.Average(), maxBatches = m_StepBatches, maxTriangles = m_StepTris,
            });
        }

        void EndAnchor()
        {
            if (m_Cur == null) return;
            var s = m_Ms.OrderBy(x => x).ToList();
            m_Cur.frames = s.Count;
            if (s.Count > 0)
            {
                m_Cur.p50Ms = s[s.Count / 2];
                m_Cur.p95Ms = s[Mathf.Min(s.Count - 1, (int)(s.Count * 0.95f))];
                m_Cur.maxMs = s[s.Count - 1];
            }
            m_Cur.arrivalMaxMs = m_Arrival;
            var worst = m_Cur.headings.OrderByDescending(h => h.maxMs).FirstOrDefault();
            if (worst != null) m_Cur.worstYaw = worst.yaw;
            m_Cur.maxBatches = m_Cur.headings.Count > 0 ? m_Cur.headings.Max(h => h.maxBatches) : 0;
            m_Cur.maxTriangles = m_Cur.headings.Count > 0 ? m_Cur.headings.Max(h => h.maxTriangles) : 0;
            m_Cur.maxDrawCalls = m_AnchorDraws;
            m_Report.anchors.Add(m_Cur);
        }

        void Write()
        {
            var worst = m_Report.anchors.OrderByDescending(a => a.p95Ms).FirstOrDefault();
            if (worst != null) { m_Report.worstAnchor = worst.name; m_Report.worstP95Ms = worst.p95Ms; }
            var path = string.IsNullOrEmpty(outputPath) ? Path.Combine(Application.persistentDataPath, "profile_tour.json") : outputPath;
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(path, JsonUtility.ToJson(m_Report, true));
            Debug.Log("[AgentKit.World] ProfileTour report: " + path);
        }
    }
}
