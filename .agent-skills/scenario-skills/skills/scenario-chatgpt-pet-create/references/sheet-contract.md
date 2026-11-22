# ChatGPT pet sheet contract

A pet is one transparent PNG or WebP sprite sheet, at most 20 MiB, in cells of 192x208 pixels, 8
columns wide. Each row plays one state; its frames fill the leftmost cells and every cell after them
is fully transparent.

| Version | Size      | Rows | Frames | Where it works                                                                         |
| ------- | --------- | ---- | ------ | -------------------------------------------------------------------------------------- |
| v2      | 1536x2288 | 11   | 73     | Codex desktop (`pet.json` package), surfaces that show look directions                 |
| v1      | 1536x1872 | 9    | 57     | ChatGPT web upload (Settings > Personalization > Pet > Select pet > Upload pet), Codex |

Rows 0-8 are identical in both versions, so a v1 sheet is a v2 sheet with the last two rows cut.
That is how the package step makes the v1 copy.

## Rows

| Row | State            | Frames | What it must show                                                                         |
| --- | ---------------- | ------ | ----------------------------------------------------------------------------------------- |
| 0   | `idle`           | 6      | Calm breathing, a blink, slight sway; feet planted; first and last frames nearly equal    |
| 1   | `running-right`  | 8      | Faces and moves toward screen-right, legs clearly alternating, running in place           |
| 2   | `running-left`   | 8      | The same toward screen-left (a mirror of row 1 only when the pet looks the same mirrored) |
| 3   | `waving`         | 4      | Starts in the idle stance, a limb rises and waves, comes back down                        |
| 4   | `jumping`        | 5      | Crouch, spring, peak clearly above the ground, descend, land in the idle stance           |
| 5   | `failed`         | 8      | Starts in the idle stance, then a readable disappointment held to the end                 |
| 6   | `waiting`        | 6      | Expectant asking pose: the pet needs an answer or approval                                |
| 7   | `running`        | 6      | Busy working (thinking, typing, tinkering); not locomotion                                |
| 8   | `review`         | 6      | Leaning in, narrowed eyes or tilted head, inspecting finished work                        |
| 9   | look `000-157.5` | 8      | Look directions `000 022.5 045 067.5 090 112.5 135 157.5`                                 |
| 10  | look `180-337.5` | 8      | Look directions `180 202.5 225 247.5 270 292.5 315 337.5`                                 |

Everything in the pet's cells belongs to the pet. No speed lines, motion blur, dust, shadows,
floating symbols, sparkles, text or props it does not own. An effect is fine only when it touches
the pet (tears, a puff of smoke on `failed`). The pet keeps one height on every row (the jump lifts
it, it does not shrink it), one ground line, and one planted lower body.

## Look directions

Degrees are screen directions, clockwise, with `000` straight up (not neutral: the neutral frame is
idle frame 0). Right and left are the viewer's edges of the image, never the pet's own.

| Label   | Direction  | Label   | Direction |
| ------- | ---------- | ------- | --------- |
| `000`   | up         | `180`   | down      |
| `022.5` | up-right   | `202.5` | down-left |
| `045`   | up-right   | `225`   | down-left |
| `067.5` | up-right   | `247.5` | down-left |
| `090`   | right      | `270`   | left      |
| `112.5` | down-right | `292.5` | up-left   |
| `135`   | down-right | `315`   | up-left   |
| `157.5` | down-right | `337.5` | up-left   |

The four cardinals (`000`, `090`, `180`, `270`) must read instantly at pet size. Looking is done the
way the pet is built: eyes turn as whole eyes, a head turns with a little follow-through, a soft or
flexible body bends around a planted base, an eyeless object leans or aims its natural pointing
feature. The whole sprite never rotates, tilts or shrinks. Each look row is one coherent family
drawn in one generation; a wrong direction means regenerating its whole row, never pasting one new
cell next to cells from another generation.

## Direction verdicts

After looking at the labeled look sheet (`pet_preview.py looks`), write
`qa/direction-semantics.json`. `pet_check.py` reads it and fails on a missing label, a wrong
`expected` word, a `fail` verdict, a cardinal that is not `pass`, or empty `observed` or `evidence`:

```json
{
  "directions": [
    {
      "label": "090",
      "expected": "right",
      "observed": "head turned to screen-right, nose past the head's right edge",
      "verdict": "pass",
      "evidence": "both pupils in the right half of the eyes; the far ear hidden"
    }
  ]
}
```

One record per label, sixteen in all. `warning` is allowed on an in-between direction that is subtle
but in the right quadrant; never on a cardinal, a wrong quadrant, or a step that reverses the loop.

## Acceptance

A pet is ready when `pet_check.py` reports `ok: true` on the exact file being delivered (its report
carries that file's SHA-256, and `pet_package.py` refuses any other bytes) and the user has seen it
move. The check covers size and version, PNG or WebP matching the extension, 20 MiB, alpha, every
used cell drawn and every unused cell empty, no color under transparent pixels, no key color left;
then height within 8% of idle (warning) or 15% (error) on every row, a jump that rises at least 8 px
and lands within 12 px of the idle ground line, and on v2 look rows that stay within 26 px of idle's
planted anchor, hold their width within 1.5x, move smoothly from one direction to the next, have no
transparent gap through the body, and carry complete verdicts. Pixel mode adds on/off alpha, one
grid, and the palette.

## Package

```
package/<id>/pet.json           {"id", "displayName", "description", "spritesheetPath": "spritesheet.webp"}
package/<id>/spritesheet.webp   the checked bytes (spritesheet.png when the checked sheet is a PNG)
package/spritesheet-v1.png      rows 0-8, for ChatGPT web upload
package/pet.gif                 every state twice, then the look loop, on a soft background
package/pet-transparent.gif     the same with a transparent background
```

Codex desktop loads a custom pet from `${CODEX_HOME:-~/.codex}/pets/<id>/` holding `pet.json` and
the sheet; it takes the v2 sheet. Pets made in Codex desktop stay on that computer; ChatGPT web
takes an uploaded sheet.
