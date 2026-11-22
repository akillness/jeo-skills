# scenario-godot-2d: GUI paths (for a computer-use agent or a human)

The same work as procedures.md, through the Godot 4.7.2 editor. The code path is preferred for an
agent: it is repeatable and testable. Paths below come from the docs and expert videos cited; names
checked against 4.7.2 property names where possible.

## Project settings (procedure 1)

- Project > Project Settings, enable **Advanced Settings** (Heartbeast, 15t2Y0kXd6E 00:01:09).
- Display > Window > Size: Viewport Width / Height (320 x 180), Window Width / Height Override (1280
  x 720).
- Display > Window > Stretch: Mode (`viewport` or `canvas_items`), Aspect (`keep`), Scale Mode
  (`integer`).
- Rendering > Textures > Canvas Textures > Default Texture Filter = Nearest (00:03:30).
- Rendering > 2D > Snap > Snap 2D Transforms to Pixel (off by default; measured as no help with
  interpolation on).
- Physics > Common > Physics Interpolation; Physics > Common > Physics Ticks per Second.
- Editor game tab: Stretch to Fit toggle in the Game tab toolbar, for previewing only.

## Texture import (procedure 10)

- Select the PNG in FileSystem > Import dock: Compress > Mode = Lossless, Mipmaps > Generate off,
  Process > Fix Alpha Border on, Detect 3D > Compress To = Disabled for pixel art, then
  **Reimport**. Several files: select them all, change, Reimport.
- SpriteFrames: select AnimatedSprite2D > Sprite Frames > New SpriteFrames, open the SpriteFrames
  panel (bottom), "Add frames from sprite sheet" (grid icon), set Horizontal and Vertical frame
  counts, select frames, set FPS and Loop per animation. Then Inspector > Offset to put the feet on
  the origin and untick Centered.

## TileSet and TileMapLayer (procedures 2 to 4)

- Add a TileMapLayer, Inspector > Tile Set > New TileSet, set Tile Size first (docs: before creating
  atlas tiles), then right-click the TileSet > Save As .tres.
- TileSet panel (bottom) > + > Atlas, pick the PNG, answer Yes to "create tiles in non-transparent
  regions".
- Physics: Inspector on the TileSet > Physics Layers > Add Element; TileSet panel > Select tab >
  Paint > Physics Layer 0, press F for a full-tile rectangle, or draw points.
- Occlusion: TileSet > Occlusion Layers > Add Element; Paint > Occlusion Layer 0, draw the polygon.
  Cull mode is on the OccluderPolygon2D resource.
- One-way: Select a tile > Physics > Polygon > One Way (checkbox).
- Terrains: TileSet > Terrain Sets > Add Element, choose Mode (Match Corners and Sides for 47 tiles,
  Match Sides for 16 sides-only tiles), add a Terrain. TileSet panel > Paint > Terrains: paint the
  outer ring of bits first, then the center cross (bluuDevGames, CLcFC6ku240 00:12:28).
- Tall tiles: Select tab > Rendering > Texture Origin (y +8 on a 16 px grid) and Y Sort Origin
  (DevWorm, lvuLjMAr_BE 00:22:14).
- Paint terrain: TileMap panel > Terrains tab > Connect mode (Path for roads that should not join).
- Dual grid: no editor tool. Two TileMapLayers, the display one at position (-8, -8) for 16 px
  tiles, and the `dual_grid.gd` @tool script on their parent.

## Characters (procedures 5, 6)

- Project Settings > Input Map: add `move_left`, `move_right`, `jump` (and `move_up`, `move_down`
  for top-down); bind keys and pad buttons.
- CharacterBody2D > Motion Mode = Floating for top-down. Attach the kit scripts, assign a
  PlatformerTuning resource (New Resource > pick the script) in the Tuning slot.

## Camera (procedures 7 to 9)

- Camera2D: Process Callback = Physics, Position Smoothing > Enabled and Speed (DevWorm: about 3;
  default 5), Limit > Left/Top/Right/Bottom from the map, Drag > Horizontal/Vertical Enabled and
  margins.
- Pixel-locked smooth camera: SubViewportContainer (Stretch off, Scale 4, Texture Filter Nearest,
  Position -4, -4) > SubViewport (Size base + 2) > game scene (Barry, DwVPFbDoyoc 00:01:47 to
  00:05:10). Drive the shift from a script.

## Lights (procedure 11)

- Add CanvasModulate (dark color). Add PointLight2D > Texture > New GradientTexture2D > Fill Radial,
  From (0.5, 0.5), To (0.5, 0), white to transparent gradient; Shadow > Enabled, Filter None for
  pixel art.
- Occluder for a sprite: select the Sprite2D > toolbar menu Sprite2D > Create LightOccluder2D
  Sibling (docs), then set its OccluderPolygon2D Cull Mode; if the sprite goes dark, switch between
  Clockwise and Counter Clockwise.
- Pixel shader: CanvasItem > Material > New ShaderMaterial > load `pixel_light.gdshader`, set `px`
  to the integer scale.

## Y-sort (procedure 12)

- Create a Node2D container "Actors", Ordering > Y Sort Enabled; put characters, props and tall-tile
  TileMapLayers (also Y Sort Enabled) inside. Never on the world root (lvuLjMAr_BE 00:07:09).
- On each character: move the sprite with Offset, not Position, so the origin is at the feet
  (00:13:41).

## Parallax (procedure 13)

- Add Parallax2D per plane, a Sprite2D child with Centered off; Parallax2D > Scroll Scale (0 sky,
  0.1 to 0.9 far, above 1 foreground), Repeat > Repeat Size x = texture width, Repeat Times (raise
  for zoom-out), Autoscroll (Michael Games, ge1QiDmwS4k 00:04:45 to 00:08:17).
- Old scenes: TileMap node > TileMap panel menu > "Extract TileMap layers as individual TileMapLayer
  nodes" (shown in ZutpG0_CYrQ); ParallaxBackground has no converter: rebuild with Parallax2D.
