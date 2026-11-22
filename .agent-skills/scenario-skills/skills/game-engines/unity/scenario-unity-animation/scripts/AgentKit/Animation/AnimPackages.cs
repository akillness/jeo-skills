// AgentKit.Animation v0.1 (Unity Expert Skills, 2026-09-24). Package installs for the animation stack.
//
// Why a job and not "add it in the Package Manager": the 6000.3.21f1 editor manifest declares
// Cinemachine 2.10.7 as its version, so a bare add can land on CM2 while every current tutorial and
// this skill use CM3. Always add with an explicit version and read packages-lock.json after.
//
//   ut_run.run_method(P, "AgentKit.Animation.AnimPackages.Add",
//                     {"packages": ["com.unity.cinemachine@3.1.7", "com.unity.animation.rigging@1.4.1"]},
//                     quit=False, timeout=900)
// Unity calls: UnityEditor.PackageManager.Client.Add(id) per id, polled on EditorApplication.update
// (async job: launch WITHOUT -quit). The result lists the version each request resolved to.
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-animation/test_live_animation.py::test_01.
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.PackageManager;
using UnityEditor.PackageManager.Requests;

namespace AgentKit.Animation
{
    public static class AnimPackages
    {
        public static void Add()
        {
            AgentJob.Run(() =>
            {
                var ids = new List<string>();
                foreach (var o in AgentJob.List("packages")) ids.Add(o.ToString());
                if (ids.Count == 0) throw new System.ArgumentException("args.packages is empty");
                AgentJob.BeginAsync();
                var results = new List<object>();
                int i = 0;
                AddRequest req = null;
                EditorApplication.CallbackFunction tick = null;
                tick = () =>
                {
                    if (req == null)
                    {
                        req = Client.Add(ids[i]);
                        return;
                    }
                    if (!req.IsCompleted) return;
                    var row = new Dictionary<string, object> { { "requested", ids[i] }, { "status", req.Status.ToString() } };
                    if (req.Status == StatusCode.Success)
                    {
                        row["name"] = req.Result.name;
                        row["version"] = req.Result.version;
                        row["source"] = req.Result.source.ToString();
                        var deps = new List<object>();
                        foreach (var d in req.Result.dependencies) deps.Add(d.name + "@" + d.version);
                        row["dependencies"] = deps;
                    }
                    else row["error"] = req.Error != null ? req.Error.message : "unknown";
                    results.Add(row);
                    i++;
                    req = null;
                    if (i < ids.Count) return;
                    EditorApplication.update -= tick;
                    bool ok = results.TrueForAll(r => (string)((Dictionary<string, object>)r)["status"] == "Success");
                    var res = new Dictionary<string, object> { { "added", results } };
                    if (ok) AgentJob.Succeed(res);
                    else AgentJob.Fail("a package request failed", res);
                };
                EditorApplication.update += tick;
                return null;
            });
        }
    }
}
