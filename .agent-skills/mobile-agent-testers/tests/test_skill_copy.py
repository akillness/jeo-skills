"""skills/mobile-agent-testers/SKILL.md is the plugin's setup skill for skill catalogs:
the two files must stay identical apart from the skill's name."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLUGIN_SKILL = ROOT / "plugins/mobile-agent-testers/skills/setup/SKILL.md"
STANDALONE_SKILL = ROOT / "skills/mobile-agent-testers/SKILL.md"
NAME_LINE = re.compile(r"^name: .*$", re.M)


def name_of(text):
    return NAME_LINE.search(text).group(0)


class SkillCopy(unittest.TestCase):
    def test_names(self):
        self.assertEqual(name_of(PLUGIN_SKILL.read_text(encoding="utf-8")), "name: setup")
        # a catalog lists a skill under its folder name, so both must match
        self.assertEqual(name_of(STANDALONE_SKILL.read_text(encoding="utf-8")), "name: mobile-agent-testers")

    def test_same_text_apart_from_the_name(self):
        plugin = NAME_LINE.sub("", PLUGIN_SKILL.read_text(encoding="utf-8"), count=1)
        standalone = NAME_LINE.sub("", STANDALONE_SKILL.read_text(encoding="utf-8"), count=1)
        self.assertEqual(plugin, standalone, "change both skills, or copy the plugin's SKILL.md and keep the name line")


if __name__ == "__main__":
    unittest.main()
