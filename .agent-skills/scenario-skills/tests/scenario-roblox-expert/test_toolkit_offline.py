"""Offline checks of the Roblox toolkit: window binding, playtest kits, and merging a user's place.

No Studio runs here: a fake replaces the StudioMCP proxy and lists the windows a test sets.
The place_slot tests take real flock locks in a temp cache, one of them from a second Python process.
A watchdog ends the run after 60 s, so a place_slot that blocks fails instead of holding the runner.
"""

import base64
import faulthandler
import gc
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import types
import unittest
import warnings
from unittest import mock

FAMILY = pathlib.Path(__file__).parents[2] / "skills/game-engines/roblox"
sys.path.insert(0, str(FAMILY / "scenario-roblox-expert/scripts"))
sys.path.insert(0, str(FAMILY / "scenario-roblox-tooling/scripts"))
sys.path.insert(0, str(FAMILY / "scenario-roblox-networking/scripts"))
sys.path.insert(0, str(FAMILY / "scenario-roblox-luau/scripts"))
sys.path.insert(0, str(FAMILY / "scenario-roblox-assets/scripts"))
sys.path.insert(0, str(FAMILY / "scenario-roblox-architecture/scripts"))

import rbx_architecture  # noqa: E402
import rbx_assets  # noqa: E402
import rbx_check  # noqa: E402
import rbx_env  # noqa: E402
import rbx_luau  # noqa: E402
import rbx_mcp  # noqa: E402
import rbx_net  # noqa: E402
import rbx_play  # noqa: E402
import rbx_tooling  # noqa: E402

USER = {"studio_id": "user-1", "name": "MyObby"}


