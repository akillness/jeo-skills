// The popup layer every overlay shares: presence, the top layer, positioning,
// dismissal, modal side effects, Tab handling, and where focus goes on open
// and close. A component calls `createPopupLayer` once in `api` and `bind` from its
// content slot's `bind`, then adds only what's specific to it.
import { openAttrs } from "../kernel/attrs"
import { createController } from "../kernel/controller"
import { deriveFromOptions } from "../kernel/derive"
import type {
  ChangeOptions,
  ChangeReason,
  ChangeSource,
} from "../kernel/details"
import { on } from "../kernel/events"
import type { Store } from "../kernel/store"
import {
  activeLayers,
  escapeLayer,
  findLayer,
  lastClosed,
  lastEscape,
  layerContains,
  layerCount,
  markClosed,
  openedSince,
  pushLayer,
  type Layer,
} from "../platform/layers"
import { inertOutside, lockScroll } from "./modal"
import {
  moveFocus,
  restoreFocus,
  sourceOf,
  trackInput,
} from "../kernel/modality"
import { isAfter } from "../kernel/order"
import { isBrowser } from "../platform/env"
import { afterPaint, ahead, enforceHidden, writeStyle } from "../platform/style"
import {
  activeElement,
  composedContains,
  supportsTopLayer,
} from "../platform/platform"
import {
  resolveBehavior,
  type PopupBehavior,
  type PopupBehaviorName,
} from "./popup-behavior"
import { registerPopupElement } from "./popup-elements"
import { guardFrames } from "./frame-guards"
import type { Anchor, position, PositionOptions } from "../platform/position"
import { animateIn, animateOut, writeOpen } from "../motion/presence"
import {
  composedTabbables,
  nextTabbable,
  positiveTabStops,
  radioGroup,
  tabbables,
} from "../focus/tabbable"

/** How a popup was last opened. Decides where focus goes. */
type PopupOpener =
  "pointer" | "touch" | "keyboard" | "hover" | "imperative" | "initial"

/**
 * Where focus goes. `"trigger"` follows the fallback chain: the trigger, the
 * element focused before opening, the trigger of the popup it was opened from,
 * then the nearest element that survived. `"none"` leaves focus alone. A CSS
 * selector, an element or a function picks a specific element.
 */
type PopupFocusTarget =
  | "trigger"
  | "none"
  | (string & {})
  | HTMLElement
  | (() => HTMLElement | null | undefined)

/**
 * What being modal means. `true` makes the rest of the page inert, locks
 * scroll, traps focus and lets an outside press only close the popup. `false`
 * does none of these. A string keeps exactly one effect: `"pointer"` keeps
 * outside presses from reaching the page, and `"trap-focus"` keeps the focus
 * trap. Each component accepts a documented subset.
 * @stable
 */
type Modal = boolean | "pointer" | "trap-focus"

/** What being modal means, as three separate effects. Components map their `modal` option onto it. */
type PopupModal = {
  /** An outside press only closes the popup and reaches nothing else. */
  consumeOutsidePress: boolean
  /** Tab wraps inside the popup. */
  trapFocus: boolean
  /** The rest of the page is inert and doesn't scroll. */
  inertAndLock: boolean
}

/**
 * How a popup closed, which a controller's `open()` resolves with.
 * @stable
 */
type PopupResult<Reason extends string = string, Result = string> = {
  /** Why it closed, like `"escape-key"` or `"close-press"`. `"unmount"` when the component left the page while open, and `"imperative"` when the `signal` aborted. */
  reason: Reason | "unmount"
  /** How the user closed it: `"mouse"`, `"touch"`, `"pen"`, `"keyboard"`, `"virtual"` or `"programmatic"`. */
  source: ChangeSource
  /** What closed it reported: a Close part's `value`, a form with `method="dialog"` reports its submitter's value, and `close({ returnValue })` passes its own, typed `Result`. */
  returnValue?: Result
}

// Why a popup closed: the close its component requested, or "imperative" for
// one nobody requested, like a controlled `open` prop.
type PopupClose<Reason extends string = string, Result = unknown> = {
  reason: Reason
  source: ChangeSource
  returnValue?: Result
}

/**
 * Why a popup asks its component to close: a dismissal its behavior allows, a
 * form with `method="dialog"`, an aborted `signal`, or a sheet swiped away.
 * Presets and presentations decide which of these a given popup can report.
 */
type PopupCloseReason =
  | "outside-press"
  | "escape-key"
  | "window-blur"
  | "focus-out"
  | "back"
  | "close-press"
  | "imperative"
  | "swipe"

// Every `modal` value is a point in the triple.
function modalTriple(modal: Modal) {
  return {
    consumeOutsidePress: modal === true || modal === "pointer",
    trapFocus: modal === true || modal === "trap-focus",
    inertAndLock: modal === true,
  }
}

// How each input source opens a popup. A screen reader's virtual click moves
// focus in like a key, and an event a script sent opens it like code.
const openerBySource: Record<ChangeSource, PopupOpener> = {
  mouse: "pointer",
  pen: "pointer",
  touch: "touch",
  keyboard: "keyboard",
  virtual: "keyboard",
  programmatic: "imperative",
  agent: "imperative",
}

const openerOf = (event?: Event) =>
  event ? openerBySource[sourceOf(event)] : "imperative"

// Where focus goes on open, by opener. Hover and an open from the start move
// no focus. Touch focuses the popup itself, so no on-screen keyboard appears.
// Anything else asks the component.
function initialFocusPlan(opener: PopupOpener) {
  if (opener === "initial" || opener === "hover") {
    return "none"
  }
  if (opener === "touch") {
    return "popup"
  }
  return "auto"
}

// Whether focus returns after an outside press. Focus stays on a focusable
// element the press reached. A mouse press waits until it's over, because the
// browser's own focus change on mousedown would undo it. A tap dismisses on
// click, after that change, so it returns at once.
function outsidePressFocus(press: {
  type: string
  focusable: boolean
  consumed: boolean
}) {
  if (press.focusable && !press.consumed) {
    return false
  }
  return press.type === "pointerdown" ? ("later" as const) : true
}

const selectableTypes = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
])

// Like Tab, landing on a filled text field selects its text, so typing replaces
// it, as in a rename dialog. The field whose popup is open, like a combobox
// input in its sheet, keeps what was typed.
function selectFilled(el: HTMLElement) {
  if (
    el.localName === "input" &&
    selectableTypes.has((el as HTMLInputElement).type) &&
    (el as HTMLInputElement).value &&
    el.getAttribute("aria-expanded") !== "true"
  ) {
    ;(el as HTMLInputElement).select()
  }
}

function firstUsable<T>(
  candidates: (() => T | null | undefined)[],
  usable: (value: T) => boolean
) {
  for (const candidate of candidates) {
    const value = candidate()
    if (value && usable(value)) {
      return value
    }
  }
}

/**
 * Options every write method on a popup controller takes.
 * @stable
 */
