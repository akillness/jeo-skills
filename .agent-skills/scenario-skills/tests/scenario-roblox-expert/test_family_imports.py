"""Checks the scripts of one expert-tools family with system Python.

The family's behavior suites live in its author's build project and need the
application (AGENTS.md, "Expert tools"). This suite guards what the port
changed: the scenario- skill names the specialists use to find the lead skill's
scripts/. Importing alone misses a path that is built at import time but used
later, so the names are also checked statically. The family comes from this
folder's name, tests/scenario-<app>-expert/, so the file is identical in every
family's suite.
"""

import ast
import fnmatch
import pathlib
import re
import subprocess
import sys
import unittest

HERE = pathlib.Path(__file__).parent
APP = re.fullmatch(r"scenario-(.+)-expert", HERE.name).group(1)
REPO = HERE.parents[1]
FAMILY = next(REPO.glob(f"skills/*/{APP}"))

# Modules that only exist inside the application, or behind its Python bridge.
APP_MODULES = {"bpy", "bmesh", "mathutils", "gpu", "maya", "pymel", "unreal", "zbrush", "UnityEngine"}
# Scripts that only ever load inside the application, where the lead's launcher
# has already put its own scripts/ on sys.path.
INSIDE_APP = {"zb_plugin_ops"}


SKILLS = {path.parent.name for path in REPO.glob("skills/**/SKILL.md")}
SKILL_LIKE = re.compile(r"(scenario-)?(zbrush|blender|maya|unreal|unity|godot|roblox)-[a-z0-9*-]+")


class FamilyScripts(unittest.TestCase):
    def test_skill_names_in_scripts_exist(self):
        for script in sorted(FAMILY.glob("scenario-*/scripts/**/*.py")):
            for node in ast.walk(ast.parse(script.read_text(encoding="utf-8"))):
                if not (isinstance(node, ast.Constant) and isinstance(node.value, str)):
                    continue
                name = node.value
                if not SKILL_LIKE.fullmatch(name):
                    continue
                where = f"{script.relative_to(REPO)}:{node.lineno}"
                if name.startswith("scenario-"):
                    self.assertTrue(fnmatch.filter(SKILLS, name), f"{where}: no skill matches {name!r}")
                else:
                    self.assertFalse(f"scenario-{name}" in SKILLS, f"{where}: {name!r} lacks the scenario- prefix")

    def test_every_script_imports(self):
        scripts = sorted(FAMILY.glob("scenario-*/scripts/*.py"))
        self.assertTrue(scripts, f"no scripts under {FAMILY}")
        for script in scripts:
            with self.subTest(script=str(script.relative_to(REPO))):
                if script.stem in INSIDE_APP:
                    self.skipTest("loads only inside the application")
                run = subprocess.run(
                    [sys.executable, "-c", f"import sys; sys.path.insert(0, {str(script.parent)!r}); import {script.stem}"],
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if run.returncode == 0:
                    continue
                missing = re.search(r"No module named '([^'.]+)", run.stderr)
                if missing and missing.group(1) in APP_MODULES:
                    self.skipTest(f"needs {missing.group(1)}, which only the application provides")
                self.fail(run.stderr.strip().splitlines()[-1])


if __name__ == "__main__":
    unittest.main()
