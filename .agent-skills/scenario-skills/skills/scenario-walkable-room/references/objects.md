# Objects: uncover, plate, cut-out, 3D, sound

## Uncover rules

Describe the photo literally before choosing anything: walls, floor, furniture, light, what is
outside the windows. Then list objects with:

- `name`, a precise visual `description`, `materials`, `support` (floor, table, sofa, shelf), a
  normalized `bbox` [x0, y0, x1, y1], a size estimate in meters, and notes on occlusion.
- Only single movable items: lamps, cushions, bowls, vases, lanterns, side tables, chairs. Never
  sofas, rugs, curtains, built-ins, or anything fixed to a wall.
- Prefer objects that are unoccluded, made of one or two materials, with a clear silhouette. Skip
  plants, glass, and objects holding other objects unless you remove those too.

Keep the list as JSON next to the photo: the box and size estimate drive the scale and placement
steps in calibration.

## Plate prompt

Removal only, every object with its position, nothing else asked:

> remove the following from the image: the {object} on the {support}, {where}; the {object} {where};
> ...

Check for over-removal (neighboring cushions, decorative screens) and for recoloring instead of
removal. When a run fails either way, ask for two outputs if the schema allows it and keep the one
that is right, or narrow the list.

## Cut-out prompt

On the original photo, square output at about 1K:

> Isolate the {object} from this image: {its description and where it stands}. Reproduce it exactly
> as shown -- same colors, materials, and proportions. White background, centered, tight crop,
> studio lighting. No other objects, no scene, no people, no text, no shadows on the ground. Isolate
> the object and remove all clustered, adjacent, overlapping, or items resting on the target
> object{, including ...}. Create a clean render of that one single object that is true to the
> source image.

Naming what rests on the object ("including the brass lantern standing on its top") keeps it out of
the cut-out.

## 3D

Image-to-3D with textures and PBR, a moderate face count (about 50,000 is plenty for a prop seen
from a few meters). Then for the web: simplify to about 15,000 to 20,000 triangles (keep more for
fretwork), 1,024 px WebP textures, Meshopt geometry (glTF Transform does all three): tens of
megabytes become a few hundred kilobytes. Set metalness to zero on anything that is not real metal.

## Sound

One clip per object holding several separate impacts:

> Four separate one-shot impacts, each followed by a full second of silence: {object and material}
> {knocked over / dropped} onto {floor}, {character}. Close-miked, dry room, no music, no voices.

Split it on silence (for example ffmpeg `silencedetect` at -38 dB with gaps of 0.2 s), keep two to
four hits, add a short fade-out, and normalize loudness. In the viewer, play one at random on
impact, never the same twice in a row, panned toward where it landed.
