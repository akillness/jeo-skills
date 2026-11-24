// The scope a member from another primitive joins a roving group through,
// like a toggle in its toggle group or in the toolbar around it.
import { select } from "../kernel/selects"
import { subscribeSkipping, type Store } from "../kernel/store"
import type { RovingFocusItem, RovingOrientation } from "./roving-focus"

// How an item from another primitive takes part in a group: the props a
// toggle joins its toggle group's or its toolbar's `createRovingFocus` with.
type RovingMember = {
  // Whether it can't be activated. Enabled items take the stop first.
  disabled?: () => boolean
  // Whether it can take focus at all.
  focusable?: () => boolean
  // Whether it holds the stop before focus has been in the group, like a pressed toggle.
  preferred?: () => boolean
}

// What a member from another primitive sees of a roving group, wherever the
// group lives: a toggle's own group, or the toolbar that group sits in.
type RovingScope = {
  // Joins a member. Returns its cleanup.
  bind: (el: HTMLElement, item: RovingFocusItem<RovingMember>) => () => void
  // Whether a member rendering before any has bound holds the stop. The group
  // decides which members are eligible.
  claim: (item: RovingFocusItem<RovingMember>) => boolean
  // Checks the stop after a change the group can't see, like a toggle's own disabled.
  queueCheck: () => void
  // Moves focus for a key pressed on a member.
  keydown: (event: KeyboardEvent, el: HTMLElement) => void
  // The key that holds the stop, or null until items bind.
  stop: () => string | null
  // Runs on the changes a member with this key can show: every change but a
  // stop move, and stop moves to or from it. See `followStop`.
  follow: (key: string, listener: () => void) => () => void
  orientation: () => RovingOrientation
  // Whether the whole group is disabled, like a disabled toolbar.
  disabled: () => boolean
}

// How a group whose items are members reads them.
const memberDisabled = (item: RovingFocusItem<RovingMember>) =>
  !!item.props.disabled?.()
const memberFocusable = (item: RovingFocusItem<RovingMember>) =>
  item.props.focusable?.() ?? true

// Runs `run` once, a microtask after the first call since it last ran, so
// many members changing at once check the stop once.
function queued(run: () => void) {
  let waiting = false
  return () => {
    if (waiting) {
      return
    }
    waiting = true
    queueMicrotask(() => {
      waiting = false
      run()
    })
  }
}

const stopOnly = { stop: true }

/**
 * Runs `listener` on every change to a group's store but a stop move, and on
 * stop moves to or from `key`, or from null, which items read before the
 * first check. An arrow key then reaches the two items it moves the stop
 * between, not every item.
 */
function followStop(
  store: Store<{ stop: string | null }>,
  key: string,
  listener: () => void
) {
  const cleanups = [
    subscribeSkipping(store, stopOnly, listener),
    select(store, "stop", key, listener),
    select(store, "stop", null, listener),
  ]
  return () => cleanups.forEach((cleanup) => cleanup())
}

export {
  followStop,
  memberDisabled,
  memberFocusable,
  queued,
  type RovingMember,
  type RovingScope,
}
