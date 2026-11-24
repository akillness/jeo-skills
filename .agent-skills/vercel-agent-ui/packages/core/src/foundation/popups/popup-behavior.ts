import type { PopupModal } from "./popup"

/** How Tab moves through a popup. See `PopupBehavior.tab`. */
type PopupTab = "close" | "flow" | "trap" | "native"

/**
 * How a kind of popup behaves. Components start from a preset in
 * `popupPresets` and override what differs, so `createPopupLayer` stays a short
 * list of wiring plus one name.
 */
type PopupBehavior = {
  // "close": Tab closes the popup and focus moves on from the trigger.
  // "flow": Tab moves in computed order, from the trigger into the popup and
  // on to the page after it, and focus leaving closes the popup.
  // "trap": Tab wraps inside the popup.
  // "native": the browser moves focus, in and out, and nothing closes.
  // A function picks from the modal effects, read live.
  tab: PopupTab | ((modal: PopupModal) => PopupTab)
  // Whether the window losing focus closes the popup. "iframe" closes only
  // when focus moved into an iframe outside it, so switching windows keeps it open.
  blur: "always" | "iframe" | "never"
  // An outside press dismisses at "pointerdown", or at "click", once it has
  // also been released outside.
  outsidePress: "pointerdown" | "click"
  // Stops outside presses at this layer, so popups beneath stay open.
  shield: boolean
  // Whether the trigger stays usable while the popup makes the page inert. A
  // modal dialog's trigger doesn't, since nothing outside it may be used.
  keepTrigger: boolean
  // Whether focus moves in for a popup that's open from the start, once it
  // binds. A modal dialog has to hold focus; a popover leaves it alone.
  focusOnMount: boolean
  // Whether focus leaving a "flow" popup closes it. A non-modal dialog stays.
  dismissOnFocusLoss: boolean
  // Whether Android's back gesture closes the popup, through a CloseWatcher,
  // with reason "back". Only the topmost watcher hears it.
  closeWatcher: boolean
  // Whether the open popup pauses keyboard shortcuts registered outside it.
  // A function picks from the modal effects, read when it shows.
  blocking: boolean | ((modal: PopupModal) => boolean)
  // Whether the popup ever moves focus: in when it opens, and back when it
  // closes. A tooltip never does, since focus stays on its trigger.
  movesFocus: boolean
}

const plain: PopupBehavior = {
  tab: "close",
  blur: "always",
  outsidePress: "pointerdown",
  shield: false,
  keepTrigger: true,
  focusOnMount: false,
  dismissOnFocusLoss: true,
  closeWatcher: false,
  blocking: false,
  movesFocus: true,
}

const trapOrFlow = (modal: PopupModal) => (modal.trapFocus ? "trap" : "flow")

/** The behavior of each kind of popup. Drawer adds its here. */
const popupPresets = {
  // Tab closes it, like a native menu, and so does the window losing focus.
  menu: plain,
  // Like a native select: Tab closes it and focus moves on from the trigger.
  select: plain,
  // Focus stays in the input while the list is open, so Tab is the browser's.
  // The combobox closes the list itself when focus leaves its input.
  combobox: { ...plain, tab: "native" },
  // Part of the page's Tab order unless modal, and it stays open while you
  // switch windows, so work in it can continue.
  popover: { ...plain, tab: trapOrFlow, blur: "iframe" },
  // Waits for the user whatever has focus. A modal one shields the layers
  // beneath, holds focus from the start, keeps its trigger inert, pauses the
  // page's shortcuts and closes on Android's back. Outside presses count once
  // released, so a text selection dragged out of a field doesn't close it.
  dialog: {
    ...plain,
    tab: trapOrFlow,
    blur: "never",
    outsidePress: "click",
    shield: true,
    keepTrigger: false,
    focusOnMount: true,
    dismissOnFocusLoss: false,
    closeWatcher: true,
    blocking: (modal) => modal.inertAndLock,
  },
  // Never takes focus and has nothing to Tab to, so the browser moves focus
  // past it. Escape and an outside press close it, and so does leaving the window.
  tooltip: { ...plain, tab: "native", movesFocus: false },
  // Part of the page's Tab order after its trigger, like a non-modal popover,
  // and focus leaving closes it. It's a passing preview, so leaving the window does too.
  hoverCard: { ...plain, tab: "flow" },
  // Site navigation: Tab flows from a trigger into its panel and on to the
  // next item, focus leaving the navigation closes it, and switching windows
  // leaves it as it was.
  navigationMenu: { ...plain, tab: "flow", blur: "never" },
} satisfies Record<string, PopupBehavior>

type PopupBehaviorName = keyof typeof popupPresets

// The preset's behavior, with any option passed beside it winning. Undefined
// options leave the preset's value.
function resolveBehavior(
  preset: PopupBehaviorName,
  overrides: Partial<PopupBehavior>
) {
  const behavior: PopupBehavior = { ...popupPresets[preset] }
  for (const key of Object.keys(plain) as (keyof PopupBehavior)[]) {
    const value = overrides[key]
    // Each key copies its own value, which TypeScript can't follow through a loop.
    if (value !== undefined) {
      Object.assign(behavior, { [key]: value })
    }
  }
  return behavior
}

export {
  type PopupBehavior,
  type PopupBehaviorName,
  popupPresets,
  type PopupTab,
  resolveBehavior,
}
