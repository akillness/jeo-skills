# Mykonos Island Voxels — Browser Game Prototype Prompt

You have two reference images:

1. A Mykonos voxel builder game screenshot showing the target visual direction, UI mood, camera angle, world composition, and overall gameplay/editor feeling.
2. A Mykonos voxel asset sheet showing the type of objects, structures, props, vegetation, terrain pieces, and decorative elements that should exist in the game.

Your goal is to create a playable browser game prototype inspired by these two images.

## Important Rule

You must first create the full game asset pack yourself, based on the visual style and content of the two reference images.

Do not import external visual assets.  
Do not use stock images.  
Do not use asset packs from elsewhere.  
Do not use placeholder icons or random UI packs.  

Everything visible in the game must come from assets you generate specifically for this project.

---

## Asset Creation Phase

Before building the game, generate a complete coherent 2D isometric asset pack inspired by the provided references.

Create an `/assets` folder and generate all required visual assets as separate transparent PNG files.

The created assets must match the style of the references:

- Mykonos / Greek island voxel style
- whitewashed cubic architecture
- cobalt-blue doors, shutters, railings, and pergolas
- warm beige stone paths and sea walls
- turquoise water
- terracotta pots and Mediterranean garden details
- isometric view
- clean readable silhouettes
- soft pastel colors
- polished premium prototype feel
- cute but structured island-builder aesthetic

---

## Required Assets to Create

### Terrain

- grass tile
- stone path tile
- sand / dirt tile
- water tile
- white stone tile
- stairs tile
- sea wall / canal edge tile

### Borders / Structure Helpers

- low white wall
- blue railing
- corner wall
- wooden gate fence
- lantern post

### Nature

- cypress cluster
- bougainvillea tree / bush
- olive tree / shrub
- agave plant
- dry grass tuft
- flower pot / flowering bush

### Lighting / Landmarks

- stone lantern
- hanging lantern
- white archway
- small chapel / altar
- signpost
- blue banner flag
- windmill

### Water Features / Farming / Utilities

- small bridge
- well
- planted garden bed
- crop patch
- vegetable garden
- water bucket
- pottery jar
- wooden crate
- blue bench
- hay bale / straw bundle

### Decorative Props

- rock cluster
- large rock
- mossy stone
- flat stone
- pebbles
- stone pile
- boulder
- wood pile
- storage box
- stone basin
- terracotta plant pot

### Buildings

- small Mykonos house
- two-story Mykonos house
- main villa
- windmill
- tower / chapel
- main chapel
- white cube house with blue door
- terrace house with blue railing
- pergola-covered house

### UI Assets

- button backgrounds
- panel backgrounds
- category tabs
- toolbar buttons
- hover highlight tile
- placement preview highlight
- simple custom icons if needed, created in the same style

All generated assets must be visually consistent with each other and suitable for an isometric builder game.

---

## Game Concept

Create a small Mykonos voxel island builder game called:

**Mykonos Island Voxels**

The player can build a tiny Mediterranean island village on an isometric grid.

---

## Core Gameplay

- The game starts with an empty isometric terrain grid.
- The player can select assets from a bottom asset palette.
- The player can place selected assets on the grid.
- The player can erase placed assets.
- The player can switch between terrain, nature, props, water, and buildings.
- The player can pan and zoom the view.
- The player can save the current layout in `localStorage`.
- The player can reset the world.
- The player can toggle the grid visibility.
- The goal is creative building, not combat.

---

## Visual Direction

The final game must feel like the provided Mykonos voxel builder screenshot:

- soft isometric camera
- clean pastel UI
- Mediterranean island village mood
- cream / light background
- floating square terrain platform
- subtle shadows
- polished browser-game prototype feeling
- calm sunny Greek island atmosphere
- whitewashed plaster buildings
- cobalt-blue doors, shutters, railings, and pergolas
- turquoise canals or sea-edge water
- warm beige stone paths
- pink bougainvillea accents
- cypress and olive vegetation
- terracotta pots and small courtyard details

Do not recreate the screenshot as a static image.

Build an actual interactive prototype.

---

## Technical Constraints

- Use HTML, CSS, and JavaScript.
- The game must run directly in the browser by opening `index.html`.
- Organize the code like a senior developer.
- Do not put everything into one giant file.
- Separate asset generation, asset loading, game logic, rendering, input, UI, and storage into clear modules.

Suggested structure:

```text
/index.html
/src/main.js
/src/config.js
/src/assets/generateAssets.js
/src/assets/assetManifest.js
/src/assets/assetLoader.js
/src/core/Game.js
/src/core/Camera.js
/src/core/InputManager.js
/src/core/Renderer.js
/src/grid/IsoGrid.js
/src/grid/TileMap.js
/src/building/PlacementSystem.js
/src/building/PlacedObject.js
/src/ui/UIManager.js
/src/ui/Toolbar.js
/src/ui/AssetPalette.js
/src/ui/HUD.js
/src/storage/SaveSystem.js
/assets/
```

---

## Important Implementation Detail

The project must include a step or script that creates the visual assets first, saves them into `/assets/`, then uses those generated assets in the game.

All final in-game visuals must come from that generated asset pack.

---

## Gameplay Details

- Use an isometric 2D rendering approach.
- Render the world using the created PNG assets.
- Use proper isometric depth sorting.
- The grid should be at least `10x10`.
- Terrain tiles cover the base grid.
- Buildings and props sit on top of tiles.
- Larger structures like villas, windmills, chapels, and tower houses occupy multiple cells.
- Small props like lanterns, rocks, cypress, agave, crops, pots, benches, and signs occupy one cell.
- Water and sea wall / canal pieces should visually connect nicely.
- Show a preview before placement.
- Highlight the hovered grid cell.
- Prevent large buildings from overlapping placed objects.
- Allow replacing terrain without deleting props above it.
- Allow erasing props/buildings separately from terrain.

---

## UI Requirements

### Title

**Mykonos Island Voxels**

### Left Toolbar

- Place
- Erase
- Pan
- Grid toggle
- Save
- Reset

### Bottom Asset Palette

- Terrain
- Nature
- Props
- Water
- Buildings

The palette must use the created asset images as icons.

Show the selected asset clearly.

### Instruction Panel

Add a small instruction panel:

- Click to place
- Right click or Erase mode to remove
- Drag to pan
- Mouse wheel to zoom

Keep all visible UI text in English.

---

## Interactions

- Left click places the selected asset.
- Right click erases the object on the selected cell.
- Mouse drag pans the camera.
- Mouse wheel zooms in/out.

### Keyboard Shortcuts

- `1` Terrain
- `2` Nature
- `3` Props
- `4` Water
- `5` Buildings
- `E` Erase mode
- `G` Toggle grid
- `S` Save
- `R` Reset

---

## Rendering

- Use canvas-based rendering or a clean DOM/canvas hybrid.
- Keep performance smooth.
- Add subtle drop shadows under objects.
- Add a soft background grid or foggy editor-style backdrop.
- Add warm sunlight and soft ambient shadows.
- Use clean depth sorting so houses, props, walls, plants, and bridges layer correctly.
- The final result should feel like a polished playable prototype.

---

## Important

Do not use external assets.  
Do not use emoji icons.  
Do not use external icon libraries.  
Do not use placeholder art.  

Create the assets first, then build the game with them.

Every visible object in the final game must come from the generated project asset pack.

---

## Deliverable

Create the complete working project.

Generate the full asset pack into `/assets/`.

Then build the playable browser prototype using only those generated assets.

The final prototype must open with `index.html` and let the player build a small Mykonos island voxel village.
