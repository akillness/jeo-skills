"""Runs the Unity specialists' file helpers on synthetic projects, with no Unity installed.

Covered: the install copies (2d, performance, vfx), the 2d demo art, the pipeline rules file, the
UnityYAMLMerge report read, the shader keyword lint and the PSO player run. UnityYAMLMerge and the
player are stubbed, so nothing outside this process runs. Each helper compares or reads files it
must close: the leak checks fail on a handle left to the garbage collector. The scripts import the
lead's toolkit, which needs fcntl, so the suite is POSIX only, like test_toolkit_offline.py. Two
tests decode non-ASCII text with the locale encoding, as the scripts do: they skip unless it is UTF-8.
"""

import gc
import json
import locale
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import unittest.mock
import warnings
from pathlib import Path

# abspath, not resolve(): the leak filter matches the scripts' own os.path.abspath paths, symlinks kept.
HERE = Path(os.path.abspath(__file__)).parent
UNITY = HERE.parents[1] / "skills" / "game-engines" / "unity"
for skill in ("2d", "architecture", "performance", "pipeline-automation", "vfx", "shaders"):
    sys.path.insert(0, str(UNITY / f"scenario-unity-{skill}" / "scripts"))

import ut_2d  # noqa: E402
import ut_arch  # noqa: E402
import ut_perf  # noqa: E402
import ut_pipeline  # noqa: E402
import ut_shaders  # noqa: E402
import ut_vfx  # noqa: E402

TMP = None  # set by setUpModule: unittest runs tearDownModule only after a test ran
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
# An mtime no write during the test can produce: a rewrite shows up as a changed st_mtime_ns.
OLD_MTIME = 1_000_000_000
UTF8_LOCALE = locale.getpreferredencoding(False).lower().replace("-", "") == "utf8"


def setUpModule():
    global TMP
    TMP = Path(tempfile.mkdtemp(prefix="ut_specialists_test_"))


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


def project(name):
    """A folder find_project accepts (Assets + ProjectSettings/ProjectVersion.txt). Returns its root."""
    root = TMP / name
    (root / "Assets").mkdir(parents=True)
    (root / "ProjectSettings").mkdir()
    (root / "ProjectSettings" / "ProjectVersion.txt").write_text("m_EditorVersion: 6000.3.21f1\n")
    return root


def unclosed(fn, *args, **kwargs):
    """Call fn and return (its result or raised exception, the ResourceWarnings naming a test or skill file)."""
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", ResourceWarning)
        try:
            result = fn(*args, **kwargs)
        except Exception as e:
            result = e
            # Tracebacks keep the failing frames, and any file they opened, alive. json.loads hides
            # one in __context__ (a StopIteration raised "from None").
            while e is not None:
                e.__traceback__, e = None, e.__context__
        gc.collect()
    leaks = [str(w.message) for w in caught if issubclass(w.category, ResourceWarning)]
    return result, [m for m in leaks if str(TMP) in m or str(UNITY) in m]


def age(root):
    """Set every file under root to OLD_MTIME."""
    for p in Path(root).rglob("*"):
        if p.is_file():
            os.utime(p, ns=(OLD_MTIME, OLD_MTIME))


def rewritten(root):
    return sorted(str(p.relative_to(root)) for p in Path(root).rglob("*")
                  if p.is_file() and p.stat().st_mtime_ns != OLD_MTIME)


def snapshot(root):
    return {str(p.relative_to(root)): p.read_bytes() for p in Path(root).rglob("*") if p.is_file()}


