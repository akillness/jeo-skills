"""Runs the scenario-unity-mobile helpers that read files, on synthetic inputs, with no Unity or Xcode.

It covers install, xcode_facts, app_thinning_report, xcode_compile_unsigned, code_scan,
package_check and soak_verdict. Each test pins what the helper returns or writes. The leak checks
assert that no file handle is left for the garbage collector (a ResourceWarning naming the file).
A fake subprocess.run stands in for xcodebuild. The toolkit imports fcntl, so the suite runs on
macOS and Linux only.

CRLF inputs are tolerance smoke inputs, not pinned behavior: strip() and the regexes absorb a CR.
The bare-CR scan test pins newline translation. Parsed fields hold UTF-8, so the suite needs a
UTF-8 locale, as on CI.
"""

import gc
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
import unittest.mock
import warnings
from pathlib import Path

HERE = Path(__file__).parent
UNITY = HERE.parents[1] / "skills" / "game-engines" / "unity"
MOBILE = UNITY / "scenario-unity-mobile" / "scripts"
EXPERT = UNITY / "scenario-unity-expert" / "scripts"
sys.path.insert(0, str(EXPERT))
sys.path.insert(0, str(MOBILE))

import ut_mobile  # noqa: E402

PBXPROJ = (
    b"// !$*UTF8*$!\r\n{\r\n"
    b"\t\t1D6058900D05DD3D006BFB54 /* Unity-iPhone */ = {\r\n\t\t\tisa = PBXNativeTarget;\r\n"
    b"\t\t9D25AB9C213FB47800354C27 /* UnityFramework */ = {\n\t\t\tisa = PBXNativeTarget;\n"
    b"\t\tIPHONEOS_DEPLOYMENT_TARGET = 13.0;\r\n\t\tIPHONEOS_DEPLOYMENT_TARGET = 15.0;\r\n"
    b"\t\t/* PrivacyInfo.xcprivacy */ \xff\xfe\r\n}\r\n"
)

THINNING = (
    b"App Thinning Size Report for All Variants of Unity-iPhone\n\n"
    b"Variant: Unity-iPhone-A.ipa\n"
    b"Supported variant descriptors: [device: iPhone]\n"
    b"App + On Demand Resources size: 120.5 MB compressed, 300 MB uncompressed\n"
    b"App size: 120.5 MB compressed, 300 MB uncompressed\n\n"
    b"Variant: Jeu-\xc3\xa9.ipa\n"
    b"Supported variant descriptors: [caf\xe9 \xff]\n"
    b"App size: 1234 KB compressed, 2 GB uncompressed\n"
)

SOAK_HEADER = "t_s,fps,cpu_p95_ms,gpu_p95_ms,thermal_warning,render_scale"


def soak_csv(path):
    """25 minutes, one row per 30 s: CPU p95 over the 30 fps sustained budget in the last window,
    a first thermal warning at 1350 s, render scale lowered from 1.0 to 0.8 at 1200 s."""
    rows = [SOAK_HEADER]
    for t in range(0, 1501, 30):
        late = t >= 1200
        rows.append("%d,30,%d,10,%d,%s" % (t, 25 if late else 15, 1 if t >= 1350 else 0, "0.8" if late else "1.0"))
    path.write_text("\n".join(rows) + "\n")


class Case(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="ut_mobile_test_"))
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def write(self, rel, data):
        p = self.tmp / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(data, bytes):
            p.write_bytes(data)
        else:
            p.write_text(data)
        return p

    def no_leak(self, fn, *args, **kwargs):
        """Call fn and fail on a ResourceWarning that names a file under this test's temp folder."""
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            result = fn(*args, **kwargs)
            gc.collect()
        leaks = [str(w.message) for w in caught if issubclass(w.category, ResourceWarning) and str(self.tmp) in str(w.message)]
        self.assertEqual(leaks, [], "file handles left open")
        return result


