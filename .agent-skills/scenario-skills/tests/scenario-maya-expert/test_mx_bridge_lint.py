"""The bridge refuses code that force-replaces the user's open Maya scene."""

import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "skills/dcc/maya/scenario-maya-expert/scripts"))
import mx_bridge  # noqa: E402

REPLACES = [
    'cmds.file(new=True, force=True)',
    'cmds.file(force=True, new=True)',
    'cmds.file("/abs/shot.ma", open=True, force=True)',
    'cmds.file(n=True, f=True)',
    'cmds.file(path, o=1, f=1)',
    'mel.eval("file -f -new;")',
    'mel.eval("file -new -force;")',
    'mel.eval(\'file -f -options "v=0" -o "/abs/shot.ma";\')',
    'pm.newFile(force=True)',
    'pm.openFile("/abs/shot.ma", f=True)',
]
KEEPS = [
    'cmds.file(q=True, modified=True)',
    'cmds.file(save=True, force=True)',
    'cmds.file(rename="/abs/v002.ma")',
    'cmds.file(new=True)',
    'mel.eval("file -save;")',
    'print("file -o is the MEL flag")',
]


class SceneReplaceGuard(unittest.TestCase):
    def test_refuses_every_spelling(self):
        for code in REPLACES:
            with self.subTest(code=code):
                self.assertTrue(mx_bridge.lint(code), "not refused")

    def test_keeps_safe_file_calls(self):
        for code in KEEPS:
            with self.subTest(code=code):
                self.assertEqual(mx_bridge.lint(code), [])

    def test_explicit_opt_in(self):
        self.assertEqual(mx_bridge.lint("cmds.file(n=True, f=True)", allow_scene_replace=True), [])


if __name__ == "__main__":
    unittest.main()
