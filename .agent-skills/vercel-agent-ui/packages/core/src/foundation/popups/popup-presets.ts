// The presets `createPopup` takes, as values: each names its row in the
// behavior table and the features it needs, so a popup bundles only those.
// A bundler drops the presets a page never imports, and their features. The
// presets of popups a press opens are here, with the sheet they can present
// as; hover presets are in `popup-hover-presets.ts`, so a page with only
// those never has the sheet's lazily loaded module in its graph.
import type { Side } from "../platform/sides"
import type { Modal } from "./popup"
import type { PopupCore } from "./create-popup"
import { createDismissal } from "./dismissal"
import type { PopupBehaviorName } from "./popup-behavior"
import {
  type focusOpening,
  hoverOpening,
  placement,
  pressOpening,
  styleReset,
  triggerName,
  type warmGroup,
} from "./popup-features"
import { createPopupPayload } from "./popup-payload"
import { createPresentation } from "./presentation"

// Presenting as a sheet from the bottom of the screen, with `presentation`.
// The sheet's code loads only once a popup presents as one.
function sheetPresentation(
  core: PopupCore,
  dismissal?: ReturnType<typeof createDismissal>
) {
  const dialog = core.preset.behavior === "dialog"
  if (dialog) {
    core.store.set({ presentation: "dialog" })
  }
  return createPresentation(
    core.store,
    () => core.popup,
    () =>
      core.rules?.presentation
        ? core.rules.presentation()
        : core.options().presentation,
    dialog ? "dialog" : "popover",
    dismissal
  )
}

/**
 * How a kind of popup behaves, and the code for it. Pass one of the presets
 * to `createPopup`, like `popoverPreset`.
 * @experimental
 */
type PopupPreset = {
  /** How Tab, Escape, outside presses and the window losing focus behave, by the pattern it follows. */
  behavior: PopupBehaviorName
  /** The content's role. None for content that isn't a widget of its own, like a hover card. */
  role?: "dialog" | "alertdialog" | "menu" | "tooltip"
  /** The `modal` it has when the primitive's option doesn't say. Without one, the primitive keeps `modal` in its state itself, or it's never modal. */
  modal?: Modal
  /** The side it opens on when its content doesn't say. */
  side?: Side
  /** Milliseconds the pointer rests on the trigger before it opens, unless the `delay` option says. */
  delay?: number
  /** Milliseconds before it closes once the pointer has left, unless the `closeDelay` option says. */
  closeDelay?: number
  /** Milliseconds keyboard focus rests on the trigger before it opens. `delay` by default. */
  focusDelay?: number
  /** The data each trigger hands the content, its `payload`. */
  payload?: typeof createPopupPayload
  /** Placement beside the trigger. */
  placement?: typeof placement
  /** Presenting as a sheet, with the `presentation` option. */
  presentation?: typeof sheetPresentation
  /** `dismissible` and `onDismissAttempt`. Hover content takes neither, since WCAG 1.4.13 needs it dismissible. */
  dismissal?: typeof createDismissal
  /** Opening on a press, with a button trigger and focus moving in. Without it, resting the pointer and keyboard focus open it. */
  press?: typeof pressOpening
  /** Opening when the pointer rests on the trigger. */
  hover?: typeof hoverOpening
  /** Opening when keyboard focus rests on the trigger. */
  focus?: typeof focusOpening
  /** One open at a time, the next opening at once while one is warm. */
  group?: typeof warmGroup
  /** Naming an untitled popup after the trigger that opened it, whose name is copied since the page, its trigger included, goes inert. */
  triggerName?: typeof triggerName
  /** Undoing the browser's own popover styles. */
  resetStyles?: typeof styleReset
}

/**
 * Rich content opened from a button: a non-modal dialog by default, part of
 * the page's Tab order, placed beside its trigger, that can open on hover with
 * `openOnHover` and present as a sheet. For `createPopup`.
 * @experimental
 */
const popoverPreset = {
  payload: createPopupPayload,
  behavior: "popover",
  role: "dialog",
  dismissal: createDismissal,
  modal: false,
  placement,
  presentation: sheetPresentation,
  press: pressOpening,
  hover: hoverOpening,
  resetStyles: styleReset,
} satisfies PopupPreset

/**
 * A modal dialog by default: it holds focus, makes the page inert and locks
 * its scroll, and can present as a sheet. Not placed beside its trigger. An
 * untitled one is named after the trigger that opened it. For `createPopup`.
 * @experimental
 */
const dialogPreset = {
  payload: createPopupPayload,
  behavior: "dialog",
  role: "dialog",
  dismissal: createDismissal,
  modal: true,
  presentation: sheetPresentation,
  press: pressOpening,
  triggerName,
  resetStyles: styleReset,
} satisfies PopupPreset

// Alert Dialog's: a dialog that never presents as a sheet, so it doesn't
// carry the code for one. Alert Dialog keeps itself modal, whatever its
// options say, so the preset names no `modal`.
const alertDialogPreset = {
  payload: createPopupPayload,
  behavior: "dialog",
  role: "alertdialog",
  dismissal: createDismissal,
  press: pressOpening,
  triggerName,
  resetStyles: styleReset,
} satisfies PopupPreset

// Drawer's: a dialog that is a sheet of its own. Its snap point decides
// whether it's modal, so the preset names no `modal`.
const drawerPreset = {
  payload: createPopupPayload,
  behavior: "dialog",
  role: "dialog",
  dismissal: createDismissal,
  press: pressOpening,
  triggerName,
  resetStyles: styleReset,
} satisfies PopupPreset

// Menu's: placed beside its trigger, presenting as a sheet, and handing each
// trigger's payload to the content. Its own triggers open it, and it keeps
// its `modal` itself, since a submenu and a menubar's menus share their root's.
const menuPreset = {
  payload: createPopupPayload,
  behavior: "menu",
  role: "menu",
  dismissal: createDismissal,
  placement,
  presentation: sheetPresentation,
} satisfies PopupPreset

// Select's: like a native select, Tab closes it and focus moves on from the
// trigger. Placed below its trigger, modal to the pointer, and presenting as
// a sheet. Its own trigger and list do the rest.
const selectPreset = {
  behavior: "select",
  modal: "pointer",
  dismissal: createDismissal,
  placement,
  presentation: sheetPresentation,
} satisfies PopupPreset

// The list of Combobox and Autocomplete: focus stays in their input while
// it's open, so Tab is the browser's. Placed below the input and presenting as
// a sheet. Their own input, triggers and list do the rest.
const comboboxPreset = {
  behavior: "combobox",
  modal: false,
  dismissal: createDismissal,
  placement,
  presentation: sheetPresentation,
} satisfies PopupPreset

// Date Picker's calendar: placed beside its input and presenting as a sheet,
// and never modal. Its own trigger and inputs open it, so it carries no
// presses or payloads.
const datePickerPreset = {
  behavior: "popover",
  dismissal: createDismissal,
  placement,
  presentation: sheetPresentation,
} satisfies PopupPreset

// Trigger Menu's list: opened by a character typed in an editor and placed at
// the caret, while focus stays in the editor. It never presents as a sheet.
const triggerMenuPreset = {
  behavior: "combobox",
  dismissal: createDismissal,
  placement,
} satisfies PopupPreset

export {
  alertDialogPreset,
  comboboxPreset,
  datePickerPreset,
  dialogPreset,
  drawerPreset,
  menuPreset,
  popoverPreset,
  type PopupPreset,
  selectPreset,
  triggerMenuPreset,
}