class Install(Case):
    def setUp(self):
        super().setUp()
        self.src = self.tmp / "Runtime"
        self.write("Runtime/A.cs", b"class A {}\r\n")
        self.write("Runtime/Iap5/B.asmdef", b'{"name": "B"}')
        self.write("Runtime/Iap5/B.cs.meta", b"meta")
        self.write("Runtime/LevelPlay9/C.cs", b"\xff\xfe raw bytes")
        self.write("proj/ProjectSettings/ProjectVersion.txt", "m_EditorVersion: 6000.3.21f1\n")
        (self.tmp / "proj" / "Assets").mkdir()
        self.dst = self.tmp / "proj" / "Assets" / "AgentMobile" / "Runtime"
        patch = unittest.mock.patch.object(ut_mobile, "RUNTIME_SRC", str(self.src))
        patch.start()
        self.addCleanup(patch.stop)

    def installed(self):
        return sorted(str(p.relative_to(self.dst)) for p in self.dst.rglob("*") if p.is_file())

    def test_copies_code_and_asmdef_only(self):
        root = ut_mobile.install(str(self.tmp / "proj"))
        self.assertEqual(root, str(self.tmp / "proj"))
        self.assertEqual(self.installed(), ["A.cs", os.path.join("Iap5", "B.asmdef"), os.path.join("LevelPlay9", "C.cs")])
        self.assertEqual((self.dst / "LevelPlay9" / "C.cs").read_bytes(), b"\xff\xfe raw bytes")
        self.assertTrue((self.tmp / "proj" / "Assets" / "Editor" / "AgentKit" / "AgentJob.cs").is_file())

    def test_rewrites_only_a_file_that_differs(self):
        ut_mobile.install(str(self.tmp / "proj"))
        # Same length, and both sides decode to the same text with errors="replace": only a byte
        # compare sees the edit.
        (self.dst / "LevelPlay9" / "C.cs").write_bytes(b"\xfe\xff raw bytes")
        with unittest.mock.patch.object(ut_mobile.shutil, "copyfile", wraps=shutil.copyfile) as copy:
            self.no_leak(ut_mobile.install, str(self.tmp / "proj"))
        self.assertEqual([Path(c.args[1]).name for c in copy.call_args_list], ["C.cs"])
        self.assertEqual((self.dst / "LevelPlay9" / "C.cs").read_bytes(), b"\xff\xfe raw bytes")

    def test_reinstall_copies_nothing(self):
        ut_mobile.install(str(self.tmp / "proj"))
        with unittest.mock.patch.object(ut_mobile.shutil, "copyfile") as copy:
            self.no_leak(ut_mobile.install, str(self.tmp / "proj"))
        copy.assert_not_called()


class XcodeFacts(Case):
    def export(self, report):
        self.write("iOS/Unity-iPhone.xcodeproj/project.pbxproj", PBXPROJ)
        self.write("iOS/Info.plist", plistlib.dumps({"CFBundleIdentifier": "com.example.game", "SKAdNetworkItems": [{}, {}]}))
        if report is not None:
            self.write("iOS/agent_xcode_postprocess.json", report)
        return str(self.tmp / "iOS")

    def test_reads_project_and_postprocess_report(self):
        report = '{\r\n "steps": ["privacy", "att"],\r\n "path": "/Users/hélène",\r\n "n": 2\r\n}\r\n'.encode()
        out = self.no_leak(ut_mobile.xcode_facts, self.export(report))
        self.assertTrue(out["exists"])
        self.assertTrue(out["xcodeproj"])
        self.assertEqual(out["targets"], ["Unity-iPhone", "UnityFramework"])
        self.assertEqual(out["deployment_targets"], ["13.0", "15.0"])
        self.assertTrue(out["pbx_mentions_privacy"])
        self.assertEqual(out["info_plist"]["CFBundleIdentifier"], "com.example.game")
        self.assertEqual(out["skadnetwork_items"], 2)
        self.assertEqual(out["postprocess"], {"steps": ["privacy", "att"], "path": "/Users/hélène", "n": 2})

    def test_no_report_leaves_postprocess_out(self):
        self.assertNotIn("postprocess", ut_mobile.xcode_facts(self.export(None)))

    def test_malformed_report_raises(self):
        with self.assertRaises(json.JSONDecodeError):
            ut_mobile.xcode_facts(self.export('{"n": '))

    def test_missing_folder(self):
        out = ut_mobile.xcode_facts(str(self.tmp / "nope"))
        self.assertEqual((out["exists"], out["xcodeproj"], out["total_mb"]), (False, False, 0))
        self.assertNotIn("targets", out)


