// scenario-unity-gameplay runtime (Unity Expert Skills v0.1, 2026-09-24). Scene component that closes the
// AI frame (AIBudget) in LateUpdate and writes the JSON when Play mode ends.
// Its own file on purpose: a MonoBehaviour must live in a file named after its class. When this
// class sat in AIBudget.cs, AddComponent from an editor job worked, but the saved scene referenced
// the script by an in-file id instead of the script GUID and the component never ran in Play mode
// (observed 2026-09-24: no OnEnable, no JSON).
using System.IO;
using UnityEngine;

namespace AgentKit.Gameplay
{
    /// <summary>Put one in the scene: closes the AI frame in LateUpdate and writes the JSON on disable.</summary>
    [DefaultExecutionOrder(10000)]
    public class AIBudgetMeter : MonoBehaviour
    {
        public string label = "";
        public int skipFrames = 60;
        public string outputPath = "";   // empty: <project>/Library/AgentKit/gameplay/ai_budget.json

        bool m_Playing, m_Written;

        void OnEnable() { AIBudget.Label = label; m_Playing = Application.isPlaying; m_Written = false; }

        void LateUpdate() { AIBudget.CloseFrame(); }

        // Written once, on the first of OnApplicationQuit / OnDisable when leaving Play mode.
        void OnApplicationQuit() { Write(); }
        void OnDisable() { Write(); }

        void Write()
        {
            if (!m_Playing || m_Written) return;
            m_Written = true;
            var path = string.IsNullOrEmpty(outputPath)
                ? Path.Combine(Directory.GetParent(Application.dataPath).FullName, "Library/AgentKit/gameplay/ai_budget.json")
                : outputPath;
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, AIBudget.ToJson(skipFrames));
            // one log line so a batch log shows the slice was written (UnityEngine.Debug: System.Diagnostics is in scope elsewhere)
            UnityEngine.Debug.Log("[AIBudgetMeter] wrote " + path + " frames=" + AIBudget.FrameMs.Count);
        }
    }
}
