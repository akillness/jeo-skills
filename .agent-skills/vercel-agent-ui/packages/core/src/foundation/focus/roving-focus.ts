// The roving tab stop: one tab stop for a slot's parts, kept in the
// primitive's own state so parts render it, with arrow keys between them.
// Tabs, Radio Group, Toggle Group, Toolbar, Menubar and Carousel run on it,
// the same block a component of your own uses.
import { afterBind } from "../kernel/after-bind"
import { moveIndex, rovingStop, stepFor } from "./collection"
import type { Part, PrimitiveContext } from "../kernel/primitive-types"
import { isRTL } from "../platform/env"
import { createOrder } from "../kernel/order"
import { onProps } from "../kernel/part"

/**
 * An item of a roving group, as the group's callbacks see it.
 * @stable
 */
type RovingFocusItem<Props = any> = {
  /** The part's key: its `id`, else its `value`. */
  key: string
  /** The props of the part's newest render. */
  props: Props
}

/**
 * Which arrows move focus in a roving group: Up and Down, or Left and Right.
 * @stable
 */
type RovingOrientation = "horizontal" | "vertical"

/**
 * What a custom `move` gets besides the event.
 * @stable
 */
type RovingFocusMoveContext<Props = any> = {
  /** The item focus is on. */
  from: RovingFocusItem<Props> & { el: HTMLElement }
  /** The items that can take focus now, in document order. */
  items: readonly (RovingFocusItem<Props> & { el: HTMLElement })[]
  /** Whether the item is laid out right to left, so Left and Right swap. */
  rtl: boolean
}

/**
 * How a roving group decides its tab stop and moves focus.
 * @stable
 */
type RovingFocusOptions<State extends object, Props = any> = {
  /** The slot whose parts are the group's items. Each joins in the slot's `bind` with `roving.bind(el, part)`. */
  slot: string
  /** The state key that holds the key of the item with the tab stop. Start it at `null`, and set it back to `null` to forget the item focused last. */
  key: keyof State & string
  /** Which arrows move focus when there's no `move`: Up and Down, Left and Right, or `"both"` for all four, like a rating. Defaults to `"vertical"`. */
  orientation?: () => RovingOrientation | "both"
  /** Whether moving past either end wraps around. Defaults to `false`. */
  loop?: () => boolean
  /** Whether the item focused last keeps the stop, like a toolbar, rather than the preferred one, like tabs. Defaults to `true`. */
  remember?: boolean
  /** Whether an item can't be activated. Enabled items take the stop first; disabled ones can still take focus. */
  disabled?: (item: RovingFocusItem<Props>) => boolean
  /** Whether an item can take focus now. An item that can't stays in the group and is skipped, like a tree item under a collapsed branch. Defaults to every item. */
  focusable?: (item: RovingFocusItem<Props>) => boolean
  /** Whether an item takes the stop before focus has been in the group: the selected tab, the checked radio. */
  preferred?: (item: RovingFocusItem<Props>) => boolean
  /**
   * Whether an item rendering before any item binds, like on the server, may
   * hold the stop. The first such item does, so server markup has exactly one
   * stop. Defaults to enabled and focusable items. Pass it when the stop
   * should start on a selected item, like
   * `(state, item) => state.value === null || item.key === state.value`.
   */
  claims?: (state: State, item: RovingFocusItem<Props>) => boolean
  /**
   * The key focus moves to for a key press, or `undefined` to leave the press
   * alone. Replaces the default, which moves along `orientation` with the
   * arrows, Home and End. Use it for any other shape: a tree's visible order,
   * or a grid's rows. Shift is never swallowed, so a list can extend a range.
   * The key may be one that isn't rendered or focusable yet, like the first
   * day of next month in a calendar: the stop moves to it at once, and focus
   * follows when its item can take it, as long as focus is still where the
   * press left it.
   */
  move?: (
    event: KeyboardEvent,
    context: RovingFocusMoveContext<Props>
  ) => string | undefined
  /** Runs once after items join or leave, however many did, once the stop has moved to where the rules put it. */
  onItemsChange?: () => void
}