class AppThinningReport(Case):
    EXPECTED = {
        "variants": [
            {"variant": "Unity-iPhone-A.ipa", "compressed_mb": 120.5, "uncompressed_mb": 300.0},
            {"variant": "Jeu-é.ipa", "compressed_mb": 1.205, "uncompressed_mb": 2048.0},
        ],
        "max_download_mb": 120.5,
        "max_variant": "Unity-iPhone-A.ipa",
        "under_ota_limit": True,
    }

    def test_report(self):
        for eol in (b"\n", b"\r\n"):
            with self.subTest(eol=eol):
                p = self.write("App Thinning Size Report.txt", THINNING.replace(b"\n", eol))
                self.assertEqual(self.no_leak(ut_mobile.app_thinning_report, str(p)), self.EXPECTED)

    def test_over_the_cellular_limit(self):
        p = self.write("r.txt", b"Variant: Big.ipa\nApp size: 1.2 GB compressed, 2 GB uncompressed\n")
        out = ut_mobile.app_thinning_report(str(p))
        self.assertEqual((out["max_download_mb"], out["under_ota_limit"]), (1228.8, False))

    def test_exactly_the_cellular_limit_is_over(self):
        p = self.write("r.txt", b"Variant: Edge.ipa\nApp size: 200 MB compressed, 400 MB uncompressed\n")
        out = ut_mobile.app_thinning_report(str(p))
        self.assertEqual((out["max_download_mb"], out["under_ota_limit"]), (200.0, False))

    def test_missing_file_raises(self):
        with self.assertRaises(FileNotFoundError):
            ut_mobile.app_thinning_report(str(self.tmp / "nope.txt"))


class XcodeCompileUnsigned(Case):
    def compile(self, output, returncode, **kwargs):
        """Run with a fake xcodebuild that writes output to the log the way a child process does."""
        folder = self.tmp / "iOS"
        (folder / "Unity-iPhone.xcodeproj").mkdir(parents=True, exist_ok=True)
        calls = []

        def run(cmd, stdout=None, stderr=None, timeout=None):
            calls.append(cmd)
            os.write(stdout.fileno(), output)
            return subprocess.CompletedProcess(cmd, returncode)

        fake = types.SimpleNamespace(run=run, STDOUT=subprocess.STDOUT)
        with unittest.mock.patch.object(ut_mobile, "subprocess", fake):
            out = self.no_leak(ut_mobile.xcode_compile_unsigned, str(folder), **kwargs)
        self.assertEqual(len(calls), 1)
        self.assertIn("CODE_SIGNING_ALLOWED=NO", calls[0])
        return out

    def test_success_with_app(self):
        self.write("iOS/agent_DerivedData/Build/Products/Release-iphoneos/Game.app/Game", b"\0" * 2048)
        out = self.compile(b"Compiling \xc3\x28\r\n** BUILD SUCCEEDED **\n", 0)
        log = str(self.tmp / "iOS" / "agent_xcodebuild.log")
        self.assertEqual((out["compiled"], out["status"], out["exit_code"], out["log"]), (True, "compiled", 0, log))
        self.assertEqual(Path(log).read_bytes(), b"Compiling \xc3\x28\r\n** BUILD SUCCEEDED **\n")
        self.assertTrue(out["app"].endswith("Game.app"))
        self.assertEqual(out["app_mb"], 0.002)
        self.assertEqual(out["errors"], [])

    def test_failure_lists_errors(self):
        out = self.compile(b"note: \xff\xfe\nerror: undefined symbol\nerror: linker failed\n** BUILD FAILED **\n", 65)
        self.assertEqual((out["compiled"], out["status"], out["exit_code"], out["app"]), (False, "failed", 65, None))
        self.assertEqual(out["errors"], ["error: undefined symbol", "error: linker failed"])

    def test_missing_platform(self):
        log = self.tmp / "logs" / "build.log"
        log.parent.mkdir()
        out = self.compile(b"xcodebuild: error: Unable to find a destination { error:iOS 26.5 is not installed. Please download }\n",
                           70, log=str(log))
        self.assertEqual(out["status"], "not_run_platform_missing")
        self.assertEqual(out["reason"], "iOS 26.5 is not installed. Please download")
        self.assertEqual(out["log"], str(log))
        self.assertFalse((self.tmp / "iOS" / "agent_xcodebuild.log").exists())

    def test_rerun_replaces_the_old_log(self):
        self.write("iOS/agent_xcodebuild.log", b"** BUILD SUCCEEDED **\n")
        output = b"x" * 4000 + b"\nerror: linker failed\n"
        out = self.compile(output, 0)
        self.assertEqual((out["compiled"], out["status"]), (False, "failed"))
        self.assertEqual((self.tmp / "iOS" / "agent_xcodebuild.log").read_bytes(), output)

    def test_only_the_tail_counts(self):
        out = self.compile(b"error: early warning-as-error\n" + b"x" * 4000 + b"\n** BUILD SUCCEEDED **\n", 0)
        self.assertEqual((out["compiled"], out["errors"]), (True, []))


