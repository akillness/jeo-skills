// Why and how a change happened: the shared reason vocabulary, the details
// every `on<Key>Change` receives, and the source of a change no event
// explains. `kernel/input-source.ts` reads the source of the ones events do.

/**
 * How the user caused a change.
 * @stable
 */
type ChangeSource =
  "mouse" | "touch" | "pen" | "keyboard" | "virtual" | "programmatic" | "agent"

/**
 * Every reason a change can report, what it means, and the DOM event behind
 * it. Components report a subset, exported as a union per callback, like
 * `PopoverOpenChangeReason`. Checking `details.reason` narrows `details.event`
 * to the type listed here. Controllers and cascades have no event, so
 * `event` is always optional.
 * @stable
 */
type ReasonVocabulary = {
  /** Click, tap, Enter or Space on the part that opens, closes or toggles. Arrow keys that open a menu or submenu count too. A tap on a combobox's input that opens a sheet reports its `touchend`. */
  "trigger-press": MouseEvent | KeyboardEvent | TouchEvent
  /** The pointer rested on a trigger, or left it, with hover opening. */
  "trigger-hover": PointerEvent
  /** Keyboard focus reached a trigger that opens on focus, like a tooltip's. */
  "trigger-focus": FocusEvent
  /** A member of a collection was chosen: a menu item, a tab, a radio or a checkbox item. */
  "item-press": MouseEvent | KeyboardEvent
  /** A Close part was pressed, or a form with `method="dialog"` was submitted. */
  "close-press": MouseEvent | KeyboardEvent | SubmitEvent
  /** A single-element control was pressed: a checkbox, a switch or a toggle. */
  press: MouseEvent | KeyboardEvent
  /** Arrow, Home or End keys moved the selection, typing picked an item, or Ctrl or ⌘ with A selected every item of a listbox. */
  "list-navigation": KeyboardEvent
  /** A link was pressed, which closes the navigation menu it is in, like after a route change. */
  "link-press": MouseEvent | KeyboardEvent
  /** The pointer moved onto an item, which highlighted it, like in a command list. */
  "item-hover": PointerEvent
  /** A press outside the layer. */
  "outside-press": MouseEvent
  /** Escape, or a submenu's close key (ArrowLeft in left-to-right layouts). */
  "escape-key": KeyboardEvent
  /** Focus left the layer, or Tab moved it out. */
  "focus-out": FocusEvent | KeyboardEvent
  /** Keyboard focus moved into the component, which stops a rotating carousel, as the carousel pattern asks, or onto a canvas item, which brought it into view, or onto a calendar's day another way, like a screen reader's. */
  "focus-in": FocusEvent
  /** The window lost focus. */
  "window-blur": FocusEvent
  /** Another submenu in the same menu, or another menu in the same menubar, took over. */
  "submenu-switch": PointerEvent | KeyboardEvent
  /** The parent layer closed. */
  "parent-close": undefined
  /** A press-and-hold open was released outside the popup. */
  "trigger-release": PointerEvent
  /** The browser's find in page matched hidden content. */
  "find-in-page": Event
  /** The selected item left the page, and another was picked. */
  "item-removed": undefined
  /** A form reset. */
  reset: undefined
  /** The browser restored state, like after going back, or a saved value was read back from storage. */
  restore: undefined
  /** Another tab, or another storage with the same ID, saved a new value. */
  "storage-sync": StorageEvent | undefined
  /** A swipe gesture: a finger, mouse or pen dragged it. */
  swipe: PointerEvent | TouchEvent
  /** The user scrolled a carousel some other way: a wheel, a trackpad, a scrollbar, or the browser bringing focus or a find in page into view. */
  scroll: Event | undefined
  /** A drawer's handle was pressed, which moved it to its next snap point. */
  "handle-press": MouseEvent | KeyboardEvent
  /** Arrow keys, Home or End on a drawer's handle moved it between snap points. */
  "handle-key": KeyboardEvent
  /** The content or the screen changed size, and the drawer's snap point or the carousel's page went away, so it moved to the nearest one. */
  "content-resize": undefined
  /** Going back: the Android back button or gesture, or Backspace in an empty command input, which returns to the previous page. */
  back: Event
  /** A controller or `api` call, or a property set on a web component. */
  imperative: undefined
  /** A keyboard shortcut, like a trigger's `shortcut`. */
  shortcut: KeyboardEvent
  /** A duration ran out, like a toast's, or a rotating carousel's interval. */
  timeout: undefined
  /** A Close part's `action` finished. */
  action: MouseEvent | KeyboardEvent
  /** The component left the page while open. Only a controller's `open()` reports it. */
  unmount: undefined
  /** A Clear part was pressed, like on an input, a select or a combobox. */
  "clear-press": MouseEvent | KeyboardEvent
  /** Typing, pasting or dropping changed a text field's value; in a combobox it can also open or close it, or Enter keeps the typed text as the value. */
  "input-change": Event
  /** ArrowUp or ArrowDown brought back an earlier value with `createInputHistory`, or what was being typed. */
  "history-key": KeyboardEvent
  /** A chip's remove part was pressed, or Backspace or Delete removed a chip or a span. */
  "remove-press": MouseEvent | KeyboardEvent
  /** Enter, or leaving a number input, committed what was typed: a number input parses, clamps and snaps it to the step, and an autocomplete closes its suggestions on it. */
  "input-commit": FocusEvent | KeyboardEvent
  /** Arrow, Page Up, Page Down, Home or End stepped a slider or a number input. */
  "step-key": KeyboardEvent
  /** A press on a slider's track or an area's surface moved the nearest thumb there. */
  "track-press": PointerEvent
  /** A slider thumb or a resize handle was dragged, or an item was dragged to a new place in a list. */
  drag: PointerEvent
  /** Space or Enter dropped a list item that arrow keys, Home or End moved to a new place, or an arrow moved or resized a span. */
  "move-key": KeyboardEvent
  /** Enter or a double-click on a resize handle collapsed the panel beside it, or restored it. */
  collapse: KeyboardEvent | MouseEvent
  /** The group changed size, so panels with sizes in pixels moved to stay within their bounds. */
  resize: undefined
  /** A number input's increment button was pressed, or held. */
  "increment-press": PointerEvent | MouseEvent
  /** A number input's decrement button was pressed, or held. */
  "decrement-press": PointerEvent | MouseEvent
  /** The mouse wheel stepped a focused number input. */
  wheel: WheelEvent
  /** A drag on a number input's scrub area. */
  scrub: PointerEvent
  /** A screen reader's adjust gesture, like a swipe up or down on a slider. */
  "accessibility-adjust": Event
  /** Files were dropped on a drop zone, or text and tokens on a token input. */
  drop: DragEvent
  /** Files were pasted, like a screenshot, or text and tokens into a token input. */
  paste: ClipboardEvent
  /** Files were chosen in the system's file picker. Its input's `change` event. */
  picker: Event
  /** The caret left a trigger menu's match: an arrow key, Home or End, a click, or a selection change. */
  "caret-move": KeyboardEvent | PointerEvent | Event
  /** A selection was cut from a token input. */
  cut: ClipboardEvent
  /** Undo, from the keyboard, the Edit menu or a controller. */
  undo: KeyboardEvent | InputEvent
  /** Redo, from the keyboard, the Edit menu or a controller. */
  redo: KeyboardEvent | InputEvent
  /** An image loaded. No event when it was already in the browser's cache. */
  "image-load": Event | undefined
  /** An image failed to load, or has no source. No event when that was known at once. */
  "image-error": Event | undefined
  /** An image got a new source, or left the page, so its status starts over. */
  "src-change": undefined
  /** A toggle was pressed: a password input's, which shows or hides the password, or a carousel's, which starts or stops rotation. */
  "toggle-press": MouseEvent | KeyboardEvent
  /** The form was submitted, which hides a shown password so the browser offers to save it. */
  "form-submit": SubmitEvent
  /** The page was hidden, like when navigating away, which hides a shown password before the browser keeps the page. */
  "page-hide": PageTransitionEvent
  /** A pagination's or a carousel's Previous part was pressed. */
  "previous-press": MouseEvent | KeyboardEvent
  /** A pagination's or a carousel's Next part was pressed. */
  "next-press": MouseEvent | KeyboardEvent
  /** A pagination's First part was pressed. */
  "first-press": MouseEvent | KeyboardEvent
  /** A pagination's Last part was pressed. */
  "last-press": MouseEvent | KeyboardEvent
}

