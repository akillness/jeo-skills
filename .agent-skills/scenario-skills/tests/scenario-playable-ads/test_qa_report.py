"""qa.py's own logic, run in-process against fake_playwright's simulated playable instead of Chromium.

The browser is the only thing faked: bot actions, storyboard triggers, the check verdicts, size and
package limits, report naming and the exit code all run as shipped. test_qa.py covers the real
browser run where Playwright is installed.
"""

import contextlib
import importlib.util
import io
import json
import shutil
import sys
import tempfile
import types
import unittest
import zipfile
from pathlib import Path
import unittest.mock as mock

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fake_playwright  # noqa: E402
import playable  # noqa: E402

QA = playable.SCRIPTS / "qa.py"
MB = 1024 * 1024
API = {"meta": "FbPlayableAd.onCTAClick", "google": "ExitApi.exit", "moloco": "FbPlayableAd.onCTAClick",
       "applovin": "mraid.open", "unity": "mraid.open", "mraid": "mraid.open", "mintegral": "install",
       "liftoff": "postMessage:download", "pangle": "openAppStore"}
GATED = ("applovin", "unity", "mraid", "mintegral")
ZIPPED = ("meta", "google", "liftoff", "pangle")

# One action per tick from 0.4 s: every action kind, each right after a joystick press so qa.py must
# lift the finger first, and one idle tick while pressed. Seven taps land, which wins the fake game.
BOT = '''
_script = [{"move": (1, 0)}, None, {"move": (0, -1)}, {"click": (100, 200)}, {"move": (1, 0)},
           {"drag": ((100, 300), (200, 300))}, {"move": (0, 1)}, {"tap_rel": (0.5, 0.5)}]
_state = {"i": 0}


def active(snap, t):
    if t < 0.4 or snap["phase"] != "play" or _state["i"] >= len(_script):
        return None
    _state["i"] += 1
    return _script[_state["i"] - 1]
'''
FAIL = '''

def fail(snap, t):
    return {"click": (100, 200)} if 0.4 <= t < 0.5 else None
'''
STORY = '''

STORYBOARD = [
    ("a-start", {"time": 0.2}),
    ("b-third-pop", {"event": "pop", "nth": 2, "delay": 0.1}),
    ("c-score-five", {"event": "pop", "data": {"score": {">=": 5}}}),
    ("d-end", {"snap": lambda s: s["phase"] == "end"}),
    ("e-never", {"event": "bonus"}),
]
STORYBOARD_IDLE = [("f-idle", {"time": 1.0}), ("g-idle-end", {"event": "endcard", "delay": 0.5})]
COMPARE = {"a-start": "frames/real.png"}
CTA_WAIT = "endcard"
ACTIVE_LENGTH = (1, 4)
'''


def write_zip(path, files):
    with zipfile.ZipFile(path, "w") as z:
        for name, data in files.items():
            z.writestr(name, data)


def new_project(parent, bot=BOT + FAIL + STORY, nets=tuple(API) + ("web",)):
    """A project as build.py leaves it: dist/<net>/index.html, the zipped networks' packages, a qa_bot.py."""
    project = Path(parent) / "demo"
    project.mkdir()
    (project / "qa_bot.py").write_text(bot, encoding="utf-8")
    for net in nets:
        (project / "dist" / net).mkdir(parents=True)
        (project / "dist" / net / "index.html").write_text("<!doctype html><title>demo</title>", encoding="utf-8")
        if net in ZIPPED:
            files = {"index.html": "<!doctype html>"}
            if net == "pangle":
                files["config.json"] = json.dumps({"playable_orientation": 1})
            write_zip(project / "dist" / net / f"demo-{net}.zip", files)
    (project / "frames").mkdir()
    Image.new("RGB", (300, 600), (200, 40, 40)).save(project / "frames" / "real.png")
    return project


def run_qa(project, *args, faults=()):
    """Execute qa.py as `python3 qa.py <project> <args>` would, with the fake browser; returns (module, exit code, stdout)."""
    fake_playwright.reset(*faults)
    pkg = types.ModuleType("playwright")
    pkg.sync_api = fake_playwright
    spec = importlib.util.spec_from_file_location("playable_ads_qa", QA)
    mod = importlib.util.module_from_spec(spec)
    out = io.StringIO()
    code = None
    with (mock.patch.dict(sys.modules, {"playwright": pkg, "playwright.sync_api": fake_playwright}),
          mock.patch.object(sys, "argv", ["qa.py", str(project), *args]), contextlib.redirect_stdout(out)):
        try:
            spec.loader.exec_module(mod)
        except SystemExit as e:
            code = e.code
    return mod, code, out.getvalue()