class CodeScan(Case):
    def test_flags_project_code_only(self):
        self.write("proj/Assets/Scripts/Pause.cs",
                   b"\xef\xbb\xbfusing UnityEngine;\r\nclass P : MonoBehaviour {\r\n"
                   b"  void OnApplicationPause(bool p) {\r\n    PlayerPrefs.Save();\r\n  }\r\n}\r\n")
        self.write("proj/Assets/Scripts/Touch.cs",
                   b"// caf\xe9 \xff\nclass T { void Update() { var n = Input.touchCount;\n"
                   b" var t = System.IO.File.GetLastWriteTime(\"x\"); } }\n")
        self.write("proj/Assets/Packages/Skip.cs", b"class S { void OnApplicationPause(bool p) { PlayerPrefs.Save(); } }\n")
        out = self.no_leak(ut_mobile.code_scan, str(self.tmp / "proj"))
        found = sorted((f["code"], f["path"]) for f in out["findings"])
        pause = os.path.join("Assets", "Scripts", "Pause.cs")
        touch = os.path.join("Assets", "Scripts", "Touch.cs")
        self.assertEqual(found, [
            ("mobile.anr.pause_io", pause + ":3"),
            ("mobile.ios.privacy_timestamp", touch + ":3"),
            ("mobile.touch.legacy_input", touch + ":2"),
        ])
        self.assertEqual(out["counts"], {"error": 2, "warn": 1, "info": 0})
        self.assertEqual(out["timestamp_uses"], [touch + ":3"])

    def test_bare_cr_line_endings_count_as_newlines(self):
        # Untranslated, a bare CR leaves the // comment running to the end of the file.
        self.write("proj/Assets/Scripts/Legacy.cs",
                   b"// old line endings\rclass L { void Update() {\r  var n = Input.touchCount; } }\r")
        out = self.no_leak(ut_mobile.code_scan, str(self.tmp / "proj"))
        legacy = os.path.join("Assets", "Scripts", "Legacy.cs")
        self.assertEqual([(f["code"], f["path"]) for f in out["findings"]], [("mobile.touch.legacy_input", legacy + ":3")])

    def test_empty_assets(self):
        (self.tmp / "proj" / "Assets").mkdir(parents=True)
        out = ut_mobile.code_scan(str(self.tmp / "proj"))
        self.assertEqual((out["findings"], out["counts"]), ([], {"error": 0, "warn": 0, "info": 0}))