// Whether an item rendering before any has bound, like on the server, holds
// the tab stop: the first one its group calls eligible does, and keeps it
// until the real stop is known, so the markup has exactly one.
function createClaim() {
  let claimed: string | undefined
  return (key: string, eligible: boolean) => {
    if (claimed === undefined && eligible) {
      claimed = key
    }
    return claimed === key
  }
}

/**
 * One tab stop for a slot's parts, and arrow keys between them, as the
 * WAI-ARIA practices ask of toolbars, listboxes, trees and grids. Call it once
 * in `api`, keep it on the api for the slots, and wire the item slot:
 *
 * ```ts
 * item: slot({
 *   selects: selects({ focused: ({ key }) => [key, null] }),
 *   attrs: (state, part) => ({ tabindex: part.api.roving.tabIndex(state, part) }),
 *   on: { keydown: (event, { el, api }) => api.roving.keydown(event, el!) },
 *   bind: (el, part) => part.api.roving.bind(el, part),
 * })
 * ```
 *
 * The stop lives in state under `key`, so it renders on the server and
 * hydrates: before items bind, the first item `claims` allows holds it. Once
 * they bind, the stop goes to the item focused last (with `remember`), else
 * the first preferred enabled item, else the first enabled one.
 * @stable
 */
function createRovingFocus<State extends object, Props = any>(
  context: Pick<PrimitiveContext<any, State, any>, "store" | "onDestroy">,
  options: RovingFocusOptions<State, Props>
) {
  const { store } = context
  const key = options.key
  const remember = options.remember ?? true
  // Bound items in document order, sorted once and again only after one
  // joins, leaves or moves, so a key press never sorts every item.
  const order = createOrder<{
    key: string
    el: HTMLElement
    part: RovingFocusItem<Props>
  }>()
  const claim = createClaim()
  // The item focus was on last, which a group that remembers keeps the stop on.
  let remembered: string | null = null
  // Set while the group moves its own stop. The key set to null by anyone
  // else starts the group over, like a date picker opening on its value.
  let moving = false
  const setStop = (itemKey: string | null) => {
    moving = true
    store.set({ [key]: itemKey } as Partial<State>)
    moving = false
  }
  // An item focus is moving to that hasn't bound yet, and the element focus
  // left, so focus only follows if nothing else took it in between.
  let pending: { key: string; from: Element | null; left?: boolean } | null =
    null
  // The item element that has focus, which keeps it until it blurs.
  let holder: HTMLElement | null = null

  const orientation = () => options.orientation?.() ?? "vertical"
  const isDisabled = (item: RovingFocusItem<Props>) =>
    options.disabled?.(item) ?? false
  const isFocusable = (item: RovingFocusItem<Props>) =>
    options.focusable?.(item) ?? true
  const isPreferred = (item: RovingFocusItem<Props>) =>
    options.preferred?.(item) ?? false

  // Where the group's rules put the stop, with `preferred` deciding which
  // items are preferred, or undefined while they can't decide it.
  function stopFor(preferred = isPreferred) {
    const list = order.list()
    if (!list.length) {
      return
    }
    // The stop already sits on an item about to render; the items bound now don't decide it.
    if (
      pending &&
      !list.some(({ part }) => part.key === pending!.key && isFocusable(part))
    ) {
      return
    }
    const candidates = list.map(({ part }) => ({
      key: part.key,
      disabled: isDisabled(part),
      focusable: isFocusable(part),
      preferred: preferred(part),
    }))
    return rovingStop(candidates, remembered)
  }

  // Moves the stop to where the group's rules put it now.
  function check() {
    const stop = stopFor()
    if (stop !== undefined) {
      setStop(stop)
    }
  }

  // A change that can move the stop, like a selection or a branch expanding, checks it once.
  let queued = false
  let joined = false
  function queue(joinedOrLeft: boolean) {
    joined ||= joinedOrLeft
    if (queued) {
      return
    }
    queued = true
    afterBind(() => {
      queued = false
      check()
      focusPending()
      if (joined) {
        options.onItemsChange?.()
      }
      joined = false
    })
  }

  // Moves the stop to an item that hasn't bound yet, or can't take focus yet,
  // and focus with it once it can. Frameworks render a key press's update
  // before the next task, so an item that can't by then never will, and the
  // group's rules take over.
  function moveTo(itemKey: string, from: Element | null) {
    const move = (pending = { key: itemKey, from })
    const before = remembered
    if (remember) {
      remembered = itemKey
    }
    setStop(itemKey)
    setTimeout(() => {
      // An item the framework kept, which only now renders its tabindex, takes focus here.
      focusPending()
      if (pending !== move) {
        return
      }
      pending = null
      if (remembered === itemKey) {
        remembered = before
      }
      queue(false)
    })
  }

  // Focuses an item's element, and says whether it took focus: one whose
  // state just made it focusable may not render its tabindex yet.
  const focusOn = (el: HTMLElement) => {
    el.focus()
    return el.ownerDocument.activeElement === el
  }

  // Focuses the item a move was waiting for, once it can take focus.
  function focusPending() {
    if (!pending) {
      return
    }
    const item = order.list().find(({ part }) => part.key === pending!.key)
    if (!item || !isFocusable(item.part)) {
      return
    }
    const active = item.el.ownerDocument.activeElement
    // The element focus left is often gone, like last month's day, which drops focus to the body.
    const untouched =
      active === pending.from ||
      active === null ||
      active === item.el.ownerDocument.body
    if (!untouched || focusOn(item.el)) {
      pending = null
    }
  }
  // Any change but a stop move, which only the group makes, can move the stop.
  let stop = store.get()[key]
  context.onDestroy(
    store.subscribe(() => {
      const was = stop
      stop = store.get()[key]
      if (stop === null && was !== null && !moving) {
        remembered = null
      }
      if (stop === was && order.size()) {
        queue(false)
      }
    })
  )

  // The items that can take focus now, in document order.
  function focusables() {
    return order
      .list()
      .filter(({ part }) => isFocusable(part))
      .map(({ part, el }) => ({ key: part.key, props: part.props, el }))
  }

  const roving = {
    /** Joins a bound part to the group. Call it from the item slot's `bind` and return its cleanup. */
    bind(el: HTMLElement, part: RovingFocusItem<Props>) {
      const leave = order.add({ key: part.key, el, part })
      // The same element joining again under a new key, like an item whose
      // value changed while it had focus, keeps the stop it had and takes focus back.
      if (pending?.left && pending.from === el) {
        const was = pending.key
        pending.key = part.key
        if (remembered === was) {
          remembered = part.key
        }
        if (store.get()[key] === was) {
          setStop(part.key)
        }
        if (el.ownerDocument.activeElement === el) {
          holder = el
        }
      }
      const focused = () => {
        holder = el
        if (remember) {
          roving.remember(part.key)
        }
      }
      const blurred = () => {
        if (holder === el) {
          holder = null
        }
      }
      el.addEventListener("focus", focused)
      el.addEventListener("blur", blurred)
      // An item disabled, enabled or preferred after it joined, like a radio
      // a field around it disables, can move the stop. An item that joins with
      // its part hears each render; one joined with plain data never does.
      let wasDisabled = isDisabled(part)
      let wasPreferred = isPreferred(part)
      const unwatch = onProps(part as Part, () => {
        if (
          isDisabled(part) === wasDisabled &&
          isPreferred(part) === wasPreferred
        ) {
          return
        }
        wasDisabled = isDisabled(part)
        wasPreferred = isPreferred(part)
        queue(false)
      })
      queue(true)
      return () => {
        unwatch()
        el.removeEventListener("focus", focused)
        el.removeEventListener("blur", blurred)
        // An element removed with focus fires no blur, and focus drops to the body.
        const doc = el.ownerDocument
        const had =
          !!doc &&
          (doc.activeElement === el ||
            (holder === el && doc.activeElement === doc.body))
        if (holder === el) {
          holder = null
        }
        leave()
        // The item with the stop may render again as a new element, like a
        // card an undo moves to another column: focus follows it there if it
        // binds by the next task, unless a move already sends focus elsewhere.
        if (had && !pending && store.get()[key] === part.key) {
          const wait = (pending = { key: part.key, from: el, left: true })
          setTimeout(() => {
            if (pending !== wait) {
              return
            }
            pending = null
            queue(false)
          })
        }
        queue(true)
      }
    },
    /** The item's `tabindex`: `"0"` for the item with the stop, `"-1"` for the rest. Pure, so `attrs` can call it. */
    tabIndex(state: State, part: RovingFocusItem<Props>) {
      const stop = (state[key] as string | null | undefined) ?? null
      if (stop !== null) {
        return stop === part.key ? "0" : "-1"
      }
      const eligible = options.claims
        ? options.claims(state, part)
        : !isDisabled(part) && isFocusable(part)
      return claim(part.key, eligible) ? "0" : "-1"
    },
    /**
     * Moves focus for a key pressed on an item's element. Returns the key it
     * moved to, the key it moved from and whether Shift was held, so the
     * caller can extend a selection, or `undefined` when the key isn't the
     * group's. At either end without `loop`, `key` is `from`.
     */
    keydown(event: KeyboardEvent, el: HTMLElement) {
      if (event.defaultPrevented || event.altKey) {
        return
      }
      const list = focusables()
      const from = list.find((item) => item.el === el)
      if (!from) {
        return
      }
      const rtl = isRTL(el)
      let to: string | undefined
      if (options.move) {
        to = options.move(event, { from, items: list, rtl })
      } else if (!event.ctrlKey && !event.metaKey) {
        const step = stepFor(event.key, orientation(), rtl)
        if (step !== undefined) {
          to =
            list[
              moveIndex(
                list.indexOf(from),
                step,
                list.length,
                options.loop?.() ?? false
              )
            ]?.key
        }
      }
      if (to === undefined) {
        return
      }
      event.preventDefault()
      const next = list.find((item) => item.key === to)
      // A key no item can take focus for yet, like next month's day, renders before it does.
      if (!next || (next !== from && !focusOn(next.el))) {
        moveTo(to, el)
      }
      return { key: to, from: from.key, shift: event.shiftKey }
    },
    /** The items that can take focus now, in document order, with their elements. */
    items: focusables,
    /**
     * Focuses an item, or the one with the stop, or the first. An item that
     * isn't rendered or focusable yet takes the stop now and focus once it can.
     */
    focus(itemKey?: string) {
      if (itemKey !== undefined) {
        const item = order.list().find(({ part }) => part.key === itemKey)
        if (item && isFocusable(item.part) && focusOn(item.el)) {
          return
        }
        moveTo(
          itemKey,
          typeof document === "undefined" ? null : document.activeElement
        )
        return
      }
      const list = order.list()
      ;(list.find((item) => item.key === stop) ?? list[0])?.el.focus()
    },
    /**
     * Moves the stop to an item as if focus had landed on it, for an item
     * whose focus went elsewhere, like a menubar trigger whose menu took it.
     * A group that doesn't `remember` ignores it, since its stop follows the
     * preferred item.
     */
    remember(itemKey: string) {
      if (!remember) {
        return
      }
      remembered = itemKey
      setStop(itemKey)
    },
    /** Moves the stop to where the group's rules put it now. It also runs on its own after items join or leave and after state changes. */
    check,
    /**
     * Where the group's rules would put the stop if `preferred` said which
     * items are preferred, like the tab a value from options selects, without
     * moving it. Undefined while the bound items can't decide it, like when
     * none is preferred yet: the item may be about to bind, as when its value
     * changed, and the group decides once it has.
     */
    stopFor: (preferred: (item: RovingFocusItem<Props>) => boolean) =>
      order.list().some(({ part }) => preferred(part))
        ? stopFor(preferred)
        : undefined,
  }
  return roving
}

/**
 * What `createRovingFocus` returns.
 * @stable
 */
type RovingFocus = ReturnType<typeof createRovingFocus>

export {
  createClaim,
  createRovingFocus,
  type RovingFocus,
  type RovingFocusItem,
  type RovingFocusMoveContext,
  type RovingFocusOptions,
  type RovingOrientation,
}