/**
 * A reason from the shared vocabulary.
 * @stable
 */
type ChangeReason = keyof ReasonVocabulary

/** The DOM event a reason reports, from the vocabulary. Any `Event` for reasons outside it. */
type EventOf<Reason extends string> = Reason extends ChangeReason
  ? ReasonVocabulary[Reason]
  : Event

/**
 * What every `on<Key>Change` callback receives after the new value. One
 * member per reason, so checking `reason` narrows `event`.
 * @stable
 */
type ChangeDetails<Reason extends string = string> = Reason extends unknown
  ? {
      /** Why it changed, like `"escape-key"`. */
      reason: Reason
      /** The DOM event behind it, typed by `reason`. Undefined for controllers and cascades. */
      event?: EventOf<Reason>
      /** How the user caused it: `"mouse"`, `"touch"`, `"pen"`, `"keyboard"`, `"virtual"` (a click with no pointer or key behind it, which may be assistive technology), `"agent"` (an AI agent's call through `@ui-sdk/core/agent`) or `"programmatic"`. For analytics and focus choices, never for behavior. */
      source: ChangeSource
      /** Stops the change. A controlled component ignores it, since the next value comes from you. */
      cancel: () => void
      /** Whether `cancel()` was called. */
      readonly canceled: boolean
    }
  : never