class InstallCopies:
    """Shared checks for an install() that copies runtime files only when their bytes differ."""

    module = None
    source = None         # the skill's runtime folder
    runtime_dst = None    # the folder under the project root that receives it

    def runtime_files(self, written):
        return sorted(w for w in written if w.startswith(self.runtime_dst + os.sep))

    def test_first_install_copies_runtime_files_byte_for_byte(self):
        root = project(self.id())
        written = self.module.install(str(root))
        runtime = self.runtime_files(written)
        expected = {str(p.relative_to(self.source)): p.read_bytes() for p in Path(self.source).rglob("*")
                    if p.suffix in (".cs", ".asmdef")}
        self.assertTrue(expected)
        self.assertEqual({os.path.relpath(rel, self.runtime_dst): (root / rel).read_bytes() for rel in runtime},
                         expected)

    def test_second_install_writes_nothing(self):
        root = project(self.id())
        self.module.install(str(root))
        age(root)
        self.assertEqual(self.module.install(str(root)), [])
        self.assertEqual(rewritten(root), [])

    def test_changed_runtime_file_is_restored(self):
        root = project(self.id())
        runtime = self.runtime_files(self.module.install(str(root)))
        before = snapshot(root)
        victim = root / runtime[-1]
        # Same size, and not UTF-8: a size-only or a text compare would miss it.
        victim.write_bytes(b"\xff" + victim.read_bytes()[1:])
        self.assertEqual(self.module.install(str(root)), [runtime[-1]])
        self.assertEqual(snapshot(root), before)

    def test_install_closes_the_files_it_compares(self):
        root = project(self.id())
        self.module.install(str(root))
        result, leaks = unclosed(self.module.install, str(root))
        self.assertEqual(result, [])
        self.assertEqual(leaks, [])

    @unittest.skipUnless(hasattr(os, "geteuid") and os.geteuid() != 0, "root reads a mode 000 file")
    def test_unreadable_destination_raises(self):
        root = project(self.id())
        runtime = self.runtime_files(self.module.install(str(root)))
        victim = root / runtime[0]
        victim.chmod(0)
        try:
            with self.assertRaises(PermissionError):
                self.module.install(str(root))
        finally:
            victim.chmod(0o644)


class TwoDInstall(InstallCopies, unittest.TestCase):
    module = ut_2d
    source = ut_2d.RUNTIME_2D
    runtime_dst = os.path.join("Assets", "AgentKit2D")


class PerformanceInstall(InstallCopies, unittest.TestCase):
    module = ut_perf
    source = ut_perf.RUNTIME_SRC
    runtime_dst = ut_perf.RUNTIME_DST


class TwoDDemoArt(unittest.TestCase):
    def test_writes_png_files_at_the_returned_paths(self):
        root = project(self.id())
        out = ut_2d.make_demo_art(str(root), bench=1)
        self.assertEqual(out["crate"], "Assets/Art/Pixel/crate.png")
        self.assertEqual(out["loose_00"], "Assets/Art/AtlasBench/Loose/loose_00.png")
        written = sorted(str(p.relative_to(root)) for p in (root / "Assets").rglob("*") if p.is_file())
        self.assertEqual(written, sorted(out.values()))
        for rel in out.values():
            self.assertTrue((root / rel).read_bytes().startswith(PNG_SIGNATURE), rel)

    def test_identical_bytes_are_not_rewritten(self):
        root = project(self.id())
        first = ut_2d.make_demo_art(str(root), bench=1)
        before = snapshot(root)
        age(root)
        self.assertEqual(ut_2d.make_demo_art(str(root), bench=1), first)
        self.assertEqual(rewritten(root), [])
        self.assertEqual(snapshot(root), before)

    def test_changed_file_is_rewritten(self):
        root = project(self.id())
        ut_2d.make_demo_art(str(root), bench=1)
        before = snapshot(root)
        age(root)
        crate = root / "Assets/Art/Pixel/crate.png"
        data = crate.read_bytes()
        crate.write_bytes(data[:-1] + bytes([data[-1] ^ 1]))  # same size: a size-only compare would miss it
        os.utime(crate, ns=(OLD_MTIME, OLD_MTIME))
        ut_2d.make_demo_art(str(root), bench=1)
        self.assertEqual(rewritten(root), ["Assets/Art/Pixel/crate.png"])
        self.assertEqual(snapshot(root), before)

    def test_closes_the_files_it_writes_and_compares(self):
        root = project(self.id())
        result, leaks = unclosed(ut_2d.make_demo_art, str(root), bench=1)
        self.assertIn("crate", result)
        self.assertEqual(leaks, [])
        result, leaks = unclosed(ut_2d.make_demo_art, str(root), bench=1)
        self.assertIn("crate", result)
        self.assertEqual(leaks, [])


