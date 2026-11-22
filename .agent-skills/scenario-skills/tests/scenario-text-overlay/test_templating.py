import pathlib
import sys
import unittest

SCRIPTS = (
    pathlib.Path(__file__).resolve().parents[2] / "skills" / "scenario-text-overlay" / "scripts"
)
sys.path.insert(0, str(SCRIPTS))

from templating import MissingVariableError, render_strict, variables_to_dict  # noqa: E402


class RenderStrictTests(unittest.TestCase):
    def test_simple_substitution(self):
        self.assertEqual(render_strict("Hello {{name}}", {"name": "World"}), "Hello World")

    def test_double_brace_escapes_and_triple_does_not(self):
        self.assertEqual(render_strict("{{x}}", {"x": "<b>"}), "&lt;b&gt;")
        self.assertEqual(render_strict("{{x}}", {"x": "AT&T"}), "AT&amp;T")
        self.assertEqual(render_strict("{{{x}}}", {"x": "<b>"}), "<b>")

    def test_missing_key_raises_with_name(self):
        with self.assertRaises(MissingVariableError) as ctx:
            render_strict("{{title}} / {{missing}}", {"title": "Hi"})
        self.assertIn("missing", str(ctx.exception))

    def test_unicode_values(self):
        self.assertEqual(render_strict("{{x}}", {"x": "BIENVENUE"}), "BIENVENUE")
        self.assertEqual(render_strict("{{x}}", {"x": "日本語"}), "日本語")

    def test_sections_iterate_without_flagging_inner_names(self):
        template = "{{#items}}{{name}}{{/items}}"
        out = render_strict(template, {"items": [{"name": "a"}, {"name": "b"}]})
        self.assertEqual(out, "ab")

    def test_comments_are_ignored(self):
        self.assertEqual(render_strict("hi{{! note }} there", {}), "hi there")

    def test_inverted_sections(self):
        self.assertEqual(render_strict("{{^missing}}fallback{{/missing}}", {}), "fallback")

    def test_empty_string_value_is_valid(self):
        self.assertEqual(render_strict("{{x}}!", {"x": ""}), "!")

    def test_dotted_path_requires_only_the_root(self):
        self.assertEqual(render_strict("{{stats.atk}}", {"stats": {"atk": "5"}}), "5")
        with self.assertRaises(MissingVariableError) as ctx:
            render_strict("{{stats.atk}}", {})
        self.assertIn("stats", str(ctx.exception))


class VariablesToDictTests(unittest.TestCase):
    def test_collapses_entries(self):
        variables = [{"key": "a", "value": "1"}, {"key": "b", "value": "2"}]
        self.assertEqual(variables_to_dict(variables), {"a": "1", "b": "2"})

    def test_duplicate_key_raises(self):
        variables = [{"key": "a", "value": "1"}, {"key": "a", "value": "2"}]
        with self.assertRaises(ValueError):
            variables_to_dict(variables)


if __name__ == "__main__":
    unittest.main()
