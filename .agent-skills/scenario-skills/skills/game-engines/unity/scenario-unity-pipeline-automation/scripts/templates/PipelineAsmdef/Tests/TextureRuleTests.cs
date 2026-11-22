// Template (scenario-unity-pipeline-automation v0.2): content tests in a TEST assembly that references the pipeline's
// Editor assembly (Game.Pipeline.Editor). One case per texture (Warnecke and Fine, wTiF2D0_vKA [00:24:28]).
//   ut_run.run_tests(P, "EditMode", assemblies="Game.Pipeline.Tests")
using System.Collections.Generic;
using NUnit.Framework;

namespace Game.Pipeline.Tests
{
    [Category("PipelinePreBuild")]
    public class TextureRuleTests
    {
        const string Root = "Assets/Art/Props";      // the governed art root
        const int MaxSize = 1024;

        static IEnumerable<TestCaseData> Textures()
        {
            var list = TextureRuleAudit.Textures(Root);
            if (list.Count == 0) { yield return new TestCaseData("<none>").SetName("Textures(<none>)"); yield break; }
            foreach (var p in list) yield return new TestCaseData(p).SetName(System.IO.Path.GetFileNameWithoutExtension(p));
        }

        [TestCaseSource(nameof(Textures))]
        public void Texture_follows_rules(string path)
        {
            if (path == "<none>") Assert.Ignore("no textures under " + Root);
            Assert.IsNull(TextureRuleAudit.Check(path, MaxSize, new[] { "_Normal", "_N", "_nrm" }, new[] { "_Mask" }), path);
        }
    }
}