class ArchYamlMerge(unittest.TestCase):
    REPORT = "Conflicts:\r\nLeft m_Name A\r\nRight m_Value 3\n\n  Left\nConflict handling:\nLeft x y\n"

    def merge(self, report_text, code, **kwargs):
        """yaml_merge with the tool stubbed: it writes report_text (None: no report) and the merged file."""
        folder = TMP / self.id()
        folder.mkdir()
        out = folder / "o.prefab"
        calls = []

        def fake_run(cmd, capture_output=False, text=False, timeout=None):
            calls.append(cmd)
            if report_text is not None:
                Path(cmd[cmd.index("-o") + 1]).write_bytes(report_text.encode())
            Path(cmd[-1]).write_text("merged")
            return subprocess.CompletedProcess(cmd, code, "merged ", "with warnings")

        with unittest.mock.patch.object(ut_arch, "yaml_merge_path", lambda version=None: "/fake/UnityYAMLMerge"), \
                unittest.mock.patch.object(ut_arch.subprocess, "run", fake_run):
            result, leaks = unclosed(ut_arch.yaml_merge, "b.prefab", "t.prefab", "m.prefab", str(out), **kwargs)
        return result, leaks, calls, str(out)

    def test_conflicts_come_from_the_report(self):
        result, _, calls, out = self.merge(self.REPORT, 2, resolve="mine")
        self.assertEqual(result["exit_code"], 2)
        self.assertFalse(result["clean"])
        self.assertTrue(result["out_exists"])
        self.assertEqual(result["report"], out + ".conflicts.txt")
        self.assertEqual(result["conflicts"], ["Left m_Name A", "Right m_Value 3", "  Left"])
        self.assertEqual(result["conflict_fields"], ["m_Name", "m_Value"])
        self.assertEqual(result["stdout"], "merged with warnings")
        self.assertEqual(calls, [result["cmd"]])
        self.assertEqual(result["cmd"][:4], ["/fake/UnityYAMLMerge", "merge", "-h", "-r"])

    def test_explicit_report_path_is_read(self):
        report = str(TMP / "explicit-report.txt")
        result, _, _, _ = self.merge("Conflicts:\nLeft m_Name A\nConflict handling:\n", 2, report=report)
        self.assertEqual(result["report"], report)
        self.assertEqual(result["conflicts"], ["Left m_Name A"])

    @unittest.skipUnless(UTF8_LOCALE, "the report is read with the locale encoding")
    def test_non_ascii_report_is_decoded(self):
        result, _, _, _ = self.merge("Conflicts:\nLeft m_Name \u00c9p\u00e9e\nConflict handling:\n", 2)
        self.assertEqual(result["conflicts"], ["Left m_Name \u00c9p\u00e9e"])

    def test_exit_code_decides_clean(self):
        result, _, _, _ = self.merge(None, 2)
        self.assertEqual(result["conflicts"], [])
        self.assertFalse(result["clean"])

    def test_missing_report_means_no_conflicts(self):
        result, _, _, _ = self.merge(None, 0, premerge=True)
        self.assertTrue(result["clean"])
        self.assertEqual(result["conflicts"], [])
        self.assertEqual(result["conflict_fields"], [])
        self.assertIn("-p", result["cmd"])

    def test_report_is_closed(self):
        result, leaks, _, _ = self.merge(self.REPORT, 2)
        self.assertEqual(len(result["conflicts"]), 3)
        self.assertEqual(leaks, [])


class PipelineWriteRules(unittest.TestCase):
    def rules_path(self, root):
        return root / ut_pipeline.RULES_PATH

    def test_first_call_writes_the_defaults(self):
        root = project(self.id())
        path = ut_pipeline.write_rules(str(root))
        self.assertEqual(path, os.path.join(str(root), ut_pipeline.RULES_PATH))
        text = self.rules_path(root).read_text()
        self.assertEqual(text, json.dumps(ut_pipeline.DEFAULT_RULES, indent=2, sort_keys=True) + "\n")

    def test_second_call_does_not_rewrite(self):
        root = project(self.id())
        ut_pipeline.write_rules(str(root))
        before = self.rules_path(root).read_bytes()
        age(root)
        ut_pipeline.write_rules(str(root))
        self.assertEqual(rewritten(root), [])
        self.assertEqual(self.rules_path(root).read_bytes(), before)

    def test_override_rewrites_and_persists(self):
        root = project(self.id())
        ut_pipeline.write_rules(str(root))
        age(root)
        ut_pipeline.write_rules(str(root), texture_max_size=512)
        self.assertEqual(rewritten(root), [ut_pipeline.RULES_PATH])
        self.assertEqual(json.loads(self.rules_path(root).read_text())["texture_max_size"], 512)
        # The next call merges over the file, so the override survives.
        age(root)
        ut_pipeline.write_rules(str(root))
        self.assertEqual(rewritten(root), [])

    def test_whitespace_only_difference_is_rewritten(self):
        root = project(self.id())
        ut_pipeline.write_rules(str(root))
        expected = self.rules_path(root).read_text()
        self.rules_path(root).write_text(expected.rstrip("\n"))
        age(root)
        ut_pipeline.write_rules(str(root))
        self.assertEqual(rewritten(root), [ut_pipeline.RULES_PATH])
        self.assertEqual(self.rules_path(root).read_text(), expected)

    def test_malformed_rules_file_raises(self):
        root = project(self.id())
        self.rules_path(root).parent.mkdir(parents=True)
        self.rules_path(root).write_text('{"version": ')
        with self.assertRaises(json.JSONDecodeError):
            ut_pipeline.write_rules(str(root))

    def test_rules_file_is_closed(self):
        root = project(self.id())
        self.assertEqual(unclosed(ut_pipeline.write_rules, str(root))[1], [])
        self.assertEqual(unclosed(ut_pipeline.write_rules, str(root), texture_max_size=512)[1], [])
        result, leaks = unclosed(ut_pipeline.write_rules, str(root))
        self.assertEqual(result, str(self.rules_path(root)))
        self.assertEqual(leaks, [])


