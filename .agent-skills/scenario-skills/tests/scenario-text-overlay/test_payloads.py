import io
import json
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stderr

SCRIPTS = (
    pathlib.Path(__file__).resolve().parents[2] / "skills" / "scenario-text-overlay" / "scripts"
)
sys.path.insert(0, str(SCRIPTS))

import overlay  # noqa: E402
import pillow_render  # noqa: E402

from PIL import Image  # noqa: E402


def text_payload(**overrides):
    payload = {
        "text_template": "{{line}}",
        "variables": [{"key": "line", "value": "Night, distilled."}],
        "font_family": "Inter",
        "size": 40,
        "bbox": [{"x": 40, "y": 40, "w": 400, "h": 120 }],
        "canvas_width": 480,
        "canvas_height": 480,
    }
    payload.update(overrides)
    return payload


def rich_payload(**overrides):
    payload = {
        "html_template": "<div>{{title}}</div>",
        "variables": [{"key": "title", "value": "Aether Bolt"}],
        "canvas_width": 480,
        "canvas_height": 480,
    }
    payload.update(overrides)
    return payload


class ValidatePayloadTests(unittest.TestCase):
    def test_text_defaults_applied(self):
        kind, data = overlay.validate_payload(text_payload())
        self.assertEqual(kind, "text")
        self.assertEqual(data["font_weight"], 400)
        self.assertEqual(data["font_style"], "normal")
        self.assertEqual(data["color"], "#000000")
        self.assertEqual(data["align"], "left")
        self.assertEqual(data["line_height"], 1.2)
        self.assertEqual(data["letter_spacing"], 0.0)
        self.assertEqual(data["overflow"], "wrap")
        self.assertIsNone(data["font_url"])

    def test_rich_defaults_applied(self):
        kind, data = overlay.validate_payload(rich_payload())
        self.assertEqual(kind, "rich")
        self.assertEqual(data["device_scale_factor"], 1.0)
        self.assertIsNone(data["css"])
        self.assertEqual(data["allowed_url_prefixes"], [])

    def assert_invalid(self, payload):
        with self.assertRaises(SystemExit):
            overlay.validate_payload(payload)

    def test_kind_is_exclusive_and_required(self):
        self.assert_invalid({**text_payload(), "html_template": "<b>x</b>"})
        self.assert_invalid({"canvas_width": 100, "canvas_height": 100})

    def test_font_source_is_exclusive_and_required(self):
        self.assert_invalid(text_payload(font_url="https://example.com/f.ttf"))
        payload = text_payload()
        del payload["font_family"]
        self.assert_invalid(payload)

    def test_font_family_charset(self):
        self.assert_invalid(text_payload(font_family="Inter; DROP TABLE"))

    def test_font_url_must_be_https(self):
        payload = text_payload(font_url="http://example.com/f.ttf")
        del payload["font_family"]
        self.assert_invalid(payload)

    def test_font_weight_hundreds_only(self):
        self.assert_invalid(text_payload(font_weight=450))

    def test_size_bounds(self):
        self.assert_invalid(text_payload(size=3))
        self.assert_invalid(text_payload(size=2049))

    def test_color_format(self):
        self.assert_invalid(text_payload(color="red"))
        self.assert_invalid(text_payload(color="#FFF"))

    def test_align_and_overflow_choices(self):
        self.assert_invalid(text_payload(align="justify"))
        self.assert_invalid(text_payload(overflow="scale"))

    def test_bbox_shape_and_canvas_fit(self):
        self.assert_invalid(text_payload(bbox=[]))
        self.assert_invalid(
            text_payload(bbox=[{"x": 0, "y": 0, "w": 10, "h": 10}, {"x": 0, "y": 0, "w": 10, "h": 10}])
        )
        self.assert_invalid(text_payload(bbox=[{"x": 200, "y": 0, "w": 400, "h": 100}]))

    def test_canvas_bounds(self):
        self.assert_invalid(text_payload(canvas_width=0))
        self.assert_invalid(rich_payload(canvas_height=8193))

    def test_device_scale_factor_bounds(self):
        self.assert_invalid(rich_payload(device_scale_factor=0.4))
        self.assert_invalid(rich_payload(device_scale_factor=4.5))

    def test_allowed_url_prefixes_rules(self):
        self.assert_invalid(rich_payload(allowed_url_prefixes=["http://cdn.example.com/"]))
        self.assert_invalid(rich_payload(allowed_url_prefixes=["https://a@b.example.com/"]))
        self.assert_invalid(rich_payload(allowed_url_prefixes=["https://example.com/../x"]))

    def test_variables_shape(self):
        self.assert_invalid(text_payload(variables={"line": "x"}))
        self.assert_invalid(text_payload(variables=[{"key": "", "value": "x"}]))
        self.assert_invalid(text_payload(variables=[{"key": "n", "value": 3}]))
        self.assert_invalid(text_payload(variables=[{"key": "n"}]))

    def test_section_values_accepted(self):
        variables = [
            {"key": "title", "value": "Aether Bolt"},
            {"key": "features", "value": [{"name": "Fast"}, {"name": "Light"}]},
            {"key": "sale", "value": True},
        ]
        kind, data = overlay.validate_payload(rich_payload(variables=variables))
        self.assertEqual(kind, "rich")
        self.assertEqual(data["variables"], variables)

    def test_section_values_reject_nested_numbers_and_surrogates(self):
        self.assert_invalid(
            text_payload(variables=[{"key": "f", "value": [{"n": 3}]}])
        )
        self.assert_invalid(
            text_payload(variables=[{"key": "f", "value": [{"n": "\ud83d"}]}])
        )

    def test_line_height_and_letter_spacing_types(self):
        self.assert_invalid(text_payload(line_height=0.4))
        self.assert_invalid(text_payload(letter_spacing="wide"))

    def test_letter_spacing_rejects_infinity_and_nan(self):
        self.assert_invalid(text_payload(letter_spacing=float("inf")))
        self.assert_invalid(text_payload(letter_spacing=float("nan")))

    def test_font_weight_rejects_floats_and_bools(self):
        self.assert_invalid(text_payload(font_weight=700.0))
        self.assert_invalid(text_payload(font_weight=True))

    def test_trailing_newline_rejected_in_color_and_family(self):
        self.assert_invalid(text_payload(color="#FF0000\n"))
        self.assert_invalid(text_payload(font_family="Inter\n"))

    def test_lone_surrogate_rejected(self):
        self.assert_invalid(
            text_payload(variables=[{"key": "line", "value": "\ud83d"}])
        )
        self.assert_invalid({**rich_payload(), "html_template": "x\ud83dx"})