type PopupChangeOptions<Reason extends string = ChangeReason> =
  ChangeOptions<Reason>

/**
 * Options for opening a popup from a controller.
 * @stable
 */
type PopupOpenOptions<
  Payload = unknown,
  Reason extends string = ChangeReason,
> = PopupChangeOptions<Reason> & {
  /** Data for the content to render, like the row a menu acts on. Kept until the next open, so it stays put while the popup animates out. On an open popup it replaces the current payload, like another trigger taking it over, and an `anchor` passed with it moves the popup. */
  payload?: Payload
  /** Positions the popup against this instead of the trigger: an element, a point like `{ x, y }`, or anything with `getBoundingClientRect()`. */
  anchor?: Anchor
  /** Closes the popup, with reason `"imperative"`, when it aborts. An already aborted signal never opens it. */
  signal?: AbortSignal
}

/**
 * Opens, closes and inspects a popup from outside it.
 * @stable
 */
type PopupController<
  Payload = unknown,
  Reason extends string = ChangeReason,
  OpenOptions extends object = {},
  Result = string,
  PayloadReason extends Reason = Reason,
> = {
  /** Whether it's open. False as soon as it starts closing, while it still animates out. */
  isOpen: () => boolean
  /** Opens or closes it. Returns false when the change was canceled or it was already open or closed. */
  setOpen: (open: boolean, options?: PopupChangeOptions<Reason>) => boolean
  /**
   * Opens it, and resolves once it closes, with why, how and any return value. Resolves exactly
   * once and never rejects: on the next close from any source, when `signal` aborts, or with reason
   * `"unmount"` when the component leaves the page.
   */
  open: (
    options?: PopupOpenOptions<Payload, PayloadReason> & OpenOptions
  ) => Promise<PopupResult<Reason, Result>>
  /** Closes it. `returnValue` is passed to the promise `open()` returned. Returns false when the close was canceled or it was already closed. */
  close: (
    options?: PopupChangeOptions<Reason> & { returnValue?: Result }
  ) => boolean
  /** Opens it when it's closed, and closes it when it's open. Returns false when the change was canceled. */
  toggle: (options?: PopupChangeOptions<Reason>) => boolean
  /** The payload of the last open, from a controller or the trigger that opened it. */
  getPayload: () => Payload | undefined
  /** Moves focus to the trigger that opened it last, or the first trigger. */
  focus: () => void
}

/** Creates a popup controller. Components wrap it in their own `create<Name>Controller()`. */
function createPopupController<
  Payload = unknown,
  Reason extends string = ChangeReason,
  OpenOptions extends object = {},
  Result = string,
  PayloadReason extends Reason = Reason,
>() {
  return createController<
    PopupController<Payload, Reason, OpenOptions, Result, PayloadReason>
  >()
}

// The state a popup layer reads, writes and hears: its component's store, or
// a view of one, like the part of a navigation menu's state one item shows.
type PopupStore<State extends object> = Pick<
  Store<State>,
  "get" | "set" | "subscribe"
>

/**
 * Derives the state that changes with a controlled `open`, in the same pass
 * as it, like the highlighted item a closing menu clears. `derive` gets the
 * new `open` and the state before it. See `deriveFromOptions`.
 */
function deriveOpen<State extends { open: boolean }>(
  context: { store: PopupStore<State> },
  keys: (keyof State & string)[],
  derive: (open: boolean, state: State) => Partial<State> | void
) {
  deriveFromOptions(context, keys, (synced, state) =>
    "open" in synced && synced.open !== state.open
      ? derive(!!synced.open, state)
      : undefined
  )
}

// ARIA every popup trigger carries. Only the kind of popup differs. With
// several triggers, only the one that opened the popup is expanded and named
// by it.
function popupTriggerAttrs(
  state: { open: boolean; mounted: boolean; trigger?: string | null },
  id: string,
  haspopup: string,
  key = ""
) {
  const active = state.trigger == null || state.trigger === key
  const open = state.open && active
  return {
    id: active ? `${id}-trigger` : undefined,
    "aria-haspopup": haspopup,
    "aria-expanded": String(open),
    "aria-controls": active && state.mounted ? `${id}-content` : undefined,
    ...openAttrs(open),
  }
}

function disabledTriggerAttrs(props: {
  disabled?: boolean
  focusableWhenDisabled?: boolean
}) {
  const focusable = props.disabled && props.focusableWhenDisabled
  return {
    disabled: props.disabled && !focusable ? "" : undefined,
    "aria-disabled": focusable ? "true" : undefined,
    "data-disabled": props.disabled ? "" : undefined,
  }
}

// Attributes every popup carries. `popover` is set when it shows instead, so
// content rendered open on the server is visible before it hydrates. Content
// kept mounted while closed is hidden.
function popupContentAttrs(
  state: { open: boolean; mounted: boolean },
  id: string
) {
  return {
    id: `${id}-content`,
    tabindex: "-1",
    hidden: state.mounted ? undefined : "",
    ...openAttrs(state.open),
  }
}

const focusableSelector =
  "a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]"

function resolveTarget(target: PopupFocusTarget, root: ParentNode) {
  if (typeof target === "function") {
    return target() ?? undefined
  }
  if (typeof target === "string") {
    return root.querySelector<HTMLElement>(target) ?? undefined
  }
  return target
}

function usable(el: HTMLElement) {
  return el.isConnected && !el.closest("[inert]")
}

// Whether focus rests on nothing a person can use: the body, or an element
// that's gone, inert or no longer rendered, before the browser moves it away.
// A Range has no direction, so a selection made backwards notes it to keep its caret end.
function readCaret(selection: Selection) {
  const range = selection.getRangeAt(0).cloneRange()
  const backward =
    !range.collapsed &&
    selection.anchorNode === range.endContainer &&
    selection.anchorOffset === range.endOffset
  return { range, backward }
}

function focusIsLost() {
  const active = activeElement()
  return (
    !active ||
    active === active.ownerDocument.body ||
    !usable(active) ||
    active.checkVisibility?.() === false
  )
}

// Where focus goes on the next close. `true` returns it, `false` leaves it,
// `"later"` waits for the press to end, and `"unless-moved"` waits a microtask
// and skips the return when another layer opened or took focus meanwhile, like
// a dialog an item opened.
type ReturnMode = boolean | "later" | "unless-moved"