class VfxCopyTree(unittest.TestCase):
    FILES = {"x.cs": b"class X{}\n", "a/y.asmdef": b"{}\n", "a/b/z.cs": b"// \xc3\xa9\r\n", "a/b/empty.cs": b"",
             "a/skip.txt": b"no"}
    EXTS = (".cs", ".asmdef")

    def setUp(self):
        self.src, self.dst = TMP / self.id() / "src", TMP / self.id() / "dst"
        for rel, body in self.FILES.items():
            (self.src / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.src / rel).write_bytes(body)

    def copy(self):
        return sorted(os.path.relpath(p, self.dst) for p in ut_vfx._copy_tree(str(self.src), str(self.dst), self.EXTS))

    def test_copies_matching_extensions_only(self):
        expected = sorted(os.path.normpath(r) for r in self.FILES if r.endswith(self.EXTS))
        self.assertEqual(self.copy(), expected)
        self.assertEqual(snapshot(self.dst), {k: v for k, v in snapshot(self.src).items() if k.endswith(self.EXTS)})

    def test_second_copy_writes_nothing(self):
        self.copy()
        age(self.dst)
        self.assertEqual(self.copy(), [])
        self.assertEqual(rewritten(self.dst), [])

    def test_changed_file_is_restored(self):
        self.copy()
        (self.dst / "a/b/z.cs").write_bytes(b"changed")
        self.assertEqual(self.copy(), [os.path.join("a", "b", "z.cs")])
        self.assertEqual((self.dst / "a/b/z.cs").read_bytes(), self.FILES["a/b/z.cs"])

    def test_line_ending_change_is_restored(self):
        self.copy()
        (self.dst / "a/b/z.cs").write_bytes(b"// \xc3\xa9\n")  # the same text as a universal-newline read
        self.assertEqual(self.copy(), [os.path.join("a", "b", "z.cs")])
        self.assertEqual((self.dst / "a/b/z.cs").read_bytes(), self.FILES["a/b/z.cs"])

    def test_closes_the_files_it_compares(self):
        self.copy()
        result, leaks = unclosed(ut_vfx._copy_tree, str(self.src), str(self.dst), self.EXTS)
        self.assertEqual(result, [])
        self.assertEqual(leaks, [])


class ShadersLintProjectKeywords(unittest.TestCase):
    def setUp(self):
        self.root = project(self.id())
        files = {
            "Shaders/Lit.shader": b'Shader "X" { SubShader { Pass { HLSLPROGRAM\r\n#pragma shader_feature_local _GLOW\n'
                                  b"#pragma multi_compile _ _FOG\nENDHLSL } } }\n// \xff\xfe not UTF-8\n",
            "Shaders/old.cginc": b"#pragma shader_feature _LEGACY\n",
            "Scripts/T.cs": b'class T { void A(UnityEngine.Material m){ m.EnableKeyword("_GLOW"); '
                            b'm.EnableKeyword("_FOG"); } } // \xc3\x28\n',
            "Scripts/L.cs": b'class L { void A(UnityEngine.Material m){ m.EnableKeyword("_LEGACY"); } }\n',
            "Editor/E.cs": b'class E { void A(UnityEngine.Material m){ m.EnableKeyword("_GLOW"); } }\n',
        }
        for rel, body in files.items():
            p = self.root / "Assets" / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(body)

    def test_flags_runtime_toggles_of_shader_feature_keywords(self):
        findings = ut_shaders.lint_project_keywords(str(self.root))
        by_path = {f["path"]: f for f in findings}
        self.assertEqual(sorted(by_path), [os.path.join("Assets", "Scripts", "L.cs"),
                                           os.path.join("Assets", "Scripts", "T.cs")])
        for f in findings:
            self.assertEqual(f["code"], "shaders.runtime_toggle_shader_feature")
        self.assertIn('"_GLOW"', by_path[os.path.join("Assets", "Scripts", "T.cs")]["message"])
        self.assertIn("old.cginc", by_path[os.path.join("Assets", "Scripts", "L.cs")]["message"])

    def test_sources_are_closed(self):
        findings, leaks = unclosed(ut_shaders.lint_project_keywords, str(self.root))
        self.assertEqual(len(findings), 2)
        self.assertEqual(leaks, [])