class EmbedPayloadTests(unittest.TestCase):
    def make_png(self):
        buffer = io.BytesIO()
        Image.new("RGBA", (4, 4), (0, 0, 0, 0)).save(buffer, "PNG")
        return buffer.getvalue()

    def test_payload_round_trips_through_the_text_chunk(self):
        payload = text_payload()
        stamped = overlay.embed_payload(self.make_png(), payload)
        image = Image.open(io.BytesIO(stamped))
        recovered = json.loads(image.text[overlay.PAYLOAD_TEXT_CHUNK_KEYWORD])
        self.assertEqual(recovered, payload)

    def test_chunk_sits_before_image_data(self):
        stamped = overlay.embed_payload(self.make_png(), {"a": "b"})
        self.assertLess(stamped.index(b"tEXt"), stamped.index(b"IDAT"))

    def test_non_png_input_is_rejected(self):
        with self.assertRaises(SystemExit):
            overlay.embed_payload(b"JFIF not a png", {})

    def test_non_ascii_payload_survives(self):
        payload = text_payload(variables=[{"key": "line", "value": "Nuit distillée 日本語"}])
        stamped = overlay.embed_payload(self.make_png(), payload)
        image = Image.open(io.BytesIO(stamped))
        recovered = json.loads(image.text[overlay.PAYLOAD_TEXT_CHUNK_KEYWORD])
        self.assertEqual(recovered["variables"][0]["value"], "Nuit distillée 日本語")


class MainPillowEngineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.original_download = pillow_render._download
        pillow_render._download = self.raise_oserror

    def tearDown(self):
        pillow_render._download = self.original_download

    @staticmethod
    def raise_oserror(url):
        raise OSError("offline test")

    def run_main(self, payload):
        payload_path = self.tmp / "payload.json"
        payload_path.write_text(json.dumps(payload), encoding="utf-8")
        out = self.tmp / "card.png"
        with redirect_stderr(io.StringIO()):
            overlay.main(["--payload", str(payload_path), "--out", str(out), "--engine", "pillow"])
        return out

    def test_renders_and_embeds_payload(self):
        payload = text_payload()
        out = self.run_main(payload)
        image = Image.open(out)
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.size, (480, 480))
        self.assertEqual(json.loads(image.text[overlay.PAYLOAD_TEXT_CHUNK_KEYWORD]), payload)

    def test_missing_variable_fails(self):
        with self.assertRaises(SystemExit):
            self.run_main(text_payload(variables=[]))

    def test_duplicate_variable_fails(self):
        variables = [{"key": "line", "value": "a"}, {"key": "line", "value": "b"}]
        with self.assertRaises(SystemExit):
            self.run_main(text_payload(variables=variables))

    def test_rich_layer_refuses_pillow(self):
        with self.assertRaises(SystemExit):
            self.run_main(rich_payload())


if __name__ == "__main__":
    unittest.main()
