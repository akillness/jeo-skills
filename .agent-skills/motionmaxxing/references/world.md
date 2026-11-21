# World: what a frame is made of

A film is not a layout with animation on it; it is a place with light in it. This file is the richness half of "one focal point inside a built world". Restraint decides where emphasis goes; it does not mean an empty frame. The user said it directly: "It should have more stuff than this, but it should use the animations, the fonts, the logos" (`taste/verdicts.md`), and v2 builds beat flat silent vector "in everyone" (the 09-30 u3/u6 rounds). The opposite failure is real too: clutter, and everything lit at once. The test is one focal point, many layers.

## 1. What a frame is made of

Decide these per act, write them in the storyboard (`director.md` worksheet), and keep them consistent inside the act:

| Layer | Question | Sources, best first |
|---|---|---|
| Ground | What is behind everything? | a surface from the capture (product screen, media plate, signature graphic); a real material (paper, cloth, glass, wood); an imagegen surface plate; a flat colour ONLY if the brand is genuinely flat or it is a flood/dive under ~1 s |
| Light | Where does it come from, what does it do? | one key with a direction, a rim to separate the silhouette, falloff into shade; the brand colour as light more often than paint |
| Depth | What is near, what is far? | 2-3 planes: a blurred or cropped foreground, the lit subject, a quieter background; parallax in camera moves; depth of field spent once |
| Texture | What does the surface feel like? | grain, paper tooth, brushed metal, fabric; a little temporal grain in render (section 5) |
| Material | What are the objects made of? | brand plastic (colour + low roughness + clearcoat), satin or anodised, glass, paper, ink; UI with real chrome |
| Sound | What do you hear? | room tone or a bed that changes where the picture changes; close dry UI sounds; silence before the hit (`sound-sync.md`) |

A frame that is "a card on a flat colour" has only one of six. A frame with all six and one lit subject is a world. Flat swatch grounds per scene (cream, ink, lavender, green) are a slop pattern: five swatches in 19 s was a v1 test film; it reads as a deck. One light logic and one lens per film: assets in four rendering styles read as stock however good each is.

## 2. Light logic