class FakeStudio(rbx_mcp.Studio):
    """A Studio whose list_roblox_studios answer is the `windows` list."""

    def __init__(self, *args, windows=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.windows = windows if windows is not None else []

    def open(self):
        return self

    def close(self):
        pass

    def studios(self):
        return list(self.windows)


@mock.patch("rbx_mcp.time.sleep", lambda _s: None)
class Bind(unittest.TestCase):
    def test_place_never_binds_a_window_that_only_contains_its_name(self):
        s = FakeStudio(place="Obby.rbxl", windows=[USER])
        with self.assertRaises(rbx_mcp.MCPError):
            s.bind()

    def test_place_binds_its_own_window_by_name_or_stem(self):
        own = {"studio_id": "agent-1", "name": "Obby"}
        self.assertEqual(FakeStudio(place="Obby.rbxl", windows=[USER, own]).bind(), "agent-1")
        self.assertEqual(FakeStudio(place="MyObby.rbxl", windows=[USER, own]).bind(), "user-1")

    def test_studio_flag_keeps_the_substring_fallback(self):
        self.assertEqual(FakeStudio(studio="obby", windows=[USER]).bind(), "user-1")


@mock.patch("rbx_mcp.time.sleep", lambda _s: None)
@mock.patch("rbx_env.time.sleep", lambda _s: None)
@mock.patch("rbx_env.wait_for_gpu", lambda: {})
class OpenPlace(unittest.TestCase):
    def test_opens_the_agent_place_beside_a_user_window_sharing_its_name(self):
        windows = [USER]
        made = []

        def studio(**kwargs):
            made.append(FakeStudio(windows=windows, **kwargs))
            return made[-1]

        def launch(cmd, check):
            windows.append({"studio_id": "agent-1", "name": "Obby"})

        with mock.patch("rbx_env.Studio", studio), mock.patch("rbx_env.subprocess.run", launch):
            s = rbx_env.open_place("/tmp/agent/Obby.rbxl", timeout=30)
        self.assertEqual(s.studio_id, "agent-1")


class MergePlace(unittest.TestCase):
    """The lead routes existing games through merge_place, so it must run in an unscaffolded repo."""

    def run_merge(self, root):
        seen = {}

        def lune(cmd, cwd, **_kwargs):
            script = pathlib.Path(cwd, cmd[2])
            seen.update(cmd=cmd, cwd=cwd, script=script.exists(), shipcheck=(script.parent / "testkit/ShipCheck.luau").exists())
            return mock.Mock(returncode=0, stdout='{"replaced": []}\n', stderr="")

        with mock.patch("rbx_tooling.subprocess.run", lune):
            report = rbx_tooling.merge_place(root, base="base.rbxl", code="code.rbxl", out="out.rbxl",
                                             project="default.project.json")
        return report, seen

    def test_unscaffolded_repo_runs_the_template_script_with_shipcheck(self):
        with tempfile.TemporaryDirectory() as root:
            report, seen = self.run_merge(root)
        self.assertEqual(report["exit"], 0)
        self.assertEqual(seen["cwd"], pathlib.Path(root).resolve())
        self.assertTrue(seen["script"] and seen["shipcheck"], seen)

    def test_scaffolded_repo_keeps_its_own_script(self):
        with tempfile.TemporaryDirectory() as root:
            (pathlib.Path(root) / "tools").mkdir()
            (pathlib.Path(root) / "tools/merge_place.luau").write_text("")
            _report, seen = self.run_merge(root)
        self.assertEqual(seen["cmd"][:3], ["lune", "run", "tools/merge_place"])


class VendorKit(unittest.TestCase):
    def test_copies_netkit_into_the_repository_with_paths_inside_it(self):
        with tempfile.TemporaryDirectory() as root:
            tree = rbx_net.vendor_kit(root, dest="src/server/NetKit")
            for name, node in tree.items():
                if name == "$className":
                    continue
                self.assertEqual(node["$path"], f"src/server/NetKit/{name}.luau")
                self.assertTrue((pathlib.Path(root) / node["$path"]).is_file(), name)
            self.assertIn("Net", tree)


class Sourcemap(unittest.TestCase):
    def test_luau_sourcemap_includes_non_scripts(self):
        seen = []
        with mock.patch("rbx_luau.subprocess.run", lambda cmd, **_k: seen.append(cmd) or mock.Mock(returncode=0)):
            rbx_luau.sourcemap(tempfile.gettempdir())
        self.assertIn("--include-non-scripts", seen[0])


class Payloads(unittest.TestCase):
    """Studio decodes payloads with DecompressBuffer Zstd, and compression.zstd is Python 3.14+ only."""

    SIZES = (0, 1, 131072, 131073, 300000)

    def test_stored_frame_decodes_with_a_real_zstd_decoder(self):
        try:
            from compression import zstd
        except ImportError:
            self.skipTest("compression.zstd needs Python 3.14")
        for n in self.SIZES:
            raw = bytes(i % 251 for i in range(n))
            self.assertEqual(zstd.decompress(rbx_assets._zstd_stored(raw)), raw, n)

    def test_payloads_pack_without_compression_zstd(self):
        with mock.patch.dict(sys.modules, {"compression": None}):
            b = rbx_assets._zb64(b"roblox" * 1000)
        self.assertTrue(base64.b64decode(b).startswith(b"\x28\xb5\x2f\xfd"))


class Analyzer(unittest.TestCase):
    """An analyzer that fails without printing findings must not pass the check."""

    def run_check(self, returncode, out):
        fake = mock.Mock(returncode=returncode, stdout=out, stderr="")
        with tempfile.NamedTemporaryFile(suffix=".luau") as f, \
                mock.patch("rbx_check.subprocess.run", return_value=fake), \
                mock.patch("rbx_check.luau_lsp", return_value="luau-lsp"), \
                mock.patch("rbx_check.definitions", return_value="defs.d.luau"):
            return rbx_check.check([f.name]), rbx_architecture.typecheck([f.name])

    def test_crash_with_no_findings_fails(self):
        for r in self.run_check(1, "error: unknown flag --platform=roblox\n"):
            self.assertFalse(r["ok"])
            self.assertIn("unknown flag", r["errors"][0]["msg"])

    def test_findings_are_not_doubled_by_the_exit_code(self):
        line = "a.luau(3,5): TypeError: Type 'number' could not be converted into 'string'\n"
        for r in self.run_check(1, line):
            self.assertEqual(len(r["errors"]), 2)  # one per solver, no extra exit-code row

    def test_clean_run_passes(self):
        for r in self.run_check(0, ""):
            self.assertTrue(r["ok"])


class PlaytestKit(unittest.TestCase):
    def test_server_and_client_forward_kit(self):
        calls = []
        with mock.patch("rbx_play.run", lambda *a: calls.append(a) or {"ok": True}):
            pt = rbx_play.Playtest(FakeStudio())
            pt.server("return 1", kit=["Spec"])
            pt.client("return 2", kit=["Stats"])
        self.assertEqual([(c[2], tuple(c[4])) for c in calls], [("Server", ("Spec",)), ("Client", ("Stats",))])


@unittest.skipIf(sys.platform == "win32", "place_slot locks with flock")
class PlaceSlot(unittest.TestCase):
    """Studio slots are flock locks on files in CACHE/slots, one per slot."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.cache = pathlib.Path(tmp.name)
        self.slots = self.cache / "slots"
        faulthandler.dump_traceback_later(60, exit=True)
        self.addCleanup(faulthandler.cancel_dump_traceback_later)
        import fcntl

        self.fcntl = fcntl
        self.sleeps = 0
        # Replacing the module rbx_env sees, not time.sleep itself, keeps Popen.wait sleeping normally.
        fake_time = types.SimpleNamespace(time=time.time, sleep=self.sleep)
        fake_fcntl = types.SimpleNamespace(flock=self.nonblocking_flock, LOCK_EX=fcntl.LOCK_EX, LOCK_NB=fcntl.LOCK_NB,
                                           LOCK_UN=fcntl.LOCK_UN)
        for patch in (mock.patch.object(rbx_env, "CACHE", self.cache), mock.patch.object(rbx_env, "RBX_MAX", 2),
                      mock.patch.object(rbx_env, "time", fake_time), mock.patch.object(rbx_env, "fcntl", fake_fcntl)):
            patch.start()
            self.addCleanup(patch.stop)

    def sleep(self, _s):
        self.sleeps += 1
        if self.sleeps > 20:
            raise AssertionError("place_slot kept waiting past its deadline")

    def nonblocking_flock(self, f, op):
        # A blocking flock on a slot this process holds never returns, so it fails here instead.
        if op & self.fcntl.LOCK_EX and not op & self.fcntl.LOCK_NB:
            raise AssertionError("place_slot took a blocking lock")
        return self.fcntl.flock(f, op)

    def lockable(self, i):
        import fcntl

        # flock locks belong to the open file, so a second open in this process contends like another process.
        with open(self.slots / f"slot{i}.lock", "a") as f:
            try:
                fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return False
            fcntl.flock(f, fcntl.LOCK_UN)
            return True

    def hold_all(self):
        import fcntl

        self.slots.mkdir(parents=True, exist_ok=True)
        for i in range(2):
            f = open(self.slots / f"slot{i}.lock", "w")  # noqa: SIM115 (held until cleanup)
            self.addCleanup(f.close)
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def assert_no_unclosed_slot(self, caught):
        leaks = [str(w.message) for w in caught if issubclass(w.category, ResourceWarning) and "slot" in str(w.message)]
        self.assertEqual(leaks, [])

    def test_a_second_process_holding_a_slot_leaves_the_other_one(self):
        code = ("import sys; sys.path.insert(0, sys.argv[1]); import rbx_env\n"
                "with rbx_env.place_slot(timeout=0) as i:\n    print(i, flush=True); sys.stdin.read()")
        env = dict(os.environ, RBX_SKILLS_CACHE=str(self.cache), RBX_MAX="2")
        child = subprocess.Popen([sys.executable, "-B", "-c", code, str(pathlib.Path(rbx_env.__file__).parent)],
                                 stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
        try:
            self.assertEqual(child.stdout.readline().strip(), "0")
            with rbx_env.place_slot(timeout=0) as i:
                self.assertEqual(i, 1)
                self.assertFalse(self.lockable(1))
                self.assertEqual((self.slots / "slot1.lock").read_text(), f"{os.getpid()}\n")
            self.assertTrue(self.lockable(1))
            self.assertFalse(self.lockable(0))
        finally:
            child.stdin.close()
            try:
                child.wait(timeout=30)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
            child.stdout.close()
        self.assertEqual(child.returncode, 0)
        self.assertTrue(self.lockable(0))

    def test_all_slots_busy_raises_timeout(self):
        self.hold_all()
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            with self.assertRaisesRegex(TimeoutError, r"RBX_MAX=2"), rbx_env.place_slot(timeout=0):
                self.fail("acquired a busy slot")
            gc.collect()
        self.assert_no_unclosed_slot(caught)

    def test_a_reused_slot_holds_only_the_current_pid(self):
        with rbx_env.place_slot(timeout=0) as i:
            self.assertEqual(i, 0)
        with rbx_env.place_slot(timeout=0) as i:
            self.assertEqual(i, 0)
            self.assertEqual((self.slots / "slot0.lock").read_text(), f"{os.getpid()}\n")
        self.assertEqual(self.sleeps, 0)

    def test_body_raising_releases_the_lock_and_closes_the_file(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            raised = None
            try:
                with rbx_env.place_slot(timeout=0) as i:
                    self.assertEqual(i, 0)
                    raise ValueError("boom")
            except ValueError as e:
                raised = str(e)
            gc.collect()
        self.assertEqual(raised, "boom")
        self.assert_no_unclosed_slot(caught)
        self.assertTrue(self.lockable(0))

    def test_flock_error_closes_the_slot_file(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            try:
                with mock.patch("rbx_env.fcntl.flock", side_effect=OSError(9, "Bad file descriptor")), \
                        rbx_env.place_slot(timeout=0):
                    self.fail("acquired a slot without a lock")
            except OSError as e:
                self.assertEqual(e.errno, 9)
            gc.collect()
        self.assert_no_unclosed_slot(caught)

    def test_failed_pid_write_closes_the_file_and_frees_the_slot(self):
        real_open = open

        class NoWrite:
            def __init__(self, f):
                self.f = f

            def fileno(self):
                return self.f.fileno()

            def write(self, _s):
                raise OSError(28, "No space left on device")

            def close(self):
                self.f.close()

            def __enter__(self):
                return self

            def __exit__(self, *_exc):
                self.f.close()

        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", ResourceWarning)
            try:
                with mock.patch.object(rbx_env, "open", lambda *a, **k: NoWrite(real_open(*a, **k)), create=True), \
                        rbx_env.place_slot(timeout=0):
                    self.fail("entered the body after a failed write")
            except OSError as e:
                self.assertEqual(e.errno, 28)
            gc.collect()
        self.assert_no_unclosed_slot(caught)
        self.assertTrue(self.lockable(0))


if __name__ == "__main__":
    unittest.main()
