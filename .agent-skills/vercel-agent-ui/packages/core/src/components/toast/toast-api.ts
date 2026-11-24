// A toast region's state and behavior: what's on screen, for how long, how
// it's announced and where focus goes. The parts are in `toast-parts.ts`.
import {
  announcePending,
  runAction,
  type ActionDetails,
} from "../../foundation/kernel/action"
import {
  announce,
  prepareAnnouncements,
} from "../../foundation/platform/announce"
import { on } from "../../foundation/kernel/events"
import { applyAttrs } from "../../foundation/kernel/live"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { trackKeyboard } from "../../foundation/platform/keyboard"
import { bindPersistentLayer } from "../../foundation/platform/layers"
import { isRTL } from "../../foundation/platform/env"
import {
  activeElement,
  supportsTopLayer,
} from "../../foundation/platform/platform"
import { resetPopoverStyles } from "../../foundation/popups/popup"
import { animateIn, animateOut } from "../../foundation/motion/presence"
import { createDragSession } from "../../foundation/drag-and-drop/pointer"
import { trackSwipe } from "./swipe"
import { tabbables } from "../../foundation/focus/tabbable"
import { textOf } from "../../foundation/text/typeahead"
import { registerShortcut } from "../../foundation/shortcuts/shortcuts"
import {
  addToastStyles,
  focusAfterClose,
  naturalHeight,
  pressedText,
  stackLayout,
  swipeDirections,
  watchAttention,
  writeHeight,
} from "./toast-dom"
import { createToastTimers, type ToastPauseReason } from "./toast-timers"
import {
  toast as sharedToaster,
  toasterInternals,
  type Toast,
  type ToastDismissReason,
  type Toaster,
} from "./toaster"

import type { ToastButtonState, ToastItem, ToastRegionOptions } from "./toast"
import { log } from "../../foundation/kernel/change"
import { inputSource } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"

const findItem = (items: readonly ToastItem[], id: string) =>
  items.find((item) => item.toast.id === id)
const isExpanded = (state: {
  alwaysExpanded: boolean
  hovered: boolean
  focused: boolean
}) => state.alwaysExpanded || state.hovered || state.focused
// Whether a region has toasts to show, so it's a landmark and its shortcut works.
const hasToasts = (items: readonly ToastItem[]) =>
  items.some((item) => !item.leaving)

// Texts read one after another. One that already ends a sentence gets no
// second stop, which a screen reader would read out.
const sentences = (texts: string[]) =>
  texts.reduce(
    (all, text) =>
      all ? `${all}${/[.!?…。！？]$/u.test(all) ? " " : ". "}${text}` : text,
    ""
  )

// Options only adapters pass.
type ToastRegionInternalOptions = ToastRegionOptions & {
  // Whether the app placed the region, rather than the overlay host rendering it.
  placed?: boolean
  // The region's name, from the `aria-label` the app gives the region.
  label?: string
}

const initialToastState = (options: ToastRegionInternalOptions) => ({
  items: [] as readonly ToastItem[],
  toaster: (options.toaster ?? sharedToaster) as Toaster,
  side: options.side ?? "bottom",
  align: options.align ?? "end",
  maxVisible: options.maxVisible ?? 3,
  alwaysExpanded: !!options.expanded,
  shortcut: options.shortcut === undefined ? "F6" : options.shortcut,
  label: options.label,
  hovered: false,
  focused: false,
  // Pending and failed actions and close buttons, by part key.
  buttons: {} as Readonly<Record<string, ToastButtonState>>,
})

const syncToastState = (options: ToastRegionInternalOptions) => ({
  toaster: (options.toaster ?? sharedToaster) as Toaster,
  side: options.side ?? "bottom",
  align: options.align ?? "end",
  maxVisible: options.maxVisible ?? 3,
  alwaysExpanded: !!options.expanded,
  shortcut: options.shortcut === undefined ? "F6" : options.shortcut,
  label: options.label,
})

/** What a toast region holds. */
type ToastRegionStoreState = ReturnType<typeof initialToastState>

