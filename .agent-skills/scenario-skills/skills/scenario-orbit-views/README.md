# scenario-orbit-views: maintainer notes

Not read at runtime. How the skill was built and why it makes its choices.

## Origin

Distilled from the Full Circle experiment on scenario.com/experiments: seven subjects (three
characters, a prop, a vehicle, a creature, a building), each one generated picture turned into 25
camera views, on location and without background. 175 repaints and 175 cutouts were produced with
this exact pipeline.

## Why the 3D step

A first version repainted each angle independently from clay renders on a plain background, then
pasted the result on flat background plates. It failed in three measurable ways, which became the
Common mistakes:

- Independent repaints came out 7 to 53 percent larger or smaller than the clay, so the subject
  jumped between views and between modes.
- Flat plates had no ground plane in the camera's perspective, so subjects floated and the horizon
  stayed fixed while the camera moved up and down.
- Plates were low resolution next to the repaint.

The grounded dome (panorama on a sphere, lower half flattened into a floor, shadow catcher,
world-fixed sun) fixes all three: the layout already holds the subject at its final size, standing
on a real floor with its real shadow, and the image model only repaints it.

## Choices that were tested

- Two references (layout, source) is the default. A third reference (an earlier view of the same
  camera) added detail on the far side but copied its errors: one character gained a second bag on
  every back view until those views were regenerated with two references.
- A "harmonize" pass of a finished view through the image model re-crops the frame, which breaks
  alignment with the clay and the compare slider. Dropped.
- Pasting an earlier cutout on the grounded background was tried and dropped for the scale mismatch
  above.
- The no-background frame is a cutout of the same repainted frame plus the Blender shadow from the
  clay pass, so both modes show an identical subject. The clay body is removed with a dilation
  margin so no gray outline shows, and edge pixels are defringed so sky color does not travel with
  hair or fur.
- Camera zero comes from a silhouette IoU sweep. It is weak for near-symmetric or compact subjects
  (one robot scored 0.55), so the skill asks for a visual check.

## Scripts

`render_grounded.py` runs in Blender, the others in plain Python with Pillow and numpy. Tests in
`tests/scenario-orbit-views/` cover the pure functions; the Blender scene code is exercised only by
a real render.
