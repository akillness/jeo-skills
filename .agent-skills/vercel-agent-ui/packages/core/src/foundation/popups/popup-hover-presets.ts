// The presets of popups that resting the pointer and keyboard focus open,
// for `createPopup`. Apart from `popup-presets.ts`, so a page with only these
// never has the sheet's lazily loaded module in its graph.
import {
  focusOpening,
  hoverOpening,
  placement,
  styleReset,
  warmGroup,
} from "./popup-features"
import { createPopupPayload } from "./popup-payload"
import type { PopupPreset } from "./popup-presets"

/**
 * A tooltip: it describes its trigger, opens when the pointer rests on it
 * and at once on keyboard focus, never takes focus, and only one is open at a
 * time, the next opening at once while one is warm. For `createPopup`.
 * @experimental
 */
const tooltipPreset = {
  payload: createPopupPayload,
  behavior: "tooltip",
  role: "tooltip",
  side: "top",
  delay: 600,
  closeDelay: 0,
  focusDelay: 0,
  placement,
  hover: hoverOpening,
  focus: focusOpening,
  group: warmGroup,
  resetStyles: styleReset,
} satisfies PopupPreset

/**
 * A preview of what a link points to: it opens when the pointer or keyboard
 * focus rests on the link, Tab moves from the link into it, and focus leaving
 * closes it. For `createPopup`.
 * @experimental
 */
const hoverCardPreset = {
  payload: createPopupPayload,
  behavior: "hoverCard",
  delay: 600,
  closeDelay: 300,
  placement,
  hover: hoverOpening,
  focus: focusOpening,
  resetStyles: styleReset,
} satisfies PopupPreset

export { hoverCardPreset, tooltipPreset }