type AttachConfig = {
  // Where the popup goes beside its anchor, read on every check. Needs the
  // popup's `position` option.
  position?: () => PositionOptions
  // What to position against, read on every check. Defaults to the trigger.
  anchor?: () => Anchor | null | undefined
  // Hears each render of the popup's part, so a new side or offset applies
  // at once rather than at the next slow check.
  rendered?: (listener: () => void) => () => void
  initialFocus?: () => HTMLElement | null | undefined | void
  // An element shown in the top layer just below the popup, like a dialog's
  // backdrop. It animates in and out with the popup, and pressing it is an outside press.
  backdrop?: () => HTMLElement | undefined
  // The element that goes into the top layer, when it isn't the popup itself:
  // a full-screen element the popup sits in, like a sheet's viewport.
  host?: () => HTMLElement | undefined
  // Stays where it renders instead of going into the top layer, with its
  // backdrop, like a submenu shown in place of its parent's items inside a sheet.
  inline?: boolean
  // Runs when the popup shows, with its layer, and returns a cleanup for when
  // it hides. A sheet rises here.
  onShow?: (layer: Layer) => (() => void) | void
  // Runs as a close starts, before the exit is awaited, so an animation it
  // starts counts toward it. A sheet settles closed here.
  onClose?: () => void
}

// Whether a press on an element landed outside its border box, which is where
// its ::backdrop is. The browser targets the element itself for those.
function outsideBox(point: { x: number; y: number }, rect: DOMRect) {
  return (
    point.x < rect.left ||
    point.x > rect.right ||
    point.y < rect.top ||
    point.y > rect.bottom
  )
}

// What has focus as `el`'s own tree sees it, or null when focus is outside
// that tree. The document sees only the shadow host around focus, which is
// outside a popup in the same shadow root. Works in closed shadow roots too.
function focusedFrom(el: Element) {
  return (el.getRootNode() as Document | ShadowRoot).activeElement
}

// The selectors each document's reset covers and its text, shared by every
// copy of ui-sdk on the page, since they write the same style. Made on first
// use, so a bundle without popups drops it.
const resets = () =>
  ((globalThis as Record<symbol, unknown>)[
    Symbol.for("ui-sdk.popover-reset@2")
  ] ??= new WeakMap()) as WeakMap<
    Document,
    { selectors: Set<string>; css: string }
  >

// Undoes the browser's built-in styles for [popover] (centered, fit-content,
// a border, padding and a canvas background), so a popup that isn't
// positioned is a plain fixed element any class can style. In its own cascade
// layer, declared first in the document, so it loses to every author style,
// including utilities in layers, and still beats the browser's. Written again
// with known selectors too, so a page that replaced its adopted sheets gets
// it back.
function resetPopoverStyles(doc: Document, selectors: string[]) {
  let reset = resets().get(doc)
  if (!reset) {
    resets().set(doc, (reset = { selectors: new Set(), css: "" }))
  }
  const known = reset.selectors
  if (!selectors.every((selector) => known.has(selector))) {
    selectors.forEach((selector) => known.add(selector))
    reset.css = `@layer ui-sdk { :where(${[...known].map((selector) => `${selector}[popover]`).join(", ")}) { inset: auto; width: auto; height: auto; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; overflow: visible; color: inherit; background: none } }`
  }
  if (reset.css) {
    writeStyle(doc, "ui-sdk-popover-reset", reset.css)
  }
}

const prepared = new WeakSet<string[]>()

/**
 * Writes `resetPopoverStyles` for `selectors` ahead of the first open, with
 * the rule that keeps hidden parts hidden, which the content's bind writes
 * otherwise. Binding still writes both if the popup opens first.
 */
function prepareReset(selectors: string[]) {
  if (!isBrowser || prepared.has(selectors)) {
    return
  }
  prepared.add(selectors)
  ahead(() => {
    resetPopoverStyles(document, selectors)
    enforceHidden(document)
  })
}

// Android's back gesture, through a CloseWatcher. Only on Android: on desktop
// a close watcher also takes Escape, which the layers already handle. A close
// request for an Escape the layers just handled is ignored, so one key press
// never closes two popups. Returns a cleanup, or nothing where unsupported.
function watchClose(close: (event: Event) => void) {
  const Watcher = (
    globalThis as {
      CloseWatcher?: new () => EventTarget & { destroy: () => void }
    }
  ).CloseWatcher
  if (!Watcher || !/Android/.test(navigator.userAgent)) {
    return
  }
  let watcher: (EventTarget & { destroy: () => void }) | undefined
  try {
    watcher = new Watcher()
  } catch {
    return
  }
  watcher.addEventListener("close", (event) => {
    if (performance.now() - lastEscape() < 100) {
      return
    }
    close(event)
  })
  return () => watcher?.destroy()
}

// Each shown layer's own elements, which a parent that turns modal later keeps out of its inert.
const layerParts = new WeakMap<Layer, HTMLElement[]>()
const freezing = new WeakSet<Layer>()
// Shows a layer's popup again from the start, when it sits inside an element:
// its content does, or its trigger, when the content renders elsewhere.
const showsAgain = new WeakMap<
  Layer,
  { inside: (el: HTMLElement) => boolean; again: () => void }
>()

// A modal spares what shows above it: a layer opened from it, a newer layer
// that freezes the page like a confirm, and anything opened from that one.
function above(layer: Layer, modal: Layer) {
  for (let up: Layer | undefined = layer; up; up = up.parent) {
    if (
      up === modal ||
      (freezing.has(up) && (up.order ?? 0) > (modal.order ?? 0))
    ) {
      return true
    }
  }
  return false
}

function createPopupLayer<
  State extends { open: boolean; mounted: boolean },
  Reason extends string = string,