function toastRegionApiBody(
  context: PrimitiveContext<
    ToastRegionInternalOptions,
    ToastRegionStoreState,
    string
  >
) {
  const { store, options, onDestroy, element } = context
  const drags = createDragSession(onDestroy)
  const changeSource = inputSource()
  // The toaster can change, like a web component's property set after it connects.
  const toaster = () => store.get().toaster
  const internal = options() as ToastRegionInternalOptions
  const timers = createToastTimers((toastId) => close(toastId, "timeout"))
  // Which update of each toast was announced, and toasts waiting to be.
  const announced = new Map<string, number>()
  const toAnnounce = new Set<string>()
  let announceTimer: ReturnType<typeof setTimeout> | undefined
  // When the first toast still waiting to be read arrived.
  let waitingSince: number | undefined
  // Exit animations running, by toast id.
  const exits = new Map<string, () => void>()
  // Natural heights, measured while a toast is in front or the stack is expanded.
  const heights = new Map<string, number>()
  // Toasts held open by a pending action.
  const held = new Set<string>()
  // The toast of each button with a pending or failed state, by part key.
  const buttonToasts = new Map<string, string>()
  // Where focus was before it came into the region, to go back to.
  let returnTarget: HTMLElement | null = null
  let enteredByShortcut = false

  const close = (toastId: string, reason: ToastDismissReason, event?: Event) =>
    toasterInternals(toaster()).close(toastId, reason, event)

  const anyPending = () => {
    const { buttons } = store.get()
    for (const key in buttons) {
      if (buttons[key].pending) {
        return true
      }
    }
    return false
  }
  announcePending(context, anyPending)

  function refresh() {
    const { items: previous, maxVisible } = store.get()
    const queued = toaster().toasts()
    const visible = queued.slice(0, Math.max(0, maxVisible))
    const shown = new Set(visible.map((toast) => toast.id))
    // Toasts that were on screen and no longer are animate out where they were.
    const leaving = previous
      .filter((item) => !shown.has(item.toast.id))
      .map((item) => (item.leaving ? item : { ...item, leaving: true }))
    const items = [
      ...visible.map((toast, index) => ({ toast, index, leaving: false })),
      ...leaving,
    ].sort((a, b) => b.toast.order - a.toast.order)
    store.set({ items })
    updateTimers()
    for (const toast of visible) {
      if (announced.get(toast.id) === toast.version) {
        continue
      }
      announced.set(toast.id, toast.version)
      toAnnounce.add(toast.id)
    }
    const ids = new Set(queued.map((toast) => toast.id))
    for (const toastId of announced.keys()) {
      if (!ids.has(toastId)) {
        announced.delete(toastId)
      }
    }
    if (toAnnounce.size) {
      scheduleAnnouncement()
    }
  }

  function updateTimers() {
    const visible = store.get().items.filter((item) => !item.leaving)
    timers.update(
      visible.map(({ toast }) => ({
        id: toast.id,
        version: toast.version,
        duration: toast.duration,
        held: held.has(toast.id),
      })),
      new Set(
        toaster()
          .toasts()
          .map((toast) => toast.id)
      )
    )
  }

  // What a screen reader hears for a toast: its title and description as
  // rendered, so content that isn't a string is read too.
  function textFor(toast: Toast) {
    const parts = [
      element("title", toast.id),
      element("description", toast.id),
    ].filter((el): el is HTMLElement => !!el && !el.hidden)
    if (parts.length) {
      return sentences(parts.map((el) => textOf(el).trim()).filter(Boolean))
    }
    const root = element("root", toast.id)
    if (root) {
      return textOf(root).trim()
    }
    return sentences(
      [toast.title, toast.description].filter(
        (text): text is string => typeof text === "string"
      )
    )
  }

  // Toasts that arrive close together are read together: each one waits a
  // little for the next, up to a limit, so a burst is one announcement and
  // the first is never replaced before it's read.
  function scheduleAnnouncement() {
    const now = Date.now()
    waitingSince ??= now
    clearTimeout(announceTimer)
    announceTimer = setTimeout(
      flushAnnouncements,
      Math.max(0, Math.min(100, waitingSince + 400 - now))
    )
  }

  // Toasts that arrive together are read together, each priority once.
  function flushAnnouncements() {
    announceTimer = undefined
    waitingSince = undefined
    const texts = { polite: [] as string[], assertive: [] as string[] }
    for (const item of store.get().items) {
      if (item.leaving || !toAnnounce.has(item.toast.id)) {
        continue
      }
      const text = textFor(item.toast)
      if (text) {
        texts[item.toast.priority].push(text)
      }
    }
    toAnnounce.clear()
    for (const priority of ["assertive", "polite"] as const) {
      if (texts[priority].length) {
        announce(sentences(texts[priority]), { priority })
      }
    }
  }

  function finish(toastId: string) {
    exits.delete(toastId)
    const { items } = store.get()
    if (items.some((item) => item.leaving && item.toast.id === toastId)) {
      store.set({
        items: items.filter(
          (item) => !(item.leaving && item.toast.id === toastId)
        ),
      })
    }
    if (!findItem(store.get().items, toastId)) {
      dropButtons(toastId)
    }
  }

  // Starts and cancels exit animations as toasts leave and come back.
  function syncPresence() {
    for (const item of store.get().items) {
      const toastId = item.toast.id
      const running = exits.get(toastId)
      if (!item.leaving) {
        if (running) {
          running()
          exits.delete(toastId)
        }
        continue
      }
      if (running) {
        continue
      }
      const el = element("root", toastId)
      if (!el) {
        exits.set(toastId, () => {})
        queueMicrotask(() => finish(toastId))
        continue
      }
      if (el.contains(activeElement(el.ownerDocument))) {
        moveFocusFrom(el)
      }
      exits.set(
        toastId,
        animateOut(el, () => finish(toastId))
      )
    }
    layout()
  }

  // Focus never falls to the page when the focused toast closes.
  function moveFocusFrom(closing: HTMLElement) {
    const { items } = store.get()
    const open = elements(context, "root")
      .filter(({ el, key }) => el === closing || !findItem(items, key)?.leaving)
      .map(({ el }) => el)
    const fallback = returnTarget?.isConnected ? returnTarget : undefined
    focusAfterClose(open, closing, fallback)?.focus({ preventScroll: true })
  }

  function layout() {
    const region = element("region")
    if (!region) {
      return
    }
    const { items } = store.get()
    const stack = stackLayout(
      items.map((item) => ({
        id: item.toast.id,
        index: item.index,
        leaving: item.leaving,
      })),
      heights
    )
    // Kept until a new front toast is measured, so the toasts behind it don't collapse for a frame.
    if (stack.front !== undefined) {
      writeHeight(region, "--toast-front-height", stack.front)
    }
    writeHeight(region, "--toast-stack-height", stack.total)
    region.style.setProperty("--toast-count", String(stack.layout.size))
    for (const [toastId, place] of stack.layout) {
      const el = element("root", toastId)
      if (!el) {
        continue
      }
      el.style.setProperty("--toast-index", String(place.index))
      writeHeight(el, "--toast-offset", place.offset)
      const height = heights.get(toastId)
      if (height !== undefined) {
        writeHeight(el, "--toast-height", height)
      }
    }
  }

  // Sets or clears a button's pending or failed state. Keys are per mount, so
  // an entry goes once its press succeeds or its toast has left.
  function setButton(
    key: string,
    toastId: string,
    next: ToastButtonState | undefined
  ) {
    const buttons = { ...store.get().buttons }
    if (next) {
      buttons[key] = next
      buttonToasts.set(key, toastId)
    } else {
      delete buttons[key]
      buttonToasts.delete(key)
    }
    store.set({ buttons })
  }

  function dropButtons(toastId: string) {
    const keys = [...buttonToasts]
      .filter(([, id]) => id === toastId)
      .map(([key]) => key)
    if (!keys.length) {
      return
    }
    const buttons = { ...store.get().buttons }
    for (const key of keys) {
      delete buttons[key]
      buttonToasts.delete(key)
    }
    store.set({ buttons })
  }

  function setHeld(toastId: string, pending: boolean) {
    if (pending) {
      held.add(toastId)
    } else {
      held.delete(toastId)
    }
    updateTimers()
  }

  // Moves focus to the newest toast, or back where it was when it's already in the region.
  function focus() {
    const region = element("region")
    if (!region) {
      return false
    }
    const active = activeElement(region.ownerDocument)
    if (active && region.contains(active)) {
      returnFocus()
      return true
    }
    const first = elements(context, "root").find(
      ({ key }) => !findItem(store.get().items, key)?.leaving
    )
    if (!first) {
      return false
    }
    returnTarget = active
    enteredByShortcut = true
    first.el.focus({ preventScroll: true })
    return true
  }

  function returnFocus() {
    enteredByShortcut = false
    if (returnTarget?.isConnected) {
      returnTarget.focus({ preventScroll: true })
    }
  }

  const pause = (reason: ToastPauseReason) => timers.pause(reason)
  const resume = (reason: ToastPauseReason) => timers.resume(reason)

  function bindRegion(el: HTMLElement) {
    const doc = el.ownerDocument
    resetPopoverStyles(doc, ['[data-slot="toast-region"]'])
    // The live regions exist before the first toast, so it's read.
    prepareAnnouncements(doc)
    addToastStyles(doc)
    // The top layer, so it shows above modal dialogs too. Vue binds before
    // the element is in the document, which can't show it yet.
    const show = () => {
      if (!el.isConnected) {
        return requestAnimationFrame(show)
      }
      try {
        el.showPopover()
      } catch {}
    }
    if (supportsTopLayer()) {
      el.setAttribute("popover", "manual")
      show()
    }
    const cleanups = [
      connect(),
      bindPersistentLayer(el),
      trackKeyboard(el),
      // The user's attention: each kind pauses the timers on its own.
      watchAttention(el, {
        hover: (hovered) => {
          store.set({ hovered })
          if (hovered) {
            pause("item-hover")
          } else {
            resume("item-hover")
          }
        },
        focus: (focused, from) => {
          if (focused && !store.get().focused && from) {
            returnTarget = from
          }
          if (!focused) {
            enteredByShortcut = false
          }
          store.set({ focused })
          if (focused) {
            pause("focus-in")
          } else {
            resume("focus-in")
          }
        },
        away: (reason, away) => (away ? pause(reason) : resume(reason)),
      }),
    ]

    // The shortcut, registered only while there is one, and again when it changes.
    let shortcut: string | null = null
    let unregister = () => {}
    const syncShortcut = () => {
      const next = store.get().shortcut || null
      if (next === shortcut) {
        return
      }
      unregister()
      shortcut = next
      unregister = next
        ? registerShortcut(next, () => focus(), {
            layer: el,
            // A function key, like F6, types nothing, so it works from text fields too.
            allowInInput: /^F\d+$/i.test(next),
            when: () => hasToasts(store.get().items),
            description: "Move focus to notifications",
          })
        : () => {}
    }
    syncShortcut()
    cleanups.push(store.subscribe(syncShortcut), () => unregister())
    layout()
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      for (const reason of [
        "item-hover",
        "focus-in",
        "window-blur",
        "page-hide",
      ]) {
        resume(reason)
      }
      // Not hidden here: StrictMode binds the same element again, and a
      // removed element leaves the top layer by itself.
      store.set({ hovered: false, focused: false })
    }
  }

  // Leaving the stack by Tab after the shortcut brought focus in goes back where it was.
  function regionKeydown(event: KeyboardEvent, region: HTMLElement) {
    if (event.key !== "Tab" || !enteredByShortcut) {
      return
    }
    const stops = tabbables(region)
    const edge = event.shiftKey ? stops[0] : stops.at(-1)
    if (event.target !== edge || !returnTarget?.isConnected) {
      return
    }
    event.preventDefault()
    returnFocus()
  }

  // Links a toast to its title and description, once each is rendered and shown.
  function label(toastId: string) {
    const root = element("root", toastId)
    if (!root) {
      return
    }
    const shown = (slot: "title" | "description") => {
      const el = element(slot, toastId)
      return el && !el.hidden ? el.id : undefined
    }
    applyAttrs(
      root,
      {
        "aria-labelledby": shown("title"),
        "aria-describedby": shown("description"),
      },
      "toast-labels"
    )
  }

  function bindToast(el: HTMLElement, toastId: string) {
    const item = findItem(store.get().items, toastId)
    const cleanups = [item?.leaving ? () => {} : animateIn(el)]
    label(toastId)
    let bound = true
    let box: string | undefined
    let waiting = false
    const measure = () => {
      const current = findItem(store.get().items, toastId)
      if (!bound || waiting || !current || current.leaving || !el.isConnected) {
        return
      }
      // Measuring sets the height to auto for a moment, which would cut a height transition short.
      const resizing = el
        .getAnimations()
        .filter(
          (animation) =>
            "transitionProperty" in animation &&
            animation.transitionProperty === "height"
        )
      if (resizing.length) {
        waiting = true
        Promise.allSettled(
          resizing.map((animation) => animation.finished)
        ).then(() => {
          waiting = false
          measure()
        })
        return
      }
      const height = naturalHeight(el)
      if (heights.get(toastId) === height) {
        return
      }
      heights.set(toastId, height)
      layout()
    }
    // The toast's own height is the stack's, so its width, its padding and its children's sizes tell
    // when the content reflows: a shadow root, a loaded image or a font.
    const resizes = new ResizeObserver((entries) => {
      let changed = false
      for (const entry of entries) {
        if (entry.target !== el) {
          changed = true
        } else {
          const border = entry.borderBoxSize?.[0]
          const next = `${border?.inlineSize} ${(border?.blockSize ?? 0) - (entry.contentBoxSize?.[0]?.blockSize ?? 0)}`
          if (next !== box) {
            changed = true
          }
          box = next
        }
      }
      if (changed) {
        measure()
      }
    })
    const observeChildren = () => {
      for (const child of el.children) {
        resizes.observe(child, { box: "border-box" })
      }
    }
    // Content changes, and classes on the toast. The stack's own attributes and variables on it aren't.
    const mutations = new MutationObserver((records) => {
      if (
        !records.some(
          (record) => record.type !== "attributes" || record.target === el
        )
      ) {
        return
      }
      observeChildren()
      measure()
    })
    resizes.observe(el)
    observeChildren()
    mutations.observe(el, {
      subtree: true,
      childList: true,
      characterData: true,
      attributeFilter: ["class"],
    })
    measure()
    cleanups.push(
      () => {
        bound = false
        resizes.disconnect()
        mutations.disconnect()
      },
      on(el, "pointerdown", (event) => startSwipe(el, toastId, event))
    )
    layout()
    return () => cleanups.forEach((cleanup) => cleanup())
  }

  function startSwipe(el: HTMLElement, toastId: string, down: PointerEvent) {
    const toast = findItem(store.get().items, toastId)?.toast
    if (!drags.accepts(down) || !toast || toast.dismissible === false) {
      return
    }
    const target = down.target as Element | null
    if (
      target?.closest(
        "input, textarea, select, [contenteditable]:not([contenteditable='false'])"
      )
    ) {
      return
    }
    const { side, align } = store.get()
    const directions = swipeDirections(side, align, isRTL(el))
    // A mouse drag that starts on selectable text selects it.
    if (down.pointerType === "mouse" && pressedText(down)) {
      return
    }
    trackSwipe(drags, el, down, directions, {
      onStart: () => {
        el.ownerDocument.getSelection()?.removeAllRanges()
        el.setAttribute("data-swiping", "")
        pause("swipe")
      },
      onMove: ({ x, y }) => {
        el.style.setProperty("--toast-swipe-x", `${x}px`)
        el.style.setProperty("--toast-swipe-y", `${y}px`)
      },
      onEnd: (direction, event) => {
        el.removeAttribute("data-swiping")
        resume("swipe")
        if (direction && close(toastId, "swipe", event)) {
          el.setAttribute("data-swipe-direction", direction)
          return
        }
        el.style.removeProperty("--toast-swipe-x")
        el.style.removeProperty("--toast-swipe-y")
      },
    })
  }

  // Runs an action or close button's handler. A returned Promise marks it
  // pending and holds the toast open until it settles.
  function press(
    key: string,
    toastId: string,
    handler:
      | ((event: Event | undefined, details: ActionDetails) => unknown)
      | undefined,
    dismiss: boolean,
    reason: "action" | "close-press",
    event?: Event
  ) {
    if (store.get().buttons[key]?.pending) {
      return
    }
    const source = changeSource(reason, event)
    runAction((details) => handler?.(event, details), source, {
      pending: (pending) => {
        setButton(key, toastId, { pending })
        setHeld(toastId, pending)
        log(context, "pending", pending, { reason, source })
      },
      done: () => {
        if (store.get().buttons[key]) {
          setButton(key, toastId, undefined)
        }
        if (dismiss) {
          close(toastId, reason, event)
        }
      },
      failed: (error) => {
        setButton(key, toastId, { pending: false, error })
        log(context, "error", error, { reason, source })
      },
    })
  }

  // The region follows its toaster only while it's on the page, from the
  // region element's bind. A framework may create an instance and drop it
  // unmounted, like React's StrictMode, and that one must never run timers.
  let connections = 0
  let disconnect = () => {}
  timers.pause("detached")
  function follow(followed: Toaster) {
    const unsubscribe = followed.subscribe(refresh)
    const release = toasterInternals(followed).attachRegion(
      internal.placed ?? true
    )
    return () => {
      unsubscribe()
      release()
    }
  }
  function connect() {
    if (connections++ === 0) {
      let followed = toaster()
      let unfollow = follow(followed)
      let maxVisible = store.get().maxVisible
      const offStore = store.subscribe(() => {
        const { maxVisible: nextMax, toaster: next } = store.get()
        if (next !== followed || nextMax !== maxVisible) {
          if (next !== followed) {
            unfollow()
            unfollow = follow((followed = next))
          }
          maxVisible = nextMax
          refresh()
        }
        syncPresence()
      })
      disconnect = () => {
        unfollow()
        offStore()
      }
      refresh()
      resume("detached")
    }
    let connected = true
    return () => {
      if (!connected) {
        return
      }
      connected = false
      if (--connections > 0) {
        return
      }
      disconnect()
      pause("detached")
    }
  }
  onDestroy(() => {
    disconnect()
    timers.destroy()
    clearTimeout(announceTimer)
    exits.forEach((stop) => stop())
  })

  return {
    /** Moves focus to the newest toast, or back where it was when focus is already in the region. Returns whether it moved. */
    focus,
    /** Pauses every timer in the region for a reason, until `resume(reason)`. Other reasons keep their own hold. */
    pause,
    /** Clears one pause reason. Timers run again once no reason is left. */
    resume,
    internal: {
      bindRegion,
      bindToast,
      regionKeydown,
      label,
      press,
      close,
      toaster,
      // Follows the toaster while the region is on the page. Headless tests call it without an element.
      connect,
    },
  }
}

const toastRegionApi: (
  ...args: Parameters<typeof toastRegionApiBody>
) => ToastRegionApi = toastRegionApiBody

/** What a toast region's instance can do. */
interface ToastRegionApi extends ReturnType<typeof toastRegionApiBody> {}

export {
  findItem,
  hasToasts,
  initialToastState,
  isExpanded,
  syncToastState,
  type ToastRegionApi,
  toastRegionApi,
  type ToastRegionInternalOptions,
  type ToastRegionStoreState,
}
