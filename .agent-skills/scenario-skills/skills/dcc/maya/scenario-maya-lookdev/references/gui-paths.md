# GUI paths (for a computer-use agent or a human)

The same procedures as `procedures.md`, through menus. Menu labels come from the tutorials (Maya
2020 to 2022 UIs) and the Maya 2027 help; labels not confirmed in a 2027 source are marked [verify].
On macOS, Maya's docs map Ctrl to Control and Alt to Option, not Command (Maya 2027 help, hotkeys).

## Materials and textures (Maya)

| Task                                             | Path                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Open Hypershade                                  | Windows > Rendering Editors > Hypershade                                                                                                                                                                                 |
| Create a shader                                  | Hypershade > Create panel > Maya > Surface > OpenPBR Surface [verify label], or Arnold > Shader > aiStandardSurface; in the Node Editor press Tab and type the node name (Sarkamari [ZtEiVa3MPLg 00:14:38])              |
| Rename shader and shading group                  | select, Attribute Editor name field; the SG tab of the shader (Sarkamari [ZtEiVa3MPLg 00:15:45])                                                                                                                         |
| Assign                                           | select meshes, right-click the shader in Hypershade > Assign Material To Selection                                                                                                                                       |
| File texture                                     | click the checker icon next to an attribute > File; Attribute Editor > File Attributes > Image Name                                                                                                                      |
| Color space                                      | file node > File Attributes > Color Space; tick Ignore Color Space File Rules after changing it (Maya 2027 help)                                                                                                         |
| UDIM                                             | file node > File Attributes > UV Tiling Mode > UDIM (Mari) [verify label]                                                                                                                                                |
| Grayscale via alpha                              | file node > Color Balance > Alpha Is Luminance, then connect Out Alpha (Sarkamari [ZtEiVa3MPLg 00:19:10])                                                                                                                |
| Show hidden attributes (bump2d normalCamera)     | Node Editor: right-click the node > Show Hidden (Raycast [vPHhVrxxThU 00:23:40])                                                                                                                                         |
| Expose a hidden shader input (specular rotation) | Node Editor: right-click > Edit Custom Attribute List (Arvid [cpMBRIWwghg 00:15:12])                                                                                                                                     |
| Presets (Chrome, Skin, Glass...)                 | Attribute Editor > Presets (top right) > preset name > Replace (Raycast [vPHhVrxxThU 00:05:11])                                                                                                                          |
| Color chooser with linear values                 | the color swatch values are rendering-space numbers; Arvid disables the picker's color management to type linear values [cpMBRIWwghg 00:06:25]; UI Settings > Show Color Managed Pots (Maya 2027 help) [verify location] |
| Convert Standard Surface to OpenPBR              | the MtoA menu entry "Convert All Standard Surface to OpenPBR Surface" (What's New 2027, MTOA-2560) [verify menu location]                                                                                                |
| Per-object user data (mask)                      | select the shape > Attribute Editor > Attributes > Add Attribute, name `mtoa_constant_<name>`, Integer (Arvid [cpMBRIWwghg 00:23:35])                                                                                    |

## Color management

| Task                                       | Path                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Preferences                                | Windows > Settings/Preferences > Preferences > Color Management (rendering space, display, view, input rules) (Maya 2027 help) |
| Reapply rules to existing file nodes       | Color Management preferences > Reapply Rules to Scene (nodes with Ignore Color Space File Rules are skipped)                   |
| View transform in Render View and viewport | the color management toolbar of each panel (exposure and gamma there are not saved)                                            |

## Mesh, subdivision, displacement (MtoA)

| Task                           | Path                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Smooth Mesh Preview            | 1 (off) / 3 (on); keep it off on meshes with Arnold subdivision                                                                       |
| Arnold subdivision             | select mesh > Attribute Editor > shape tab > Arnold > Subdivision > Type catclark, Iterations (J Hill [mpk6IurOWbs 00:27:32])         |
| Per-object displacement        | shape tab > Arnold > Displacement Attributes > Height, Bounds Padding, Scalar Zero Value, Auto Bump                                   |
| Displacement node              | Hypershade: select the shading group > Displacement Mat. slot > File, or connect a displacementShader (J Hill [mpk6IurOWbs 00:26:26]) |
| Smooth tangents for anisotropy | shape tab > Arnold > Subdivision > Smooth Tangents [verify label]                                                                     |
| Opaque flag                    | shape tab > Arnold > Opaque (off for opacity)                                                                                         |

## Lookdev scene

| Task                         | Path                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Skydome                      | Arnold > Lights > Skydome Light; click the Color map to create a file node; Format lat-long (J Hill [mpk6IurOWbs 00:03:32])                                                    |
| Rotate the HDRI              | rotate the skydome (J Hill middle-drags it [00:06:48]); for the turntable, key the parent locator                                                                              |
| Lock the dome from selection | put it on a display layer set to R (Reference) (J Hill [mpk6IurOWbs 00:12:09])                                                                                                 |
| Reference balls              | Create > Polygon Primitives > Sphere; parent under the camera in the Outliner (middle-drag) (Raycast [vPHhVrxxThU 00:05:11])                                                   |
| Clean an imported asset      | Windows > General Editors > Namespace Editor > Delete (merge with root); Modify > Freeze Transformations; Edit > Delete All by Type > History (Raycast [vPHhVrxxThU 00:02:46]) |
| Turntable keys               | select locator, frame 1: rotate Y 0, S; frame N+1: rotate Y 360, S; Graph Editor > Tangents > Linear                                                                           |
| Interactive render           | Arnold > Open Arnold RenderView (Maya IPR does not work with MtoA 5+, What's New 2027); snapshots for A/B (J Hill [mpk6IurOWbs 00:28:39]); region by dragging in the view      |
| TX files                     | Arnold > Utilities > TX Manager > Create TX (Raycast [vPHhVrxxThU 00:13:25]) [verify menu path in 2027]                                                                        |
| Name-based assignment        | Windows > Rendering Editors > Render Setup: collections with a name pattern and a material override (Arvid [cpMBRIWwghg 00:01:37])                                             |

## Substance 3D Painter (human side)

| Task                              | Path                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export                            | File > Export Textures (Ctrl+Shift+E) > Output template "Arnold (AiStandard)", PNG, TIFF or EXR, not JPEG (Sarkamari [ZtEiVa3MPLg 00:06:40])                     |
| Custom template (add AO or masks) | Export > Output Templates > duplicate the Arnold preset, add a gray channel named with the preset's pattern plus `$udim` (Sarkamari [ZtEiVa3MPLg 00:08:17])      |
| Custom masks                      | Texture Set Settings > add user channels (L8), fill layer with a black mask, a black base fill at the bottom (J Hill [mpk6IurOWbs 00:40:09]) [verify panel name] |
| The environment Painter showed    | Display Settings shows the environment; Assets > Environment > right-click > Export resource (Sarkamari [ZtEiVa3MPLg 00:05:38])                                  |
| Normal format                     | Edit > Project Configuration > Normal map format (OpenGL or DirectX) [verify]; tell the agent which one                                                          |

## Hotkeys worth knowing

5 shaded, 6 textured, 7 use all lights in the viewport; 1 and 3 Smooth Mesh Preview; F frame
selected. Ctrl+drag (Control on macOS) in Attribute Editor fields makes a virtual slider (Arvid
[cpMBRIWwghg 00:30:44]).
