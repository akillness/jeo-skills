// Listbox's keys and presses, as the APG's listbox pattern lays them out.
// Arrows, Home and End move focus, and with `activation="automatic"` the
// selection follows. Space and Enter choose. With `multiple`, Shift extends a
// range from the anchor, Ctrl or ⌘ moves or toggles without replacing, and
// Ctrl or ⌘ with A selects everything. Typing finds an option by its label.
import { stepFor } from "../../foundation/focus/collection"
import { sourceOf } from "../../foundation/kernel/modality"
import { isRTL } from "../../foundation/platform/env"
import { isTypeaheadKey } from "../../foundation/text/typeahead"
import { type Listbox } from "../../foundation/lists/listbox"
import { isDisabled } from "../../foundation/lists/listbox-parts"
import { PAGE, pagedElsewhere } from "../../foundation/lists/listbox-keyboard"
import type { ListboxValueChangeReason } from "./listbox-root"
import type { ListboxStore } from "./listbox-root-api"
import type { Store } from "../../foundation/kernel/store"

type Change = { reason: ListboxValueChangeReason; event?: Event }

// Ctrl on Windows and Linux, ⌘ on Apple platforms: both count, since neither
// means anything else in a list.
const withModifier = (event: KeyboardEvent | MouseEvent) =>
  event.ctrlKey || event.metaKey

function createListboxKeyboard({
  store,
  listbox,
  choose,
  toggle,
  replace,
  extend,
  toggleAll,
  anchorKey,
}: {
  store: Store<ListboxStore>
  listbox: Listbox
  choose: (key: string, why: Change) => void
  toggle: (key: string, why: Change) => void
  replace: (key: string, why: Change) => void
  extend: (
    to: string,
    range: { from: string | null; additive: boolean },
    why: Change
  ) => void
  toggleAll: (why: Change) => void
  anchorKey: () => string | null
}) {
  // Moves focus by a step, and the selection with it as the activation asks.
  // A step with Shift extends the range instead, and never wraps.
  function navigate(
    event: KeyboardEvent,
    step: number | "first" | "last",
    current: string | null
  ) {
    const state = store.get()
    const extending = event.shiftKey && state.multiple
    const next = extending
      ? listbox.stepKey(step, { loop: false })
      : listbox.stepKey(step)
    if (next === undefined) {
      return
    }
    event.preventDefault()
    if (next !== current) {
      listbox.highlight(next, { event })
    }
    const why = { reason: "list-navigation", event } as const
    if (extending) {
      return extend(next, { from: current, additive: additive(event) }, why)
    }
    if (state.activation !== "automatic" || withModifier(event)) {
      return
    }
    if (state.multiple) {
      replace(next, why)
    } else {
      choose(next, why)
    }
  }

  // Whether a range adds to the selection: always when choosing waits for
  // Space, and with Ctrl or ⌘ when a press replaces it.
  const additive = (event: KeyboardEvent | MouseEvent) =>
    store.get().activation === "manual" || withModifier(event)

  // Space or Enter on the focused option.
  function activate(event: KeyboardEvent, current: string | null) {
    if (current === null) {
      return
    }
    event.preventDefault()
    const el = listbox.element(current)
    // Links follow themselves, so routers and modifier keys work, and the press chooses.
    if (event.key === "Enter" && el?.matches("a[href]")) {
      return el.click()
    }
    const state = store.get()
    const why = { reason: "item-press", event } as const
    if (!state.multiple) {
      return choose(current, why)
    }
    if (event.shiftKey) {
      return extend(
        current,
        { from: anchorKey(), additive: additive(event) },
        why
      )
    }
    if (state.activation === "manual" || withModifier(event)) {
      return toggle(current, why)
    }
    replace(current, why)
  }

  // Focuses the next option whose label starts with what was typed, and
  // selects it when the selection follows focus. Returns whether one matched.
  function typed(event: KeyboardEvent, current: string | null) {
    const found = listbox.search(event.key, current)
    if (!found) {
      return false
    }
    event.preventDefault()
    listbox.highlight(found.key, { event })
    const state = store.get()
    if (state.activation !== "automatic") {
      return true
    }
    const why = { reason: "list-navigation", event } as const
    if (state.multiple) {
      replace(found.key, why)
    } else {
      choose(found.key, why)
    }
    return true
  }

  function onKeyDown(event: KeyboardEvent, root: HTMLElement) {
    // Keys from a list nested inside bubble through. Only the owner handles them.
    if ((event.target as HTMLElement).closest('[role="listbox"]') !== root) {
      return
    }
    const state = store.get()
    if (isDisabled(state) || event.altKey) {
      return
    }
    const current = state.highlighted ?? state.stop
    if (
      withModifier(event) &&
      event.key.toLowerCase() === "a" &&
      !event.shiftKey
    ) {
      if (!state.multiple) {
        return
      }
      event.preventDefault()
      return toggleAll({ reason: "list-navigation", event })
    }
    const step = stepFor(event.key, state.orientation, isRTL(root))
    if (step !== undefined) {
      return navigate(event, step, current)
    }
    const page =
      event.key === "PageDown" ? PAGE : event.key === "PageUp" ? -PAGE : 0
    if (page && !pagedElsewhere.has(root)) {
      return navigate(event, page, current)
    }
    if (event.key === " " && listbox.typing()) {
      // Space continues a search while it still matches.
      if (typed(event, current)) {
        return
      }
      listbox.resetTyping()
    }
    if (event.key === " " || event.key === "Enter") {
      return activate(event, current)
    }
    if (isTypeaheadKey(event) && !withModifier(event)) {
      typed(event, current)
    }
  }

  // A click, a tap or a screen reader's activation on an option. Touch and
  // screen readers have no modifier keys, so where a press would replace the
  // selection, theirs toggles.
  function press(key: string, event?: Event) {
    const state = store.get()
    if (isDisabled(state)) {
      return
    }
    const el = listbox.element(key)
    // A press with Shift kept the browser from selecting text, and focus with it.
    if (el && !state.virtualFocus && el.ownerDocument.activeElement !== el) {
      el.focus({ preventScroll: true })
    }
    const why = { reason: "item-press", event } as const
    if (!state.multiple) {
      return choose(key, why)
    }
    const pointer = event as MouseEvent | undefined
    const source = event ? sourceOf(event) : "touch"
    const modifiers = !!pointer && source !== "touch" && source !== "virtual"
    // A range with no anchor, like after the selection was cleared, starts at the option pressed.
    if (modifiers && pointer.shiftKey) {
      return extend(key, { from: null, additive: additive(pointer) }, why)
    }
    if (state.activation === "manual" || !modifiers || withModifier(pointer)) {
      return toggle(key, why)
    }
    replace(key, why)
  }

  return { onKeyDown, press }
}

export { createListboxKeyboard }
