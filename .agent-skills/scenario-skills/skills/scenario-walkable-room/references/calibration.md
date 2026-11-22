# Calibrating a single-image world

A single-image world model on Scenario returns a Gaussian splat file (`.spz`) and nothing else: no
metric scale, no floor, no collider. Everything below is derived from the splats, with the world's
origin at the photo camera. Write it as a local script (numpy is enough) and run it one world at a
time.

## Read the splats

SPZ is gzip. After the 16-byte header (magic `NGSP`, version, point count, spherical-harmonics
degree, fractional bits) come all positions (3 × 24-bit fixed point), then opacities, colors, scales
(`exp(byte / 16 - 10)`), and rotations. Positions are enough for calibration; keep opacity to drop
faint splats. The worlds at authoring time used OpenCV axes (x right, y down, z forward); a 180°
turn about x gives three.js axes (y up, camera looking down -z). Check the axes on the first world
by finding the floor below the origin.

## Floor, level, scale

1. Fit a plane by RANSAC to opaque, small splats below the camera and within a few meters of it,
   then refine it with a least-squares fit on the inliers.
2. Rotate the world so the plane normal points straight up (one to two degrees of camera tilt is
   typical) and translate it so the floor sits at y = 0.
3. The camera's height above the plane in world units is not metric. Measure it, project each
   object's box into the world (next sections) at a trial scale, and compare its height with its
   estimated real size. The ratio is consistent across objects, and it gives the scale. Across seven
   rooms at authoring time the photo camera sat about 1.0 m above the floor (0.9 to 1.1 m), ceilings
   then came out at 2.7 to 3.3 m, and object heights matched their estimates within about 10
   percent. Walking at that eye height keeps the opening view identical to the photo.

## Lens

Project the splats from the origin into an image the size of the source photo for a range of
horizontal fields of view, and keep the one whose rendering correlates best with the photo
(luminance, z-buffered). Restyles of one photo came back with fields of view from about 50° to 76°
from the same world model, so fit every world.

## Collision heightfield

Top-down grid, 4 cm cells, 2 cm height levels:

- Floor evidence: any opaque splat within 5 cm of y = 0. Far floor is made of larger splats, so do
  not filter by size here.
- Height: the robust top of small, opaque splats between 4 cm and 1.75 m in the cell (the highest
  level with at least three splats at or above it), median-filtered over 3 × 3 cells.
- Walls: cells dense from knee height to above 1.75 m.
- Inside: flood-fill from a free cell near the camera over low cells that have floor. Furniture next
  to that floor stays; everything else becomes wall, which also closes doorways and the view through
  windows.

A walker treats cells taller than a step (about 14 cm) as blocked and slides along them; the physics
engine uses the same grid as a heightfield collider, plus a ceiling.

## Putting objects back

The plate no longer shows the objects, so the surface right behind the bottom edge of an object's
box is where it stood:

1. Render a depth buffer of the world from the origin with the fitted lens (nearest opaque splat per
   pixel).
2. Read the depth just above the bottom center of the box (median of the nearest half of a small
   window).
3. Unproject that pixel at that depth: it is the front of the object's footprint, at the height of
   its support. Move it back from the camera by half the object's width.
4. Scale the object so its height matches the box height at that depth, and turn it to face the
   camera.
5. If it stood on another object you lifted out, stack it on that object instead.

Write the result per room as data the viewer reads: the world transform (rotation, translation,
scale), the fitted field of view, the heightfield grid, and each object's position, rotation, scale,
and material class.