def expected_checks():
    names = {"hook_moves_without_input", "audio_off_before_first_touch", "mute_button_toggles_without_starting",
             "idle_reaches_endcard", "idle_never_autoplays", "idle_timeout_endcard_by_15s",
             "touch_once_then_idle_reaches_endcard", "replay_restarts_game", "active_wins", "active_length_1_4s",
             "fail_path_loses", "cta_mintegral_load_calls_gameReady", "cta_mintegral_endcard_signals_gameEnd",
             "cta_mintegral_replay_signals_gameRetry", "cta_liftoff_endcard_posts_complete",
             "zero_network_requests", "no_console_errors"}
    for net, api in API.items():
        names |= {f"cta_{net}_endcard_calls_{api}", f"cta_{net}_pill_calls_{api}", f"{net}_size_ok"}
    names |= {f"cta_{net}_first_tap_never_opens_store" for net in ("applovin", "unity", "mraid")}
    for net in GATED:
        names |= {f"gate_{net}_{k}" for k in ("nothing_runs_before_viewable", "runs_after_viewable",
                                              "pauses_when_hidden", "resumes")}
    names |= {f"package_ok_{net}" for net in ZIPPED}
    return names


class FullQaRunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.project = new_project(cls.tmp)
        cls.mod, cls.code, cls.out = run_qa(cls.project)
        cls.pages = list(fake_playwright.PAGES)
        cls.qa = cls.project / "qa"
        cls.report = json.loads((cls.qa / "report.json").read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def shot(self, name):
        return next(s for p in self.pages for s in p.screenshots if s["name"] == name)

    def test_a_healthy_playable_passes_every_check_and_exits_zero(self):
        failed = [k for k, v in self.report["checks"].items() if not v]
        self.assertEqual(failed, [], self.out)
        self.assertEqual(self.code, 0)
        self.assertIn("PASS zero_network_requests", self.out)

    def test_every_built_network_gets_its_checks(self):
        self.assertEqual(set(self.report["checks"]), expected_checks())

    def test_the_report_records_each_run(self):
        runs = self.report["runs"]
        self.assertEqual(runs["idle"]["max_progress"], 0)
        self.assertFalse(runs["idle"]["progress_missing"])
        self.assertAlmostEqual(runs["idle"]["endcard_at"], fake_playwright.IDLE, delta=0.1)
        self.assertIsNone(runs["idle"]["result"])
        self.assertEqual(runs["active"]["result"], "win")
        self.assertEqual(runs["fail"]["result"], "lose")
        self.assertEqual(self.report["sizes"]["meta"], len("<!doctype html><title>demo</title>"))
        self.assertEqual(self.report["speed"], 2)
        self.assertEqual(self.report["project"], "demo")

    def test_first_party_and_allowed_external_requests_do_not_count(self):
        # every page requested its own file: and data: URLs, google and pangle their one allowed file
        self.assertTrue(all(r["requests"] == [] for r in self.report["runs"].values()))

    def test_the_mraid_first_tap_starts_the_game_without_opening_the_store(self):
        for net in ("applovin", "unity", "mraid"):
            cta = self.report["runs"][f"cta_{net}"]
            self.assertEqual(cta["first_calls"], [])
            self.assertEqual(cta["pill_calls"], ["mraid.open"])
        self.assertIsNone(self.report["runs"]["cta_meta"]["first_calls"])

    def test_bot_actions_become_mouse_input(self):
        page = next(p for p in self.pages if ("down", 202.5, 561.6) in p.mouse_log)
        log = page.mouse_log
        # the joystick drags from (0.5, 0.78) of the viewport by 70 px times the snapshot's scale
        self.assertIn(("move", 237.5, 561.6), log)
        self.assertIn(("move", 202.5, 526.6), log)
        i = log.index(("move", 100, 300))
        self.assertEqual(log[i + 1:i + 4], [("down", 100, 300), ("move", 200, 300), ("up",)])
        self.assertIn(("click", 202.5, 360.0), log)
        # a click, drag or relative tap lifts a held joystick first, and an idle tick lifts it too
        for action in (("click", 100, 200), ("move", 100, 300), ("click", 202.5, 360.0)):
            self.assertEqual(log[log.index(action) - 1], ("up",), action)
        self.assertEqual(log[log.index(("move", 237.5, 561.6)) + 1], ("up",))

    def test_storyboard_frames_fire_on_their_triggers_while_paused(self):
        pops = [e for e in self.report["runs"]["active"]["events"] if e["name"] == "pop"]
        third = self.shot("story_b-third-pop.png")
        self.assertGreaterEqual(third["t"], pops[2]["t"] + 0.1)
        self.assertLess(third["t"], pops[2]["t"] + 0.3)
        five = self.shot("story_c-score-five.png")
        self.assertGreaterEqual(five["t"], next(e["t"] for e in pops if e["data"]["score"] == 5))
        self.assertLessEqual(five["t"], pops[5]["t"])  # the next tick, before the sixth tap lands
        self.assertGreaterEqual(self.shot("story_a-start.png")["t"], 0.2)
        idle_end = self.shot("story_g-idle-end.png")
        self.assertGreaterEqual(idle_end["t"], self.report["runs"]["idle"]["endcard_at"] + 0.5)
        for name in ("a-start", "b-third-pop", "c-score-five", "d-end", "f-idle", "g-idle-end"):
            self.assertTrue(self.shot(f"story_{name}.png")["paused"], name)
        self.assertFalse((self.qa / "story_e-never.png").exists())

    def test_compare_sheet_pairs_a_real_frame_with_its_storyboard_frame(self):
        # six frames at 640 px high: 405 x 720 shots become 360 wide, the 300 x 600 real frame 320,
        # its tile adds a 12 px gap, and 16 px margins surround seven gaps
        self.assertEqual(playable.image_size(self.qa / "storyboard_vs_real.jpg"), (2604, 716))

    def test_hook_and_orientation_frames_are_written(self):
        for name, size in (("view_portrait.png", (405, 720)), ("view_landscape.png", (844, 390)),
                           ("view_tablet.png", (768, 1024)), ("hook_0.0s.png", (405, 720)),
                           ("replay_after.png", (405, 720))):
            self.assertEqual(playable.image_size(self.qa / name), size, name)
        self.assertGreaterEqual(self.report["runs"]["hook"]["changed_pixels"], 0.03)

    def test_each_run_network_and_viewport_gets_a_fresh_page(self):
        self.assertTrue(self.pages)
        self.assertEqual(len(self.pages), 4 + 2 + len(API) + len(GATED) + 3)


class DataMatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.mod, _, _ = run_qa(new_project(cls.tmp, nets=()), "--only", "none")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def test_plain_values_match_by_equality(self):
        self.assertTrue(self.mod.data_match({"tier": 3, "x": 1}, {"tier": 3}))
        self.assertFalse(self.mod.data_match({"tier": 2}, {"tier": 3}))
        self.assertTrue(self.mod.data_match(None, {}))

    def test_comparisons(self):
        dm = self.mod.data_match
        for op, ref, hit, miss in ((">=", 3, 3, 2), (">", 3, 4, 3), ("<=", 3, 3, 4), ("<", 3, 2, 3),
                                   ("!=", 3, 2, 3), ("==", 3, 3, 2)):
            self.assertTrue(dm({"n": hit}, {"n": {op: ref}}), op)
            self.assertFalse(dm({"n": miss}, {"n": {op: ref}}), op)
        self.assertTrue(dm({"n": 5}, {"n": {">": 3, "<": 9}}))
        self.assertFalse(dm({"n": 10}, {"n": {">": 3, "<": 9}}))

    def test_a_missing_field_never_matches_a_comparison(self):
        self.assertFalse(self.mod.data_match({}, {"n": {">=": 0}}))
        self.assertFalse(self.mod.data_match(None, {"n": {">=": 0}}))


class PartialRunTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp)

    def report(self, project, only):
        return json.loads((project / "qa" / f"report_{only}.json").read_text(encoding="utf-8"))

    def test_a_partial_run_writes_its_own_report_and_leaves_the_full_one_alone(self):
        project = new_project(self.tmp)
        _, code, out = run_qa(project, "--only", "idle,hook")
        self.assertEqual(code, 0, out)
        self.assertFalse((project / "qa" / "report.json").exists())
        self.assertEqual(set(self.report(project, "hook+idle")["runs"]), {"hook", "idle"})

    def test_a_frozen_hook_and_a_leaking_page_fail_their_checks(self):
        project = new_project(self.tmp)
        _, code, out = run_qa(project, "--only", "hook", faults=("frozen_hook", "leak"))
        checks = self.report(project, "hook")["checks"]
        self.assertFalse(checks["hook_moves_without_input"])
        self.assertFalse(checks["zero_network_requests"])
        self.assertFalse(checks["no_console_errors"])
        self.assertTrue(checks["audio_off_before_first_touch"])
        self.assertTrue(checks["mute_button_toggles_without_starting"])
        hook = self.report(project, "hook")["runs"]["hook"]
        self.assertEqual(hook["requests"], ["https://tracker.invalid/pixel.gif"])
        self.assertEqual(hook["errors"], ["error: Uncaught ReferenceError: x is not defined", "pageerror: boom"])
        self.assertEqual(code, 1)
        self.assertIn("FAIL hook_moves_without_input", out)

    def test_an_autoplaying_idle_run_fails_the_never_autoplay_rule(self):
        project = new_project(self.tmp)
        _, code, _ = run_qa(project, "--only", "idle", faults=("autoplay",))
        checks = self.report(project, "idle")["checks"]
        self.assertFalse(checks["idle_never_autoplays"])
        self.assertTrue(checks["idle_reaches_endcard"])
        self.assertEqual(code, 1)

    def test_a_snapshot_without_progress_and_a_run_out_of_time_fail_the_idle_checks(self):
        project = new_project(self.tmp)
        _, code, _ = run_qa(project, "--only", "idle", "--timeout", "3", faults=("no_progress",))
        rep = self.report(project, "idle")
        self.assertTrue(rep["runs"]["idle"]["progress_missing"])
        self.assertIsNone(rep["runs"]["idle"]["endcard_at"])
        for k in ("idle_reaches_endcard", "idle_never_autoplays", "idle_timeout_endcard_by_15s"):
            self.assertFalse(rep["checks"][k], k)
        self.assertEqual(code, 1)

    def test_store_on_first_tap_and_a_missing_retry_fail_their_cta_checks(self):
        project = new_project(self.tmp)
        _, code, _ = run_qa(project, "--only", "cta", faults=("store_on_first_tap", "no_retry"))
        checks = self.report(project, "cta")["checks"]
        failed = {k for k, v in checks.items() if not v}
        self.assertEqual(failed, {"cta_applovin_first_tap_never_opens_store", "cta_unity_first_tap_never_opens_store",
                                  "cta_mraid_first_tap_never_opens_store", "cta_mintegral_replay_signals_gameRetry"})
        self.assertEqual(code, 1)

    def test_an_ad_that_ignores_the_container_fails_the_gate(self):
        project = new_project(self.tmp)
        _, code, _ = run_qa(project, "--only", "gate", faults=("ignores_gate",))
        checks = self.report(project, "gate")["checks"]
        for net in GATED:
            self.assertFalse(checks[f"gate_{net}_nothing_runs_before_viewable"], net)
            self.assertTrue(checks[f"gate_{net}_pauses_when_hidden"], net)
            self.assertTrue(checks[f"gate_{net}_resumes"], net)
        self.assertEqual(code, 1)

    def test_sound_that_keeps_playing_while_hidden_fails_the_pause(self):
        project = new_project(self.tmp)
        _, code, _ = run_qa(project, "--only", "gate", faults=("loud_when_hidden",))
        rep = self.report(project, "gate")
        for net in GATED:
            self.assertEqual(rep["runs"][f"gate_{net}"]["t_hold_a"], rep["runs"][f"gate_{net}"]["t_hold_b"], net)
            self.assertFalse(rep["checks"][f"gate_{net}_pauses_when_hidden"], net)
            self.assertTrue(rep["checks"][f"gate_{net}_runs_after_viewable"], net)
        self.assertEqual(code, 1)

    def test_a_container_that_never_says_viewable_fails_runs_after_viewable(self):
        project = new_project(self.tmp)
        _, code, _ = run_qa(project, "--only", "gate", faults=("never_viewable",))
        checks = self.report(project, "gate")["checks"]
        for net in GATED:
            self.assertTrue(checks[f"gate_{net}_nothing_runs_before_viewable"], net)
            self.assertFalse(checks[f"gate_{net}_runs_after_viewable"], net)
        self.assertEqual(code, 1)

    def test_each_fault_fails_exactly_its_own_checks(self):
        cases = (
            ("audio_at_load", ("hook",), {"audio_off_before_first_touch"}),
            ("mute_starts_game", ("hook",), {"mute_button_toggles_without_starting"}),
            ("slow_idle", ("idle",), {"idle_timeout_endcard_by_15s"}),
            ("hangs_after_first_touch", ("touch_idle", "--timeout", "12"), {"touch_once_then_idle_reaches_endcard"}),
            ("cant_win", ("active",), {"active_wins", "active_length_1_4s"}),
            ("no_lose", ("fail",), {"fail_path_loses"}),
            ("frozen_replay", ("replay",), {"replay_restarts_game"}),
            ("replay_ends_at_once", ("replay",), {"replay_restarts_game"}),
            ("dead_pill", ("cta",), {f"cta_{n}_pill_calls_{a}" for n, a in API.items()}),
            ("dead_endcard_cta", ("cta",), {f"cta_{n}_endcard_calls_{a}" for n, a in API.items()}),
            ("no_game_ready", ("cta",), {"cta_mintegral_load_calls_gameReady"}),
            ("late_game_end", ("cta",), {"cta_mintegral_endcard_signals_gameEnd"}),
            ("no_complete", ("cta",), {"cta_liftoff_endcard_posts_complete"}),
            ("early_touch", ("gate",), {f"gate_{n}_nothing_runs_before_viewable" for n in GATED}),
            ("runs_while_hidden", ("gate",), {f"gate_{n}_pauses_when_hidden" for n in GATED}),
            ("silent_after_resume", ("gate",), {f"gate_{n}_resumes" for n in GATED}),
        )
        for fault, args, want in cases:
            with self.subTest(fault):
                parent = Path(self.tmp) / fault
                parent.mkdir()
                project = new_project(parent)
                _, code, out = run_qa(project, "--only", *args, faults=(fault,))
                checks = self.report(project, args[0])["checks"]
                self.assertEqual({k for k, v in checks.items() if not v}, want, out)
                self.assertGreater(len(checks), len(want))
                self.assertEqual(code, 1)

    def test_a_bot_without_fail_or_length_uses_the_default_window(self):
        project = new_project(self.tmp, bot=BOT)
        _, code, _ = run_qa(project, "--only", "active,fail")
        rep = self.report(project, "active+fail")
        self.assertEqual(set(rep["runs"]), {"active"})
        self.assertTrue(rep["checks"]["active_wins"])
        # the fake game ends in about 2 s, far under the default 33 to 52 s
        self.assertFalse(rep["checks"]["active_length_33_52s"])
        self.assertNotIn("fail_path_loses", rep["checks"])
        self.assertEqual(code, 1)


class SizeAndPackageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp)
        self.project = new_project(self.tmp, nets=("meta", "google", "liftoff", "pangle", "unity"))
        self.dist = self.project / "dist"

    def checks(self):
        _, code, _ = run_qa(self.project, "--only", "shots")
        rep = json.loads((self.project / "qa" / "report_shots.json").read_text(encoding="utf-8"))
        return rep, code

    def test_meta_html_over_two_megabytes_fails_and_the_rest_pass(self):
        (self.dist / "meta" / "index.html").write_bytes(b" " * (2 * MB + 1))
        rep, code = self.checks()
        c = rep["checks"]
        self.assertFalse(c["meta_size_ok"])
        self.assertEqual(rep["sizes"]["meta"], 2 * MB + 1)
        for k in ("google_size_ok", "liftoff_size_ok", "pangle_size_ok", "unity_size_ok", "package_ok_meta",
                  "package_ok_google", "package_ok_liftoff", "package_ok_pangle"):
            self.assertTrue(c[k], k)
        self.assertNotIn("package_ok_unity", c)
        self.assertNotIn("moloco_size_ok", c)
        self.assertEqual(code, 1)

    def test_a_zip_over_five_megabytes_fails(self):
        for net in ("google", "liftoff", "pangle"):
            with self.subTest(net):
                z = self.dist / net / f"demo-{net}.zip"
                saved = z.read_bytes()
                with zipfile.ZipFile(z, "a", zipfile.ZIP_STORED) as f:
                    f.writestr("filler.bin", b"x" * (5 * MB))
                rep, _ = self.checks()
                failed = {k for k, v in rep["checks"].items() if not v}
                self.assertEqual(failed, {f"{net}_size_ok"})
                self.assertGreater(rep["sizes"][net], 5 * MB)
                z.write_bytes(saved)

    def test_a_package_without_index_html_at_the_root_fails(self):
        write_zip(self.dist / "liftoff" / "demo-liftoff.zip", {"game/index.html": "<!doctype html>"})
        rep, code = self.checks()
        self.assertFalse(rep["checks"]["package_ok_liftoff"])
        self.assertEqual(code, 1)

    def test_pangle_needs_a_config_with_playable_orientation(self):
        z = self.dist / "pangle" / "demo-pangle.zip"
        for config, ok in ((None, False), ("{not json", False), ('{"orientation": 1}', False),
                           ('{"playable_orientation": 2}', True)):
            files = {"index.html": "<!doctype html>"}
            if config is not None:
                files["config.json"] = config
            write_zip(z, files)
            rep, code = self.checks()
            self.assertEqual(rep["checks"]["package_ok_pangle"], ok, config)
            self.assertEqual(code, 0 if ok else 1, config)


if __name__ == "__main__":
    unittest.main()