class PackageCheck(Case):
    MANIFEST = json.dumps({"dependencies": {"com.unity.purchasing": "4.15.1", "com.unity.services.levelplay": "9.5.1",
                                            "com.unity.ads": "4.4.2"}}, indent=2).replace("\n", "\r\n")

    def codes(self, out):
        return sorted(f["code"] for f in out["findings"])

    def test_manifest_without_lock(self):
        self.write("proj/Packages/manifest.json", self.MANIFEST)
        out = self.no_leak(ut_mobile.package_check, str(self.tmp / "proj"))
        self.assertEqual((out["iap"], out["levelplay"], out["unity_ads"]), ("4.15.1", "9.5.1", "4.4.2"))
        self.assertEqual(self.codes(out), ["mobile.pkg.iap4", "mobile.pkg.unity_ads_legacy"])
        self.assertEqual(out["counts"], {"error": 1, "warn": 0, "info": 1})

    def test_lock_versions_win(self):
        self.write("proj/Packages/manifest.json", self.MANIFEST)
        self.write("proj/Packages/packages-lock.json", json.dumps({"dependencies": {
            "com.unity.purchasing": {"version": "5.0.0"}, "com.unity.services.levelplay": {"version": "8.10.1"}}}))
        out = self.no_leak(ut_mobile.package_check, str(self.tmp / "proj"))
        self.assertEqual((out["iap"], out["levelplay"], out["unity_ads"]), ("5.0.0", "8.10.1", "4.4.2"))
        self.assertEqual(self.codes(out), ["mobile.pkg.levelplay8", "mobile.pkg.unity_ads_legacy"])

    def test_levelplay_9_with_leftovers(self):
        self.write("proj/Packages/manifest.json", '{"dependencies": {"com.unity.services.levelplay": "9.5.1"}}')
        self.write("proj/Assets/LevelPlay/Scripts/IronSource.cs", "x")
        self.write("proj/Assets/LevelPlay/Resources/Settings.cs", "x")
        self.write("proj/Assets/LevelPlay/Editor/Adapter.cs", "x")
        (self.tmp / "proj" / "Assets" / "Mobile Dependency Resolver").mkdir()
        out = ut_mobile.package_check(str(self.tmp / "proj"))
        self.assertEqual(sorted(out["leftovers"]), [os.path.join("Assets/LevelPlay/Scripts", "IronSource.cs"),
                                                    "Assets/Mobile Dependency Resolver"])
        self.assertEqual(self.codes(out), ["mobile.pkg.levelplay_leftovers"])

    def test_missing_manifest_raises(self):
        (self.tmp / "proj" / "Packages").mkdir(parents=True)
        with self.assertRaises(FileNotFoundError):
            ut_mobile.package_check(str(self.tmp / "proj"))

    def test_malformed_manifest_raises(self):
        self.write("proj/Packages/manifest.json", '{"dependencies": {')
        with self.assertRaises(json.JSONDecodeError):
            ut_mobile.package_check(str(self.tmp / "proj"))

    def test_malformed_lock_raises(self):
        self.write("proj/Packages/manifest.json", '{"dependencies": {}}')
        self.write("proj/Packages/packages-lock.json", "{")
        with self.assertRaises(json.JSONDecodeError):
            ut_mobile.package_check(str(self.tmp / "proj"))


class SoakVerdict(Case):
    def test_long_session_over_budget_warns(self):
        p = self.tmp / "soak.csv"
        soak_csv(p)
        out = self.no_leak(ut_mobile.soak_verdict, str(p), 30)
        self.assertEqual((out["verdict"], out["provisional"], out["rows"], out["duration_min"]), ("warn", "warn", 51, 25.0))
        self.assertEqual(out["budgets"]["sustained_ms"], 21.667)
        self.assertEqual(out["first_window"]["cpu_p95_median"], 15.0)
        self.assertEqual(out["last_window"]["cpu_p95_median"], 25.0)
        self.assertEqual(out["last_window"]["gpu_p95_median"], 10.0)
        self.assertEqual((out["rows_over_sustained"], out["max_thermal_warning"], out["first_warning_at_s"]), (11, 1, 1350.0))
        self.assertEqual(out["render_scales_seen"], ["0.8", "1.0"])
        self.assertFalse(out["short_session"])

    def test_short_session_keeps_provisional(self):
        p = self.tmp / "soak.csv"
        soak_csv(p)
        out = ut_mobile.soak_verdict(str(p), 30, min_minutes=30)
        self.assertEqual((out["verdict"], out["provisional"], out["short_session"]), ("too_short", "warn", True))

    def test_empty_csv(self):
        p = self.write("soak.csv", "")
        self.assertEqual(self.no_leak(ut_mobile.soak_verdict, str(p), 30), {"verdict": "no_data", "rows": 0})

    def test_header_only(self):
        p = self.write("soak.csv", SOAK_HEADER + "\n")
        self.assertEqual(ut_mobile.soak_verdict(str(p), 30), {"verdict": "no_data", "rows": 0})


if __name__ == "__main__":
    unittest.main()
