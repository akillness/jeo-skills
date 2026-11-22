# Overlay payload reference

One JSON object per overlay. The kind is picked by which template field is present: `text_template`
(text layer) or `html_template` (rich layer), never both. Shared fields:

| Field           | Type             | Rules                                                                                                                                                                        |
| --------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `variables`     | `[{key, value}]` | duplicate keys are an error; a `{{name}}` substitution takes a string (stringify numbers); section data may be a boolean, a list, or an object whose leaf values are strings |
| `canvas_width`  | int              | 1 to 8192                                                                                                                                                                    |
| `canvas_height` | int              | 1 to 8192                                                                                                                                                                    |

## Template rules

Templates are Mustache, rendered strictly: a `{{name}}` that has no matching variable key fails the
render instead of substituting an empty string. `{{var}}` HTML-escapes its value; `{{{var}}}`
inserts it raw (use it in rich layers to inject markup on purpose, and in text layers whenever a
value contains `&`, `<`, or `>`, which would otherwise render as literal entity text). Sections
(`{{#list}}...{{/list}}`), inverted sections, and comments work as in standard Mustache; variables
inside a section resolve against the section's own items and are not strict-checked, so a name
missing inside a section renders empty. Keep strict-checked text at the top level.

Keep every changeable string in `variables` rather than baked into the template, so one template
reproduces a whole family of localized or per-variant cards.

## Text layer

| Field            | Type   | Default   | Rules                                                                                                                                                      |
| ---------------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text_template`  | string | required  | plain text; newlines are kept                                                                                                                              |
| `font_family`    | string |           | a Google Fonts family name; letters, digits, spaces, `+`, `-`                                                                                              |
| `font_url`       | string |           | https URL to a .ttf/.otf/.woff/.woff2 file                                                                                                                 |
| `font_weight`    | int    | 400       | 100, 200, ... 900                                                                                                                                          |
| `font_style`     | string | `normal`  | `normal` or `italic`                                                                                                                                       |
| `size`           | int    | required  | 4 to 2048 (pixels)                                                                                                                                         |
| `color`          | string | `#000000` | `#RRGGBB`                                                                                                                                                  |
| `align`          | string | `left`    | `left`, `center`, `right`                                                                                                                                  |
| `bbox`           | list   | required  | exactly one `{x, y, w, h}`, inside the canvas                                                                                                              |
| `line_height`    | number | 1.2       | 0.5 to 4.0, multiplier                                                                                                                                     |
| `letter_spacing` | number | 0.0       | pixels per glyph gap                                                                                                                                       |
| `overflow`       | string | `wrap`    | `wrap` (vertical overflow allowed), `clip` (cut at the box), `shrink` (largest size in [4, `size`] that fits the box height; errors when even 4 overflows) |

Exactly one of `font_family` or `font_url`. Text wraps at `bbox.w`; the glyphs of the substituted
text appear verbatim.

## Rich layer

| Field                  | Type     | Default  | Rules                                                                  |
| ---------------------- | -------- | -------- | ---------------------------------------------------------------------- |
| `html_template`        | string   | required | HTML body fragment (Mustache)                                          |
| `css`                  | string   |          | appended after a transparent-background reset, so it wins              |
| `device_scale_factor`  | number   | 1.0      | 0.5 to 4.0; output pixels scale by it (2.0 for retina-sharp overlays)  |
| `allowed_url_prefixes` | [string] | `[]`     | https-only, no `@` or `..`; hosts listed here render without a warning |

The page renders on a transparent background at the canvas size. Google Fonts links and
`scenario.com` URLs load quietly; any other remote reference earns a warning because a
self-contained page (assets inlined as `data:` URIs) reproduces identically anywhere, offline
included. Gradients, text strokes (`-webkit-text-stroke`), shadows, flexbox card layouts, and emoji
all render.

## Engines

| Engine  | Layers      | Needs                                                                                                                                            |
| ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| browser | text + rich | any installed Chromium-family browser (Chrome, Chromium, Edge, Brave); found automatically, or set `--browser` / `SCENARIO_TEXT_OVERLAY_BROWSER` |
| pillow  | text only   | Pillow; plain typography, used automatically when no browser exists                                                                              |

## Reproducibility

Every output PNG carries its own payload JSON in a `tEXt` chunk with the keyword
`scenario-text-overlay:payload` (Pillow shows it in `Image.text`), so any variant can be regenerated
from the file alone by editing `variables`. The upload-and-persist flow that stores the same payload
on the platform is steps 4 and 5 of the SKILL.md quick reference.

## Example payload

A text-layer example is the worked example in SKILL.md. Rich layer, a gradient headline card:

```json
{
  "html_template": "<link href=\"https://fonts.googleapis.com/css2?family=Cinzel:ital,wght@0,700&display=block\" rel=\"stylesheet\"><div class=\"card\"><h1>{{title}}</h1><p>{{tagline}}</p></div>",
  "css": "html, body { height: 100%; } .card { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Cinzel', serif; } h1 { font-size: 96px; margin: 0; background: linear-gradient(120deg, #F8E7B3, #C9A227); -webkit-background-clip: text; -webkit-text-fill-color: transparent; } p { color: #EDE6D6; font-size: 30px; letter-spacing: 0.3em; }",
  "variables": [
    { "key": "title", "value": "Night, distilled" },
    { "key": "tagline", "value": "EAU DE PARFUM" }
  ],
  "canvas_width": 1080,
  "canvas_height": 640,
  "device_scale_factor": 2.0
}
```