/**
 * What every write method on a controller takes, like
 * `setValue(value, { reason, event })`. Both reach the change callback's details.
 * @stable
 */
type ChangeOptions<Reason extends string> = {
  /**
   * The reason passed to the change callback.
   * @defaultValue "imperative"
   */
  reason?: Reason
  /** The event behind the change, if any, passed to the change callback. */
  event?: Event
}

/**
 * What an `on<Value>Commit` callback receives after the value: why and how the
 * interaction that ended changed it. Commits can't be canceled.
 * @stable
 */
type CommitDetails<Reason extends string = string> = Reason extends unknown
  ? {
      /** What changed the value, like `"drag"` or `"step-key"`. */
      reason: Reason
      /** The DOM event that ended the interaction, or the one behind the last change when the end was another kind, like a blur after a wheel. Undefined for controllers. */
      event?: EventOf<Reason>
      /** How the user caused it, like `"mouse"` or `"keyboard"`. */
      source: ChangeSource
    }
  : never

const dismissReasons = [
  "escape-key",
  "outside-press",
  "focus-out",
  "window-blur",
  "back",
  "swipe",
] as const satisfies readonly ChangeReason[]

/**
 * The reasons that mean the user dismissed a layer, rather than chose something in it.
 * @stable
 */
type DismissReason = (typeof dismissReasons)[number]

/**
 * The dismissals a person makes on purpose, which `onDismissAttempt` hears about when `dismissible` refuses them.
 * @stable
 */
type DismissAttemptReason = Extract<
  DismissReason,
  "escape-key" | "outside-press" | "back" | "swipe"
>

/**
 * What `onDismissAttempt` receives when `dismissible` refused a dismissal.
 * Checking `reason` narrows `event`.
 * @stable
 */
type DismissAttemptDetails<
  Reason extends DismissAttemptReason = DismissAttemptReason,
