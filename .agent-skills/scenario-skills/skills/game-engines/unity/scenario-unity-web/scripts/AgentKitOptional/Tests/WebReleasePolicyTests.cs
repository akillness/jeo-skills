// WebReleasePolicyTests.cs (scenario-unity-web skill, 2026-09-24). EditMode tests (Unity Test Framework) that fail
// when the Web release settings drift from the team's policy: the CI gate that catches a teammate turning
// Decompression Fallback back on, a Development build, a Graphics API list without WebGL 2, a stale scene
// list, or a fresh CI runner that lost Code Optimization and the texture subtarget (both live in Library/).
// Policy: ProjectSettings/AgentWebPolicy.json, written by WebJobs.ApplySettings {"write_policy": true}
// (commit it); without the file the built-in release defaults below apply.
// Run: ut_run.run_tests(P, "EditMode", filter="AgentWeb") (never with -quit).
// Run in Unity 6000.3.21f1 on 2026-09-24: tests/code/unity-web/test_live_web.py test_19.
using System;
using System.IO;
using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;

namespace AgentWeb.EditorTests
{
    [Serializable]
    public class WebPolicy
    {
        public string compression = "Brotli";            // Gzip for a plain-HTTP host, Disabled for Poki
        public bool fallback;                            // true only for hosts without header control (itch.io)
        public bool hashes = true;
        public bool data_caching = true;
        public string exceptions = "ExplicitlyThrownExceptionsOnly";
        public bool wasm2023 = true;
        public string code_optimization = "DiskSizeLTO";  // DiskSize while iterating
        public string stripping = "High";
        public bool strip_engine = true;
        public string texture_subtarget = "";            // "" = not pinned; "DXT" / "ASTC" for a pinned build
        public string[] graphics_must_include = { "OpenGLES3" };

        public static WebPolicy Load()
        {
            var path = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "ProjectSettings", "AgentWebPolicy.json");
            return File.Exists(path) ? JsonUtility.FromJson<WebPolicy>(File.ReadAllText(path)) : new WebPolicy();
        }
    }

    public class WebReleasePolicyTests
    {
        static readonly NamedBuildTarget Web = NamedBuildTarget.WebGL;
        WebPolicy _p;

        [SetUp] public void Load() => _p = WebPolicy.Load();

        static string CodeOptimization()
        {
            var t = Type.GetType("UnityEditor.WebGL.UserBuildSettings, UnityEditor.WebGL.Extensions");
            return t?.GetProperty("codeOptimization")?.GetValue(null)?.ToString() ?? "n/a (Web module missing)";
        }

        [Test] public void Compression_matches_the_host() => Assert.AreEqual(_p.compression, PlayerSettings.WebGL.compressionFormat.ToString());

        [Test] public void Decompression_fallback_matches_the_host() => Assert.AreEqual(_p.fallback, PlayerSettings.WebGL.decompressionFallback);

        [Test] public void Not_a_development_build() => Assert.IsFalse(EditorUserBuildSettings.development, "development builds are neither compressed nor minified");

        [Test]
        public void Release_code_settings()
        {
            Assert.AreEqual(_p.wasm2023, PlayerSettings.WebGL.wasm2023, "WebAssembly 2023");
            Assert.AreEqual(_p.exceptions, PlayerSettings.WebGL.exceptionSupport.ToString(), "Enable Exceptions");
            Assert.AreEqual(_p.stripping, PlayerSettings.GetManagedStrippingLevel(Web).ToString(), "Managed Stripping Level");
            Assert.AreEqual(_p.strip_engine, PlayerSettings.stripEngineCode, "Strip Engine Code");
            Assert.AreEqual(_p.hashes, PlayerSettings.WebGL.nameFilesAsHashes, "Name Files As Hashes");
            Assert.AreEqual(_p.data_caching, PlayerSettings.WebGL.dataCaching, "Data Caching");
        }

        [Test]
        public void Code_optimization_survives_in_this_checkout()
        {
            // lives in Library/EditorUserBuildSettings.asset: a fresh clone reads the default (BuildTimes)
            Assert.AreEqual(_p.code_optimization, CodeOptimization(), "set it in the build job, or commit a Build Profile");
        }

        [Test]
        public void Texture_subtarget_is_pinned_when_the_policy_says_so()
        {
            if (string.IsNullOrEmpty(_p.texture_subtarget)) Assert.Pass("not pinned by policy");
            Assert.AreEqual(_p.texture_subtarget, EditorUserBuildSettings.webGLBuildSubtarget.ToString());
        }

        [Test]
        public void Graphics_list_keeps_webgl2()
        {
            if (PlayerSettings.GetUseDefaultGraphicsAPIs(BuildTarget.WebGL)) Assert.Pass("Auto Graphics API (WebGL 2)");
            var apis = PlayerSettings.GetGraphicsAPIs(BuildTarget.WebGL).Select(a => a.ToString()).ToArray();
            foreach (var must in _p.graphics_must_include) CollectionAssert.Contains(apis, must, "keep WebGL 2 (OpenGLES3) below WebGPU for public links");
        }

        [Test]
        public void Build_scene_list_is_valid()
        {
            var scenes = EditorBuildSettings.scenes.Where(s => s.enabled).ToArray();
            Assert.IsNotEmpty(scenes, "a stale or empty scene list builds nothing (Cam Ayres bF_eUuxGEcA [00:04:02])");
            foreach (var s in scenes) Assert.IsNotNull(AssetDatabase.LoadAssetAtPath<SceneAsset>(s.path), "missing scene " + s.path);
        }
    }
}