class ShadersRunPsoPlayer(unittest.TestCase):
    LOG = (b"noise\nAGENT_PSO gameplay_start\nUploaded shader variant to the GPU driver: A (instance 0x1), pass: P, "
           b"stage: vertex, keywords K, time: 0.25 ms\r\nCompiled Shader: B, pass: Q\n\xff\xfe\nAGENT_PSO gameplay_end\n")

    def setUp(self):
        self.folder = TMP / self.id()
        self.folder.mkdir()
        self.out = self.folder / "probe.json"
        self.out.write_text('{"previous": true}')

    def run_player(self, probe=None, log=None, code=0):
        """run_pso_player with the player stubbed: it writes probe and log bytes (None: no file)."""
        def fake_call(argv, timeout=None):
            if probe is not None:
                self.out.write_bytes(probe)
            if log is not None:
                (self.folder / "probe.log").write_bytes(log)
            if code == "timeout":
                raise subprocess.TimeoutExpired(argv, timeout)
            return code

        with unittest.mock.patch.object(ut_shaders, "pso_player_command", lambda *a, **k: ["fake-player"]), \
                unittest.mock.patch("subprocess.call", fake_call):
            return unclosed(ut_shaders.run_pso_player, "/fake.app", "cold", str(self.out))

    def test_reads_probe_and_counts_gameplay_uploads(self):
        result, _ = self.run_player(b'{"frames": 60}', self.LOG, 0)
        self.assertEqual(result["probe"], {"frames": 60})
        self.assertEqual(result["exit_code"], 0)
        self.assertEqual(result["log"], str(self.folder / "probe.log"))
        self.assertEqual(result["compiled"]["gameplay"], 2)
        self.assertEqual(result["compiled"]["gameplay_by_shader"], {"A": 1, "B": 1})
        self.assertEqual(result["compiled"]["gameplay_upload_ms"], 0.25)
        self.assertTrue(result["compiled"]["marker_found"])
        self.assertEqual(json.loads((self.folder / "probe.json.prev").read_text()), {"previous": True})

    @unittest.skipUnless(UTF8_LOCALE, "the log is read with the locale encoding")
    def test_non_ascii_shader_name_is_decoded(self):
        log = "AGENT_PSO gameplay_start\nCompiled Shader: Custom/Caf\u00e9, pass: P\nAGENT_PSO gameplay_end\n"
        result, _ = self.run_player(b"{}", log.encode(), 0)
        self.assertEqual(result["compiled"]["gameplay_by_shader"], {"Custom/Caf\u00e9": 1})

    def test_missing_outputs_give_no_probe(self):
        result, _ = self.run_player(code=3)
        self.assertIsNone(result["probe"])
        self.assertEqual(result["exit_code"], 3)
        self.assertEqual(result["compiled"]["total"], 0)
        self.assertEqual(sorted(os.listdir(self.folder)), ["probe.json.prev"])

    def test_timeout_is_reported(self):
        result, _ = self.run_player(b'{"t": 1}', code="timeout")
        self.assertEqual(result["exit_code"], "timeout")
        self.assertEqual(result["probe"], {"t": 1})

    def test_malformed_probe_raises(self):
        result, leaks = self.run_player(b'{"frames": ', b"", 0)
        self.assertIsInstance(result, json.JSONDecodeError)
        self.assertEqual(leaks, [])

    def test_probe_and_log_are_closed(self):
        result, leaks = self.run_player(b'{"frames": 60}', self.LOG, 0)
        self.assertEqual(result["probe"], {"frames": 60})
        self.assertEqual(leaks, [])


if __name__ == "__main__":
    unittest.main()