>(
  options: Partial<PopupBehavior> & {
    // The behavior to start from. Any behavior option passed here overrides it.
    preset: PopupBehaviorName
    store: PopupStore<State>
    // The component and instance, for the layer stack the devtools show.
    owner?: { component: string; id: string }
    // Looked up live, so a trigger that re-rendered as a new element still works.
    trigger: () => HTMLElement | undefined
    // Where focus returns on close, when that isn't always `trigger`.
    returnTrigger?: () => HTMLElement | undefined
    // Asks the component to close. `focus` says whether focus should return.
    close: (
      reason: PopupCloseReason,
      details: { event?: Event; focus: boolean | "later"; returnValue?: string }
    ) => void
    // Read when the popup shows.
    modal: () => PopupModal
    // The layer this one nests under. Without one, the open popup that contains the trigger.
    parent?: () => Layer | undefined
    // Whether a press on something outside the popup counts as inside, so it
    // doesn't dismiss. By default, presses on the trigger do.
    contains?: (target: Node, event?: Event) => boolean
    // Where focus goes on close.
    finalFocus?: () => PopupFocusTarget | undefined
    // Runs on open before the popup mounts, and on close before it animates
    // out, with why it closed when the popup's control says.
    onOpenChange?: (open: boolean, closed?: PopupClose<Reason>) => void
    // Runs once opening or closing has finished, after any animation. Never for
    // a popup open from the start.
    onOpenChangeComplete?: (open: boolean, closed?: PopupClose<Reason>) => void
    // Escape when this is the topmost layer. Closes by default.
    onEscape?: (event: KeyboardEvent) => void
    // Runs when the popup shows, with its layer. Returns a cleanup for when it hides.
    onShow?: (layer: Layer) => (() => void) | void
    // Elements that stay usable while the popup makes the page inert, like a
    // chat launcher. Presses on them never dismiss it. Read when it shows.
    persistent?: () => Element[]
    // `position` from `platform/position.ts`, for popups placed beside an anchor.
    // Passed in, so popups that never position, like dialogs, don't carry it.
    position?: typeof position
  }
) {
  const behavior = resolveBehavior(options.preset, options)
  const tabMode = () =>
    typeof behavior.tab === "function"
      ? behavior.tab(options.modal())
      : behavior.tab
  const { store } = options
  let bound: { el: HTMLElement; config: AttachConfig } | undefined
  let shown:
    { el: HTMLElement; cleanup: () => void; backdrop?: HTMLElement } | undefined
  let layer: Layer | undefined
  let stopExit: (() => void) | undefined
  let releaseInert: (() => void) | undefined
  let releaseWatcher: (() => void) | undefined
  let opener: PopupOpener = store.get().open ? "initial" : "imperative"
  let focusPending = behavior.focusOnMount && store.get().open
  let enterPending = false
  // Opened during a pointerdown: the browser's own focus change follows, so focus waits a frame.
  let openedOnPress = false
  let openedByKey = false
  let returnMode: ReturnMode = true
  let before: HTMLElement | undefined
  // The caret in a contenteditable it opened from, which focus alone puts back at the start.
  let caret: ReturnType<typeof readCaret> | undefined
  let openedWithoutTrigger = store.get().open
  // Where focus goes when what had it is gone: the popup this one opened from
  // returns to its own target, else the focus that the last close left.
  // Kept after a close, so a popup this one opened can still follow it.
  let upstream: (
    take?: (target: HTMLElement) => boolean,
    strict?: boolean
  ) => HTMLElement | undefined = () => undefined
  let path: {
    node: Element
    next: Element | null
    previous: Element | null
  }[] = []
  const returnTrigger = options.returnTrigger ?? options.trigger
  let place: (() => void) | undefined
  let checkPlacement: (() => void) | undefined
  let remodal: (() => void) | undefined
  let observer: ((open: boolean) => PopupClose<Reason> | undefined) | undefined

  const complete = (open: boolean, closed?: PopupClose<Reason>) =>
    options.onOpenChangeComplete?.(open, closed)

  // Whether it stays in the page as `open` changes to this: an open mounts it,
  // and a close leaves it while it animates out, unless nothing of it is in the page.
  const mountedAs = (open: boolean) => open || (!!shown?.el && isBrowser)

  // A controlled `open` mounts or unmounts the popup in the same pass.
  deriveOpen({ store }, ["mounted"], (open) =>
    mountedAs(open) === open ? ({ mounted: open } as Partial<State>) : undefined
  )

  function openedFrom(focused: HTMLElement | undefined) {
    before = focused
    const selection = focused?.isContentEditable
      ? focused.ownerDocument.getSelection()
      : null
    caret =
      selection?.rangeCount && focused!.contains(selection.anchorNode)
        ? readCaret(selection)
        : undefined
    const openerLayer = before && findLayer(before)
    const openerTarget = openerLayer ? undefined : lastClosed()
    upstream = openerLayer?.returnTarget ?? (() => openerTarget)
  }

  let wasOpen = store.get().open
  store.subscribe(() => {
    const { open } = store.get()
    if (open === wasOpen) {
      return
    }
    wasOpen = open
    if (open) {
      observer?.(true)
      options.onOpenChange?.(true)
      stopExit?.()
      stopExit = undefined
      // Reopened while animating out, before the framework rendered the close,
      // its next render sees nothing to change.
      if (shown) {
        for (const part of [shown.el, shown.backdrop]) {
          if (part) {
            writeOpen(part, true)
          }
        }
      }
      focusPending = true
      enterPending = true
      returnMode = true
      const active = isBrowser ? activeElement() : null
      openedFrom(
        active && active !== active.ownerDocument.body ? active : undefined
      )
      // A key pressed away from the trigger, like its shortcut in a field,
      // opened it from where focus was, unless that was a popup that just
      // closed, like the last menu of a menubar.
      const trigger = returnTrigger()
      openedWithoutTrigger =
        opener === "imperative" ||
        (openedByKey &&
          !!before &&
          !findLayer(before) &&
          !lastClosed() &&
          !(trigger && composedContains(trigger, before)))
      const exiting = !!shown
      store.set({ mounted: true } as Partial<State>)
      // Reopened while animating out, it attaches again: the close already let
      // go of the inert page and the close watcher, and focus has to move in.
      // Content that binds as it mounts has attached by now, so only once.
      if (bound) {
        if (exiting) {
          hide()
        }
        show()
      } else if (!isBrowser) {
        enterPending = false
        complete(true)
      }
      return
    }
    const mode = behavior.movesFocus && returnMode
    returnMode = true
    focusPending = false
    enterPending = false
    opener = "imperative"
    openedByKey = false
    const closed = observer?.(false)
    const el = shown?.el
    if (layer) {
      markClosed(returnTarget())
    }
    const from = upstream
    const range = caret
    caret = undefined
    if (!el || !isBrowser) {
      options.onOpenChange?.(false, closed)
      store.set({ mounted: false } as Partial<State>)
      complete(false, closed)
      return
    }
    // Focus on the body belongs to no one, like in Safari, where pressing a
    // button doesn't focus it. Focus in a popup nested under this one counts as
    // inside, and so does focus in a shadow root inside it.
    const active = activeElement()
    const trigger = options.trigger()
    const hadFocus =
      !active ||
      active === el.ownerDocument.body ||
      composedContains(el, active) ||
      (!!layer &&
        layerContains(layer, active) &&
        !(trigger && composedContains(trigger, active)))
    options.onOpenChange?.(false, closed)
    bound?.config.onClose?.()
    const order = layerCount()
    const exiting = [el, ...(shown?.backdrop ? [shown.backdrop] : [])]
    let left = exiting.length
    const stops = exiting.map((target) => {
      // The framework renders `data-closed` after this, too late for exit
      // keyframes keyed on it, so it's written here first.
      writeOpen(target, false)
      return animateOut(target, () => {
        if (--left > 0) {
          return
        }
        stopExit = undefined
        store.set({ mounted: false } as Partial<State>)
        hide()
        complete(false, closed)
      })
    })
    // An exit with nothing to animate has finished: a cleanup kept for it
    // would hold the closed content until the next open.
    if (left > 0) {
      stopExit = () => stops.forEach((stop) => stop())
    }
    releaseInert?.()
    releaseInert = undefined
    releaseWatcher?.()
    releaseWatcher = undefined
    if (!mode || !hadFocus) {
      return
    }
    if (mode === true) {
      returnFocus(el, from, false, range)
      // What focus went back to can leave as the framework renders the close,
      // like the row a confirm dialog's action removes. The chain goes on then.
      const target = activeElement()
      setTimeout(() => {
        if (
          target &&
          !target.isConnected &&
          focusIsLost() &&
          !openedSince(order)
        ) {
          returnFocus(el, from)
        }
      })
      return
    }
    if (mode === "unless-moved") {
      queueMicrotask(() => {
        const now = activeElement()
        const moved =
          !!now && now !== el.ownerDocument.body && !composedContains(el, now)
        if (!moved && !openedSince(order)) {
          returnFocus(el, from, false, range)
        }
      })
      return
    }
    const settle = () => {
      off()
      clearTimeout(fallback)
      setTimeout(() => {
        const active = activeElement()
        if (!active || active === el.ownerDocument.body) {
          returnFocus(el, from, false, range)
        }
      })
    }
    const off = on(window, "pointerup", settle, { capture: true })
    const fallback = setTimeout(settle, 1000)
  })

  // Where focus goes back to, in order. Opened without its trigger, what had
  // focus comes first, since the trigger was never used.
  function returnChain(
    el: HTMLElement | undefined,
    take?: (target: HTMLElement) => boolean,
    from = upstream,
    strict = false
  ) {
    const inherited = () => from(take, strict)
    const nearby = () => neighbour(el, strict)
    return openedWithoutTrigger
      ? [() => before, inherited, returnTrigger, nearby, options.trigger]
      : [returnTrigger, () => before, inherited, nearby, options.trigger]
  }

  // A popup opened from this one returns here after this one closed, trying
  // each target in turn with its own `take`. Reopened from that popup, each
  // leads back to the other, so the lookup stops there.
  let resolving = false
  function returnTarget(
    take: (target: HTMLElement) => boolean = usable,
    strict = false
  ) {
    if (resolving) {
      return
    }
    resolving = true
    try {
      return firstUsable(returnChain(shown?.el, take, upstream, strict), take)
    } finally {
      resolving = false
    }
  }

  // With `strict`, what took the place of a trigger that left isn't a neighbour.
  function neighbour(el: HTMLElement | undefined, strict = false) {
    const trigger = path[0]?.node
    // A trigger still in the page that can't take focus, like one disabled while
    // it was open, hands focus to what follows it, as one that left does. One
    // inside the popup, like an input a sheet moves into its header, isn't one.
    if (trigger?.isConnected && !el?.contains(trigger)) {
      for (const node of [
        ...path.slice(1).map((step) => step.node),
        trigger.ownerDocument!.body,
      ]) {
        const list = tabbables(node as Element).filter(
          (candidate) => !el?.contains(candidate)
        )
        const found =
          list.find(
            (candidate) =>
              isAfter(trigger, candidate) && !trigger.contains(candidate)
          ) ?? list.filter((candidate) => isAfter(candidate, trigger)).pop()
        if (found) {
          return found
        }
      }
      return
    }
    const index = path.findIndex(
      (step, i) => !step.node.isConnected && path[i + 1]?.node.isConnected
    )
    if (index === -1) {
      return
    }
    const { next, previous } = path[index]
    const parent = path[index + 1].node
    const inPlace = (sibling: Element | null): sibling is Element =>
      !!sibling?.isConnected && sibling.parentNode === parent
    const closed = inPlace(next)
      ? next.previousElementSibling === previous
      : !next &&
        (previous
          ? inPlace(previous) && !previous.nextElementSibling
          : !parent.firstElementChild)
    if (strict && !closed) {
      return
    }
    const from = (node: Node, candidate: Node) =>
      node.contains(candidate) || isAfter(node, candidate)
    const after = inPlace(next)
      ? (candidate: Node) => from(next, candidate)
      : inPlace(previous)
        ? (candidate: Node) =>
            isAfter(previous, candidate) && !previous.contains(candidate)
        : (candidate: Node) => from(parent, candidate)
    for (const { node } of path.slice(index + 1)) {
      const list = tabbables(node as Element).filter(
        (candidate) => !el?.contains(candidate)
      )
      const prior = inPlace(previous)
        ? list
            .filter(
              (candidate) =>
                !from(previous, candidate) || previous.contains(candidate)
            )
            .pop()
        : undefined
      const found = list.find(after) ?? prior ?? list[0]
      if (found) {
        return found
      }
    }
  }

  function returnFocus(
    el: HTMLElement,
    from: typeof upstream,
    strict = false,
    range?: ReturnType<typeof readCaret>,
    setting = options.finalFocus?.() ?? "trigger"
  ) {
    if (setting === "none") {
      return
    }
    // Focusing can fail, on a hidden or inert element. Then the next one gets a
    // turn, in the popups this one inherits its target from too.
    const take = (target: HTMLElement) => {
      if (!usable(target) || el.contains(target)) {
        return false
      }
      // A caret the app placed in it while open wins over the saved one.
      const selection = target.ownerDocument.getSelection()
      const kept =
        range && target === before
          ? selection?.rangeCount && target.contains(selection.anchorNode)
            ? readCaret(selection)
            : range
          : undefined
      restoreFocus(target)
      if (activeElement() !== target) {
        return false
      }
      if (kept && target.contains(kept.range.startContainer)) {
        const { startContainer, startOffset, endContainer, endOffset } =
          kept.range
        if (kept.backward) {
          selection?.setBaseAndExtent(
            endContainer,
            endOffset,
            startContainer,
            startOffset
          )
        } else {
          selection?.setBaseAndExtent(
            startContainer,
            startOffset,
            endContainer,
            endOffset
          )
        }
      }
      return true
    }
    const chain = returnChain(el, take, from, strict)
    if (setting !== "trigger") {
      chain.unshift(() => resolveTarget(setting, el.ownerDocument))
    }
    firstUsable(chain, take)
  }

  function initialFocus(resolve?: () => HTMLElement | null | undefined | void) {
    if (!focusPending || !shown || !store.get().open || !behavior.movesFocus) {
      return
    }
    focusPending = false
    const plan =
      opener === "initial" && behavior.focusOnMount
        ? ("auto" as const)
        : initialFocusPlan(opener)
    if (plan === "none") {
      return
    }
    const run = () => {
      if (!shown || !store.get().open) {
        return
      }
      const target = plan === "popup" ? shown.el : resolve?.()
      if (!target) {
        return
      }
      moveFocus(target)
      // The target's focus handler can close the popup.
      if (!shown || !store.get().open) {
        return
      }
      const active = activeElement()
      // A target that can't take focus, like a disabled button, would leave
      // focus behind the popup, so the content takes it.
      if (
        !active ||
        (!composedContains(target, active) &&
          !composedContains(shown.el, active))
      ) {
        moveFocus(shown.el)
        return
      }
      selectFilled(target)
    }
    if (openedOnPress) {
      // The pointer can reach an item before the frame, which focuses it.
      requestAnimationFrame(() => {
        const active = activeElement()
        if (!shown || !active || !composedContains(shown.el, active)) {
          run()
        }
      })
    } else {
      run()
    }
  }

  function attach(el: HTMLElement, config: AttachConfig) {
    const cleanups: (() => void)[] = []
    const trigger = options.trigger()
    const host = config.host?.() ?? el
    // Mounted open, like a dialog a menu item opens, focus returns to what
    // had it as the popup mounted, since no open recorded it.
    if (opener === "initial" && !before) {
      const active = activeElement()
      openedFrom(
        active &&
          active !== active.ownerDocument.body &&
          !composedContains(el, active)
          ? active
          : undefined
      )
    }
    el.removeAttribute("hidden")
    host.removeAttribute("hidden")
    // The backdrop goes into the top layer first, so it sits just below the popup.
    const backdrop = shown?.backdrop
    if (backdrop) {
      const stop = showBackdrop(backdrop, config.inline)
      cleanups.push(() => {
        stop()
        hideBackdrop(backdrop)
      })
    }
    if (!config.inline) {
      host.setAttribute("popover", "manual")
      try {
        host.showPopover()
      } catch {}
    }
    if (config.position && options.position) {
      const placement = options.position(
        () => config.anchor?.() ?? options.trigger(),
        el,
        config.position
      )
      place = placement.place
      checkPlacement = placement.follow
      cleanups.push(placement, () => (place = checkPlacement = undefined))
      if (config.rendered) {
        cleanups.push(config.rendered(placement.follow))
      }
    }
    if (!config.inline && !supportsTopLayer() && !host.style.zIndex) {
      host.style.zIndex = "2147483000"
    }
    cleanups.push(
      animateIn(
        el,
        enterPending
          ? () => {
              enterPending = false
              complete(true)
            }
          : undefined
      )
    )
    trackInput()

    let modal = options.modal()
    const blur = behavior.blur
    const persistent = options.persistent?.() ?? []
    // A press on the popup's ::backdrop targets the popup itself, outside its box.
    const pressedBackdrop = (target: Node, event?: Event) =>
      target === el &&
      !!event &&
      "clientX" in event &&
      outsideBox(
        { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY },
        el.getBoundingClientRect()
      )
    // Element neighbours, since a framework's anchor comments beside the trigger,
    // like Svelte's, leave with it. Without a trigger, what had focus stands in.
    // Content that binds again after either is gone keeps the way to where it was.
    const returnsTo =
      returnTrigger() ?? (!trigger && before?.isConnected ? before : undefined)
    if (returnsTo || !trigger) {
      path = []
    }
    for (
      let node: Element | null = returnsTo ?? null;
      node && node !== el.ownerDocument.body;
      node = node.parentElement
    ) {
      path.push({
        node,
        next: node.nextElementSibling,
        previous: node.previousElementSibling,
      })
    }

    const own: Layer = {
      parent: options.parent?.() ?? (trigger && findLayer(trigger)),
      active: () => store.get().open,
      exiting: () => !store.get().open && store.get().mounted,
      modal: modal.consumeOutsidePress,
      blocking:
        typeof behavior.blocking === "function"
          ? behavior.blocking(modal)
          : behavior.blocking,
      outsidePress: behavior.outsidePress,
      shield: behavior.shield,
      component: options.owner?.component,
      id: options.owner?.id,
      el,
      contains: (target, event) =>
        (el.contains(target) && !pressedBackdrop(target, event)) ||
        persistent.some((node) => node.contains(target)) ||
        (options.contains
          ? options.contains(target, event)
          : !!options.trigger()?.contains(target)),
      overBackdrop: (x, y) =>
        !!shown?.backdrop &&
        !outsideBox({ x, y }, shown.backdrop.getBoundingClientRect()) &&
        outsideBox({ x, y }, el.getBoundingClientRect()),
      returnTarget,
      onOutsidePress: (event) => {
        const target = event.composedPath()[0] as Element | undefined
        options.close("outside-press", {
          event,
          focus: outsidePressFocus({
            type: event.type,
            focusable: !!target?.closest?.(focusableSelector),
            consumed: modal.consumeOutsidePress,
          }),
        })
      },
      onEscape: (event) => {
        event.preventDefault()
        if (options.onEscape) {
          options.onEscape(event)
        } else {
          options.close("escape-key", { event, focus: true })
        }
      },
      onBlur:
        blur === "never"
          ? undefined
          : blur === "always"
            ? (event) => options.close("window-blur", { event, focus: false })
            : // A click into an iframe never reaches the page.
              (event) =>
                setTimeout(() => {
                  const active =
                    focusedFrom(el) ?? el.ownerDocument.activeElement
                  if (active?.tagName === "IFRAME" && !el.contains(active)) {
                    options.close("focus-out", { event, focus: false })
                  }
                }),
    }
    layer = own
    layerParts.set(own, [el, ...(backdrop ? [backdrop] : [])])
    cleanups.push(pushLayer(own))
    showsAgain.set(own, {
      inside: (outer) =>
        outer.contains(el) || (!!trigger && outer.contains(trigger)),
      again: () => {
        const focused = activeElement()
        hide()
        for (const part of [host, backdrop]) {
          try {
            part?.hidePopover()
          } catch {}
        }
        show()
        if (focused && focused !== activeElement()) {
          ;(focused as HTMLElement).focus({ preventScroll: true })
        }
      },
    })
    if (modal.inertAndLock) {
      freezing.add(own)
    }
    for (const onShow of [options.onShow, config.onShow]) {
      const cleanup = onShow?.(own)
      if (cleanup) {
        cleanups.push(cleanup)
      }
    }
    let releaseLock: (() => void) | undefined
    let releaseOwnInert: (() => void) | undefined
    let pendingFreeze: (() => void) | undefined
    const freezePage = () => {
      const keep = [
        el,
        ...(shown?.backdrop ? [shown.backdrop] : []),
        ...(persistent as HTMLElement[]),
      ]
      if (trigger && behavior.keepTrigger) {
        keep.push(trigger)
      }
      // The page freezes a paint after opening, so a confirm opened in between
      // is already above this one.
      for (const layer of activeLayers()) {
        if (layer !== own && above(layer, own)) {
          keep.push(...(layerParts.get(layer) ?? []))
        }
      }
      // The lock measures the page, so it goes before the page turns inert,
      // while layout is still clean. After it, that read restyles half the page.
      releaseLock = lockScroll(el.ownerDocument, el)
      const inert = inertOutside(keep)
      own.keep = inert.keep
      releaseInert = releaseOwnInert = inert
    }
    const thawPage = () => {
      pendingFreeze?.()
      releaseOwnInert?.()
      releaseLock?.()
      if (releaseInert === releaseOwnInert) {
        releaseInert = undefined
      }
      releaseOwnInert = releaseLock = own.keep = undefined
    }
    if (modal.inertAndLock) {
      // Both restyle the whole page, which on a phone takes longer than drawing
      // the popup. So they wait until the popup has painted.
      pendingFreeze = afterPaint(() => {
        pendingFreeze = undefined
        if (!store.get().open) {
          return
        }
        const focused = activeElement()
        freezePage()
        // Focus that rested on the page, inert now, moves in.
        if (
          tabMode() === "trap" &&
          focused &&
          !usable(focused as HTMLElement)
        ) {
          focusPending = true
          initialFocus(config.initialFocus)
        }
      })
    }
    remodal = () => {
      const next = options.modal()
      own.modal = next.consumeOutsidePress
      own.blocking =
        typeof behavior.blocking === "function"
          ? behavior.blocking(next)
          : behavior.blocking
      if (next.inertAndLock) {
        freezing.add(own)
      } else {
        freezing.delete(own)
      }
      if (next.inertAndLock && !modal.inertAndLock && store.get().open) {
        freezePage()
      } else if (!next.inertAndLock && modal.inertAndLock) {
        thawPage()
      }
      modal = next
    }
    cleanups.push(thawPage, () => (remodal = undefined))
    // A modal beneath spares this layer when it shows above it, like a confirm
    // opened from code over a dialog, not only when it opened from that modal.
    const beneath = new Set(activeLayers())
    for (let up = own.parent; up; up = up.parent) {
      beneath.add(up)
    }
    beneath.delete(own)
    for (const layer of beneath) {
      if (layer.keep && above(own, layer)) {
        for (const part of [el, ...(backdrop ? [backdrop] : [])]) {
          cleanups.push(layer.keep(part))
        }
      }
    }
    if (tabMode() === "flow" && behavior.dismissOnFocusLoss) {
      let press: MouseEvent | undefined
      cleanups.push(
        on(
          el.ownerDocument,
          "mousedown",
          (event) => {
            press = event
            setTimeout(() => {
              if (press === event) {
                press = undefined
              }
            })
          },
          { capture: true }
        ),
        on(el.ownerDocument, "focusin", (event) => {
          const target = (focusedFrom(el) ?? event.target) as Node
          if (!store.get().open || layerContains(own, target)) {
            return
          }
          if (press && own.contains(target, press)) {
            return
          }
          options.close("focus-out", { event, focus: false })
        })
      )
    }
    cleanups.push(guardFrames(el, () => tabMode() === "trap"))
    if (behavior.closeWatcher) {
      const stop = watchClose((event) =>
        options.close("back", { event, focus: true })
      )
      if (stop) {
        releaseWatcher = stop
        cleanups.push(() => {
          stop()
          if (releaseWatcher === stop) {
            releaseWatcher = undefined
          }
        })
      }
    }
    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement
      const submitter = (event as SubmitEvent)
        .submitter as HTMLButtonElement | null
      const method =
        submitter?.getAttribute("formmethod") ?? form.getAttribute("method")
      if (method?.toLowerCase() !== "dialog" || findLayer(form) !== own) {
        return
      }
      event.preventDefault()
      options.close("close-press", {
        event,
        focus: true,
        returnValue: submitter?.value || undefined,
      })
    }
    el.addEventListener("submit", onSubmit)
    cleanups.push(() => el.removeEventListener("submit", onSubmit))

    // A trapping popup that binds again while open, like when the page a
    // framework kept away comes back, has to hold focus again. Focus left
    // with that page, or rests on what the popup just made inert.
    if (
      store.get().open &&
      !focusPending &&
      tabMode() === "trap" &&
      focusIsLost()
    ) {
      focusPending = true
    }
    // A popup inside this one that showed first, like nested dialogs mounted
    // open in one commit, shows again, so it lands above this one and nests under it.
    for (const other of activeLayers()) {
      const shows = showsAgain.get(other)
      if (other !== own && shows?.inside(el)) {
        shows.again()
      }
    }
    // Children bind in the same commit. Focus once they have.
    queueMicrotask(() => initialFocus(config.initialFocus))

    return () => {
      cleanups.forEach((cleanup) => cleanup())
      if (layer === own) {
        layer = undefined
      }
      // A framework can detach and reattach a live element, like React's
      // StrictMode. Hiding would send focus back to the trigger.
      if (!store.get().mounted && !config.inline) {
        try {
          host.hidePopover()
        } catch {}
      }
    }
  }

  function show() {
    if (!bound || shown) {
      return
    }
    const { el, config } = bound
    shown = { el, cleanup: () => {}, backdrop: config.backdrop?.() }
    shown.cleanup = attach(el, config)
  }

  function showBackdrop(backdrop: HTMLElement, inline = false) {
    backdrop.removeAttribute("hidden")
    if (inline) {
      return animateIn(backdrop)
    }
    backdrop.setAttribute("popover", "manual")
    try {
      backdrop.showPopover()
    } catch {}
    if (!supportsTopLayer() && !backdrop.style.zIndex) {
      backdrop.style.zIndex = "2147483000"
    }
    return animateIn(backdrop)
  }

  function hideBackdrop(backdrop: HTMLElement) {
    if (!store.get().mounted) {
      try {
        backdrop.hidePopover()
      } catch {}
    }
  }

  function hide() {
    if (!shown) {
      return
    }
    const { cleanup } = shown
    shown = undefined
    cleanup()
  }

  // Escape closes the popup before its ancestors hear the key. Tab stays
  // inside a trapping popup, goes back to the page after the trigger from a
  // flowing one, wherever it renders, and closes a menu-like one.
  function keydown(event: KeyboardEvent) {
    if (event.key === "Escape" && layer) {
      return escapeLayer(layer, event)
    }
    const popup = shown?.el
    if (event.key !== "Tab" || !popup) {
      return
    }
    const mode = tabMode()
    if (mode === "native") {
      return
    }
    if (mode === "close") {
      return options.close("focus-out", { event, focus: false })
    }
    const list = tabbables(popup)
    const stops = composedTabbables(popup)
    const first = stops[0]
    const last = stops.at(-1)
    const active = activeElement()
    const atStart = !first || active === first || active === popup
    const atEnd = !last || active === last
    // The browser visits every positive tabindex in the page before the rest,
    // so the trap steps onto and off them itself. Between the others, and into
    // shadow roots, Tab moves natively.
    const ahead = mode === "trap" ? positiveTabStops(list, popup) : []
    if (ahead.length) {
      const order = [...ahead, ...list.filter((el) => !ahead.includes(el))]
      const index = order.indexOf(active as HTMLElement)
      const next =
        active === popup
          ? order.at(event.shiftKey ? -1 : 0)
          : order.at((index + (event.shiftKey ? -1 : 1)) % order.length)
      const crossing =
        ahead.includes(active as HTMLElement) ||
        (!!next && ahead.includes(next))
      const shadow = active?.shadowRoot
      const entersShadow =
        !event.shiftKey && !!shadow && tabbables(shadow).length > 0
      if (active !== popup && (index < 0 || !crossing || entersShadow)) {
        return
      }
      event.preventDefault()
      next?.focus({ preventScroll: true })
      return
    }
    if (mode === "trap") {
      if (event.shiftKey ? atStart : atEnd) {
        event.preventDefault()
        ;((event.shiftKey ? last : first) ?? popup).focus({
          preventScroll: true,
        })
        return
      }
      // WebKit and Firefox skip a radio group whose checked radio is behind
      // the popup, so the trap steps into such a group itself.
      const index = list.indexOf(active as HTMLElement)
      const next =
        index < 0 ? undefined : list[index + (event.shiftKey ? -1 : 1)]
      const group =
        next && !(next as HTMLInputElement).checked ? radioGroup(next) : []
      if (
        group.some((radio) => radio.checked) &&
        !group.includes(active as HTMLInputElement)
      ) {
        event.preventDefault()
        next?.focus({ preventScroll: true })
        return
      }
      // Safari's default Tab moves only between text fields, so from the last
      // one it skips the buttons after it and lands on the body.
      setTimeout(() => {
        const now = activeElement(popup.ownerDocument)
        if (
          shown?.el === popup &&
          !(
            now &&
            (composedContains(popup, now) ||
              (!!layer && layerContains(layer, now)))
          )
        ) {
          ;((event.shiftKey ? last : first) ?? popup).focus({
            preventScroll: true,
          })
        }
      })
      return
    }
    const trigger = options.trigger()
    if (!trigger) {
      return
    }
    if (event.shiftKey && atStart) {
      event.preventDefault()
      trigger.focus({ preventScroll: true })
    } else if (!event.shiftKey && atEnd) {
      const next = nextTabbable(trigger, popup)
      if (!next) {
        return
      }
      event.preventDefault()
      next.focus()
    }
  }

  return {
    // Call from the content slot's `bind`. Content kept mounted binds while
    // closed and shows when the popup opens. Vue sets refs on a client-only
    // mount before the app is in the document, and a disconnected popup can't
    // be shown, so it waits for that.
    bind(el: HTMLElement, config: AttachConfig = {}) {
      let cancelled = false
      const unregister = registerPopupElement(el)
      const start = () => {
        bound = { el, config }
        if (store.get().mounted) {
          // Vue mounts a moved part's new element before the old one lets go.
          if (shown && shown.el !== el) {
            hide()
          }
          show()
        }
      }
      if (el.isConnected) {
        start()
      } else {
        queueMicrotask(() => {
          if (!cancelled && el.isConnected) {
            start()
          }
        })
      }
      return () => {
        cancelled = true
        // Read while the content's props are still there, for a return after it's gone.
        const setting = options.finalFocus?.() ?? "trigger"
        unregister()
        if (bound?.el !== el) {
          return
        }
        bound = undefined
        if (shown?.el === el) {
          // Some frameworks remove the element first, and its focus is on the body by now.
          const active = activeElement()
          const held =
            store.get().open &&
            behavior.movesFocus &&
            (!active ||
              active === el.ownerDocument.body ||
              composedContains(el, active))
          const from = upstream
          hide()
          // Removed from the page while open, like a dialog rendered only
          // while it's open, focus goes back to what opened it. New content
          // in its place keeps it, and what replaced the opener isn't a neighbour.
          if (held) {
            const range = caret
            caret = undefined
            queueMicrotask(() => {
              if (!bound && !el.isConnected && focusIsLost()) {
                returnFocus(el, from, true, range, setting)
              }
            })
          }
        }
      }
    },
    // Call from the content's keydown, for keys from this popup only.
    keydown,
    // Call from the trigger's keydown. Tab from the trigger enters an open
    // flowing popup, even when it renders somewhere else in the document.
    triggerKeydown(event: KeyboardEvent) {
      const popup = shown?.el
      if (
        event.key !== "Tab" ||
        event.shiftKey ||
        !popup ||
        !store.get().open
      ) {
        return
      }
      if (tabMode() !== "flow") {
        return
      }
      event.preventDefault()
      ;(composedTabbables(popup)[0] ?? popup).focus({ preventScroll: true })
    },
    // Call before opening, with how and from what event.
    opening(by: PopupOpener, event?: Event) {
      opener = by
      openedOnPress = event?.type === "pointerdown"
      openedByKey = event?.type === "keydown"
    },
    opener: () => opener,
    // For the popup's control only: hears every open and close first, from any
    // source, and returns why a close happened. A second call replaces the first.
    observe(listener: (open: boolean) => PopupClose<Reason> | undefined) {
      observer = listener
    },
    // Asks the component to close, returning focus, like a sheet swiped away.
    requestClose: (reason: PopupCloseReason, event?: Event) =>
      options.close(reason, { event, focus: true }),
    // Where focus goes on the next close. Reset after every close, and on open.
    returnFocus(mode: ReturnMode) {
      returnMode = mode
    },
    // Runs the component's initial focus now, like when a controller asks an open popup.
    initialFocus,
    // Places the shown popup again now, without animating, like once its size is known.
    place: () => place?.(),
    // Checks the shown popup's placement without starting it over, like when
    // its arrow binds late, so an animation it runs goes on.
    checkPlacement: () => checkPlacement?.(),
    // Applies `modal` again while shown, after it changed, like a sheet
    // crossing the snap point above which it's modal. Focus doesn't move.
    updateModal: () => remodal?.(),
    layer: () => layer,
    element: () => shown?.el,
    // For a component whose state the layer reads through a lens, which
    // derives `mounted` with a controlled `open` itself.
    mountedAs,
    // Call from a backdrop's `bind`. A backdrop that binds after its popup
    // has shown goes into the top layer, and the popup goes back above it.
    // Returns a cleanup.
    backdrop(backdrop: HTMLElement) {
      if (!shown || shown.backdrop === backdrop) {
        return () => {}
      }
      const { el } = shown
      const host = bound?.config.host?.() ?? el
      const inline = !!bound?.config.inline
      shown.backdrop = backdrop
      const stop = showBackdrop(backdrop, inline)
      const active = activeElement()
      if (!inline) {
        try {
          host.hidePopover()
          host.showPopover()
        } catch {}
      }
      // Hiding sends focus back to where it was before. Put it back.
      if (active && active !== activeElement()) {
        active.focus({ preventScroll: true })
      }
      const release = layer?.keep?.(backdrop)
      return () => {
        release?.()
        stop()
        if (shown?.backdrop === backdrop) {
          shown.backdrop = undefined
        }
        hideBackdrop(backdrop)
      }
    },
  }
}

type Popup<Reason extends string = string> = ReturnType<
  typeof createPopupLayer<{ open: boolean; mounted: boolean }, Reason>
>

export {
  type AttachConfig,
  createPopupLayer,
  createPopupController,
  deriveOpen,
  disabledTriggerAttrs,
  firstUsable,
  initialFocusPlan,
  type Modal,
  modalTriple,
  openerOf,
  outsideBox,
  outsidePressFocus,
  type Popup,
  type PopupChangeOptions,
  type PopupClose,
  type PopupCloseReason,
  popupContentAttrs,
  type PopupController,
  type PopupFocusTarget,
  type PopupModal,
  type PopupOpener,
  type PopupOpenOptions,
  type PopupResult,
  popupTriggerAttrs,
  prepareReset,
  resetPopoverStyles,
  type ReturnMode,
}