- **Key + rim + falloff + contact shadow.** One source with a direction, a rim light that separates the silhouette, falloff into darkness (or into a lower-luminance tint on a light ground), and a contact shadow that grounds the object. Flat fills with a drop shadow and a glow on every element feel cheap.
- **A sweep of light travelling across a surface reads as premium**; a wide flash over the whole object at once reads as a glitch. Use the sweep on the one thing the idea is about, once.
- **Light only where it means something.** The same soft floor glow under every scene reads as a template (`taste/edits.md`). A glow belongs to an event, a source or an object with a job. A radial glow, vignette and orb around a logo on near-black is the premium pastiche (reach 4).
- **Brand colour as light.** A rim light, a horizon glow, the colour of the one light source, a micro-detail amplified into weather (an icon's iridescence becoming the halo of the phone). A gradient works when it is the brand's own material, carries data, or behaves like one real light; it fails as a constant two-colour backdrop.
- **On a light ground** the same logic: a soft directional key, real shadows with a falloff, a paper or print texture, a warm or cool cast that matches the key. A light ground is as premium as a dark one; choose by the brand, not by habit (six of ten no-skill AI films sat on near-black, under a third of human films did).
- **Flat brands:** if the brand is genuinely flat (a printed, poster-like system), stay flat on purpose: hard colour, hard shadow, grain, and still a ground with an edge and an object with a cause. Say so in NOTE.md.

## 3. Grounds that are not flat swatches

Build the ground from, in this order:
1. The capture: `film/brand/media/` photography, the signature graphic, a product screen. Crop, push in, blur to a plate, tint, or use as the lit surface. a v1 test film used 0 of 9 captured files and shipped invented UI instead.
2. A real material the product lives in (paper for a note app, a desk, a counter, fabric), photographed or generated (section 4, imagegen).
3. A code-built surface that has structure: a shader, a halftone, a paper grain, a lit gradient whose colours come from the product's state colours.
Rule: a ground has light, texture or material; the exception is a flood or a dive under ~1 s, or a brand that is flat on purpose. Flip light and dark between acts by a carried object or a hard cut on motion, never by changing swatches for rhythm.

## 4. Real UI through a camera

"Real UI shown through a camera (cropped, lit, at scale), not a small screen floating in black." Readability comes from the camera, never from inflating the interface: a test film's UI text blown up to 33 px was called a slide; the fix was real size (15-17 pt) and a macro push onto the one element (`edits.md`).
- **Magnify with the camera:** push, snap or crop until the one readable object is the frame (text at least 0.04 H, fragment at least 0.55 W, or cut by the frame edge; this is gate G1).
- **Lit:** the UI is an object in the world: it catches the key, has an edge, a surface that contrasts with the ground, a shadow or a rim; it is not a rectangle with a background colour.
- **At scale and framed:** crop to the active control, the cursor and its consequence; the whole dashboard small is filler.
- **With identity:** the product's real icon, real sender, time, sentence, real status bar or tab bar for a phone, real density (grouped rows, large title), real type. Never the component-library default: a dark rounded card with a status dot and "label . $value", a white card with "+ Aa :)" toolbar circles, a "Good morning" greeting, zinc greys, skeleton bars. Never invented names or numbers where the capture has real ones. `lint.mjs` flags several of these; the rest you find on the sheet.
- If the capture has real screens, crop those. If it does not, build the fragment from the product's own tokens, radius and type (see `runtime/native-ui/` for true-proportion phone and notification builders) and declare in NOTE.md that it is a rebuilt fragment.

## 5. Tools and when to reach for them

**hero3d (real 3D).** WHEN the idea is physical: an object that transforms, catches light, has mass, or that the brand makes (a bottle, a key, a phone, an extruded mark). Not as premium garnish. Use `runtime/hero3d` (usage in `runtime/README.md`, section "3D", driven from the film as `M.hero3d('#gl', { envMap, objects: [...] | build: (THREE, scene, camera, ctx) => ..., state: (t, objs, ctx) => ({ camera, objects }) })`, `t` in seconds; reference `examples/3d-hero/index.html`); every frame is a pure function of `t`.
- The environment is the lighting: metals and glass show their surroundings, so give them a studio environment (bright cards on a dark field, structure behind the camera). Without an environment map everything is grey CG plastic.
- One key, a rim, falloff, contact shadows. Materials: brand plastic = brand colour, low roughness, clearcoat; satin = some metalness, mid roughness; glass needs something in the 3D scene behind it to refract; iridescence needs a non-white base.
- Extruded chrome type with flat faces flashes whole letters white/black; bend the shading normals slightly so each face carries a band of environment.
- Filmic tone mapping for dark chrome; neutral when a brand colour must be exact. Bloom only on true light sources, low strength, high threshold.
- Camera like a lens: narrow FOV (about 25-35 degrees), moves with weight, depth of field spent on one rack focus.
- Slop 3D: default grey material, a spinning logo for no reason, orbiting an object when the film isn't about its form, 3D on every beat, bloom haze, lens flares, glossy clip-art icons (shield, trophy, rocket, lightbulb).

**imagegen surface plates** (`scripts/imagegen.py`, Codex image tool; flags in `references/tools.md`). WHEN a surface the brand doesn't have a photo of is missing: a photographic plate, a texture, a material, an environment, a physical prop. Never text, logos, UI or people presented as real; code owns every letter and every interface. Inspect each image at full size (text leaks, anatomy, style drift) and check the md5 against the previous take (a stale re-use is the usual failure). A plate must PERFORM: be revealed, travelled through, lit, cut out; not sit behind a centred headline. Illustrative imagery is declared in NOTE.md, never captioned on screen. One judged music-app round picked the build with real-looking generated material ("C is very good") because it carried prompt to feed to logo.

**shutter blur** (`node scripts/render.mjs ... --shutter 180 --subframes 8`). Code is perfectly sharp and frozen between frames, and the eye reads that as "computer". Shutter blur integrates sub-frames in one pass (4 sub-frames leave double outlines on fast moves; 8 is the floor). Use it for SMOOTH-clock films. One blur grammar per film: shutter blur, OR per-element directional smear, OR crisp steps (twos clock, hard steps). Never stack real blur on fake smear copies, and never use `--shutter` on a stepped film.

**grain** (`--grain 0.03`). A little temporal grain kills banding in gradients and glows and makes flat colour feel photographed. Skip it when the brand is crisp and flat on purpose; skip it on tiny details that must stay clean.

## 6. The screenshot-worthy hero moment

Before building: name the one frame someone would screenshot and send to a friend. It is a single frame with a focal point, a source of light, a surface you can feel and a thing happening. If you cannot describe it in a sentence, the hero moment is not built; the idea is a topic. The hero moment gets the hardest work: 3D, a shader, a dense composition, a physical simulation, an image plate. It is built FIRST (step 6 in SKILL.md), rendered with `--still`, and looked at. If it doesn't read at speed, fix the idea or the staging before the rest.

## 7. Richness is not clutter

- One focal point inside a built world: many layers, one lit thing. Hierarchy by light and scale, then colour, then isolation.
- Density that rewards a second look (a plate with grain, a rim, a shadow, a detail in the UI) is richness. Everything the same size and brightness is clutter (and a slide).
- The user picked the calm legible film over a frantic one: richness is not energy. Check the human band in `look.py` (mean motion median 6.8, IQR 4.4-9.8) as a question, not a target.
- Empty is allowed when it does a job: a breath before a payoff, isolation after a matched cut, under ~1.5 s. Otherwise fill the ground with the world.
- Test: cover the type. Does each frame still show a picture (a surface, light, an object)? If the answer is "a flat colour" or "a card on a flat colour", the beat has no picture.

## Slop tells for this topic

| AI default | Decision |
|---|---|
| A flat swatch per scene | A surface from the capture or a real material; flat only for a flood under ~1 s |
| Radial glow, vignette, orbs around the logo | Light with a source and a direction, at an event |
| Ghost text at 5-8% opacity, hairline rules, grid patterns, "grain overlay" as decoration (house-style defaults of the HyperFrames skills) | Texture as a surface that belongs to the world; this skill wins where they disagree |
| 3D tilt or 3D bar charts around a flat card | A cropped, held-pose device and a camera move, or a real 3D object with an environment |
| A small card floating on a void | The fragment magnified by the camera in a lit world |
| Glass cards stacked over a gradient | One material, one light logic |
| A generated image as a centred backdrop | A plate that performs (revealed, travelled, lit) |
| Bloom and lens flare as "premium" | Bloom on true light sources only, or none |
| Four rendering styles in one frame | One light, one lens, one drawing style |
