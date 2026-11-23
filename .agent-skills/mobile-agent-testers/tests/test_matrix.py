"""scripts/matrix.py (one job per persona), personas.json, and the workflow that reads both."""
import json
import os
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PERSONAS = json.loads((ROOT / "personas.json").read_text(encoding="utf-8"))
WORKFLOW = (ROOT / ".github/workflows/agent-testers.yml").read_text(encoding="utf-8")
# Values `xcrun simctl ui <udid> content_size` accepts
IOS_TEXT_SIZES = {"extra-small", "small", "medium", "large", "extra-large", "extra-extra-large",
                  "extra-extra-extra-large", "accessibility-medium", "accessibility-large",
                  "accessibility-extra-large", "accessibility-extra-extra-large",
                  "accessibility-extra-extra-extra-large"}


def matrix(platform, personas):
    env = dict(os.environ, PLATFORM=platform, PERSONAS=personas)
    return subprocess.run([sys.executable, "scripts/matrix.py"], cwd=ROOT, env=env, capture_output=True, text=True)


def rows(platform, personas):
    out = matrix(platform, personas)
    if out.returncode:
        raise AssertionError(out.stderr)
    key, _, value = out.stdout.strip().partition("=")
    assert key == platform, out.stdout
    return json.loads(value)


def job(name):
    """Text of one job of the workflow, up to the next job."""
    return re.search(rf"\n  {name}:\n(.*?)(?=\n  [a-z-]+:\n|\Z)", WORKFLOW, re.S).group(1)


class Matrix(unittest.TestCase):
    def test_all_takes_every_persona_of_the_platform(self):
        for platform in ("android", "ios"):
            expected = [p["id"] for p in PERSONAS if p["platform"] == platform]
            self.assertEqual([r["persona"] for r in rows(platform, "all")], expected)

    def test_none_and_empty_skip_the_platform(self):
        self.assertEqual(rows("ios", "none"), [])
        self.assertEqual(rows("android", ""), [])

    def test_names_keep_their_order_and_spaces_are_ignored(self):
        names = [p["id"] for p in PERSONAS if p["platform"] == "android"][:3]
        self.assertEqual([r["persona"] for r in rows("android", " , ".join(reversed(names)))], names[::-1])

    def test_unknown_persona_stops_the_run(self):
        out = matrix("android", "nobody")
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("Unknown personas: ['nobody']", out.stderr)

    def test_persona_of_the_other_platform_stops_the_run(self):
        ios_one = next(p["id"] for p in PERSONAS if p["platform"] == "ios")
        out = matrix("android", ios_one)
        self.assertNotEqual(out.returncode, 0)
        self.assertIn(ios_one, out.stderr)

    def test_rows_have_every_key_the_jobs_read(self):
        for platform in ("android", "ios"):
            used = set(re.findall(r"matrix\.([a-z_]+)", job(platform)))
            for row in rows(platform, "all"):
                self.assertFalse(used - set(row), f"{platform} job reads {used - set(row)}, missing in {row}")


class Personas(unittest.TestCase):
    def test_ids_are_unique_and_simple(self):
        ids = [p["id"] for p in PERSONAS]
        self.assertEqual(len(ids), len(set(ids)))
        for pid in ids:
            self.assertRegex(pid, r"^[a-z][a-z0-9_-]*$")

    def test_each_persona_is_complete(self):
        for p in PERSONAS:
            with self.subTest(p["id"]):
                self.assertIn(p["platform"], ("android", "ios"))
                for key in ("profile", "goal", "locale", "device"):
                    self.assertTrue(p.get(key), key)
                self.assertRegex(p["locale"], r"^[a-z]{2,3}(-[A-Za-z0-9]+)*$")
                lat, lon = p["geo"]
                self.assertTrue(-90 <= lat <= 90 and -180 <= lon <= 180)
                self.assertIn(p["device"]["theme"], ("light", "dark"))

    def test_devices_use_values_the_emulators_accept(self):
        for p in PERSONAS:
            d = p["device"]
            with self.subTest(p["id"]):
                if p["platform"] == "ios":
                    self.assertIn(d["text_size"], IOS_TEXT_SIZES)
                    self.assertTrue(d["simulator"].startswith(("iPhone", "iPad")))
                    self.assertIsInstance(d["ios"], int)
                else:
                    self.assertIn(d["android_api"], range(29, 37))
                    self.assertTrue(0.8 <= float(d["font_scale"]) <= 2.0)
                    self.assertTrue(d["profile"] and d["name"])


if __name__ == "__main__":
    unittest.main()
