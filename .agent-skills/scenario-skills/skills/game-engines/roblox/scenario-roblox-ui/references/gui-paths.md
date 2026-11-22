# GUI paths: UI and input in the Studio interface

The same procedures through Studio's menus, for a human or a computer-use agent. Each section names
the scripted substitute this skill runs instead. Paths come from the Roblox docs and the sources;
none of them was clicked while writing this skill (agents here never drive Studio's GUI).

## Device Simulator (layout on phones, tablets, consoles)

- Current docs: a toolbar above the 3D viewport, in Edit and in Play. It is a beta: **File > Beta
  Features > New Device Simulator**, then restart Studio.
- Pick a category button (**Phone**, **Desktop**, **Console**, **Headset**), then the device chip
  for a specific device. Phones are grouped as Flagship, Mid-range and Entry level.
- **Rotate** turns a phone or tablet to the next orientation.
- **Display scaling**: Physical size, Actual resolution or Fit to window. Physical size needs a
  calibration (**Calibrate physical scaling**) or auto-detection.
- **Manage devices** opens the Device Manager: show or hide standard devices, duplicate one into a
  custom device.
- Older Studio builds: **Test** tab > **Device** (Emulation group), with a Physical Size dropdown in
  the viewport (mobile roundtable, BsyU-SJ9L-c [00:14:06]).
- Judge two things on each device: text is legible, buttons are easy to press with a finger
  (roundtable [00:14:39]).
- Scripted substitute: `StudioDeviceSimulatorService` from `execute_luau` (`SetDeviceAsync`,
  `SetOrientationAsync`, `StopSimulationAsync`), wrapped by `rbx_ui.simulate` and
  `rbx_ui.layout_matrix`. Stop the simulation when done: it stays on the window.

## Controller Emulator (gamepad, handheld, TV remote)

- Open it with **Virtual controller** in the Device Simulator toolbar, or **Emulation** tab >
  **Controller**.
- The dropdown picks Generic Gamepad, PS4, PS5, Xbox, Generic Handheld, TV Remote, or a Quest
  headset.
- In a playtest, opening the widget connects the device and closing it disconnects it.
- Use it for what the scripted tests cannot send: thumbsticks, the D-pad, ButtonB (back), the Select
  button that toggles UI navigation, and the glyph change when a pad connects to a PC.
- Scripted substitute (partial): `GuiService:Select(container)`, arrow keys and Return through
  `user_keyboard_input`, and Scriptable `InputBinding:Fire` for gamepad buttons.

## Style Editor (tokens, themes, rules)

- **UI** tab > **Style Editor** > **Create Design** generates a design folder with token, theme and
  base sheets.
- Select a sheet, add a rule, then **Add a Property...** for each styled property.
- Keep the generated base sheet and its `StyleDerive`.
- Scripted substitute: `UIStyle.install(parent, spec)` builds the same `StyleSheet`, `StyleRule`,
  `StyleDerive` and `StyleLink` instances; `UIStyle.setTheme` swaps themes at runtime;
  `UIStyle.errors` lists rules with a `SelectorError`.

## Input Action System

- Explorer: insert an `InputContext` (for example under ReplicatedStorage), an `InputAction` in it
  and one `InputBinding` per device in the action.
- Properties: set the context's **Priority** and **Sink**, the action's **Type**, each binding's
  **KeyCode**, and the touch binding's **UIButton** (pick the button under StarterGui).
- Workspace > Properties: **PlayerScriptsUseInputActionSystem** = Enabled. Scripts cannot write it;
  in a Rojo project set it under `Workspace.$properties`.
- The Input Action Manager (**Window > Input > Input Action Manager**, per the IAS doc as captured
  in October 2026) shows a matrix of actions and devices, with yellow warnings for a missing device
  binding and red for duplicates in one context.
- Scripted substitute: `UIInput.context(parent, name, spec)`; `UIAudit.input` reports missing
  gamepad or touch bindings, priority ties, chords and function keys.

## Localization

- **Window > Localization > Localization Tools**: Automatic Text Capture for an immediate capture
  during a playtest (strings land in 1 to 2 minutes; re-enable the toggle each Studio session), and
  the Cloud Localization Table download and upload as CSV.
- Creator Hub: **Creations** > the experience > **Configure Localization** (or **Manage
  Experience** > **Audience** > **Localization**) for source and supported languages, automatic
  translation and the quota. It needs a published experience.
- Scripted substitute: a `LocalizationTable` with `SetEntries`,
  `LocalizationService:GetTranslatorForLocaleAsync(locale)` and `Translator:Translate` in a playtest
  Client (P10), plus pseudo-localization in code.

## Properties worth checking by hand

- StarterGui: **ScreenOrientation** (a new place reads LandscapeSensor; set Sensor to allow
  portrait).
- Each ScreenGui: **ResetOnSpawn**, **ScreenInsets** (CoreUISafeInsets), **DisplayOrder**.
- ScrollingFrame: **AutomaticCanvasSize** = Y with a layout inside.
- Text objects: **AutoLocalize** off for numbers, names and timers.
- GuiButtons: **Selectable** on, for gamepad navigation.