> = Reason extends unknown
  ? {
      /** How the user tried to dismiss it, like `"escape-key"`. */
      reason: Reason
      /** The DOM event behind it. */
      event?: EventOf<Reason>
    }
  : never

/**
 * Whether a reason dismissed a layer: Escape, an outside press, focus or the
 * window leaving, Android's back or a swipe. For "Discard changes?":
 * `if (!open && isDismissal(details.reason) && dirty) details.cancel()`.
 * @stable
 */
function isDismissal(reason: string): reason is DismissReason {
  return (dismissReasons as readonly string[]).includes(reason)
}

// Reasons that never come from the user directly.
const programmaticReasons: ReadonlySet<string> = new Set<ChangeReason>([
  "image-load",
  "image-error",
  "imperative",
  "item-removed",
  "unmount",
  "reset",
  "restore",
  "timeout",
  "resize",
  "page-hide",
])

// The source of the change being dispatched, for changes it causes in turn,
// like a submenu closing because its parent did.
let cause: ChangeSource | undefined

/**
 * How a change came about, from its reason, the source of its event if it
 * has one, and the change that caused it. The event's source is read only
 * when the reason doesn't settle it, since reading it installs input tracking.
 */
function resolveSource(reason: string, eventSource?: () => ChangeSource) {
  // An agent's call, and every change it causes, reports the agent.
  if (cause === "agent") {
    return cause
  }
  if (programmaticReasons.has(reason)) {
    return "programmatic"
  }
  if (eventSource) {
    const source = eventSource()
    // An `el.click()` core makes for a key, like Enter on a link item, keeps the key's source.
    return source === "programmatic" && cause ? cause : source
  }
  return cause ?? "programmatic"
}

/**
 * Runs `run` as part of an interaction made with `source`, and returns what it
 * returns. The changes it makes report what they would have during the
 * interaction itself, so an agent's stay the agent's for `observe` and
 * `undoSource("agent")`. An action that awaits runs on after its press ended,
 * so wrap what it changes after the `await` with the source the action received.
 *
 * @example
 * // A Button's click handler, in any framework. `status` is an Input's controller.
 * async function save(event: MouseEvent, { source }: ButtonActionDetails) {
 *   await saveDraft()
 *   withSource(source, () => status.setValue("Saved"))
 * }
 * @experimental
 */
function withSource<T>(source: ChangeSource | undefined, run: () => T) {
  const outer = cause
  cause = source
  try {
    return run()
  } finally {
    cause = outer
  }
}

/**
 * The details a callback receives: the `reason`, the `event` and anything
 * else `given`, like which item changed, with how the user caused it. A
 * change's details cancel it, through `cancel()` and `canceled`. A commit's,
 * with `cancelable` false, leave those out, since commits can't be canceled.
 */
function createDetails<
  const Given extends { reason: string; event?: Event },
  Cancelable extends boolean = true,
>(
  given: Given,
  source: ChangeSource,
  cancelable: Cancelable = true as Cancelable
) {
  type Kind = Cancelable extends true
    ? ChangeDetails<Given["reason"]>
    : CommitDetails<Given["reason"]>
  type Details = Kind & Omit<Given, "reason" | "event" | "source">
  // One object for every reason. The per-reason union only narrows for readers,
  // so it can't be built from a generic reason, and the cast happens once, here.
  if (!cancelable) {
    return { ...given, source } as unknown as Details
  }
  let canceled = false
  return {
    ...given,
    source,
    cancel: () => {
      canceled = true
    },
    get canceled() {
      return canceled
    },
  } as unknown as Details
}

export {
  type ChangeDetails,
  type ChangeOptions,
  type ChangeReason,
  type ChangeSource,
  type CommitDetails,
  createDetails,
  type DismissAttemptDetails,
  type DismissAttemptReason,
  type DismissReason,
  isDismissal,
  type ReasonVocabulary,
  resolveSource,
  withSource,
}
