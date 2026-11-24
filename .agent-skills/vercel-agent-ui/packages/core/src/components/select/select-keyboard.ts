// Select's keyboard and pointer input: keys on the closed trigger, including
// typeahead that selects like a native select, keys in the open list and in
// its search field, and a press on the trigger that drags or holds to an item
// and releases to choose it.
import { isTypeaheadKey } from "../../foundation/text/typeahead"
import {
  composedClosest,
  composedContains,
  isApple,
} from "../../foundation/platform/platform"
import { type Listbox } from "../../foundation/lists/listbox"
import { listStep } from "../../foundation/lists/listbox-keyboard"
import { isDisabled } from "../../foundation/lists/listbox-parts"
import { isComposing, on } from "../../foundation/kernel/events"
import type { Store } from "../../foundation/kernel/store"
import type { SelectOpenChangeReason, SelectValueChangeReason } from "./select"
import type { SelectState, Show } from "./select-api"
import { type ValueSelection } from "../../foundation/lists/listbox-value"

// How long a press, or how far a drag, before releasing over an item chooses it.
const HOLD_MS = 200
const DRAG_PX = 4

function createSelectKeyboard({
  store,
  listbox,
  selection,
  show,
  hide,
  choose,
  setValue,
  prepare,
  searchElement,
  popupKeyDown,
}: {
  store: Store<SelectState>
  listbox: Listbox
  selection: ValueSelection
  show: (options: Show) => unknown
  hide: (options: {
    reason: SelectOpenChangeReason
    event?: Event
    focus?: boolean
  }) => void
  choose: (key: string, event?: Event) => void
  setValue: (
    value: unknown,
    options: { reason: SelectValueChangeReason; event?: Event }
  ) => unknown
  prepare: () => void
  searchElement: () => HTMLElement | undefined
  // The popup's own Tab handling.
  popupKeyDown: (event: KeyboardEvent) => void
}) {
  // A press opened the list, so the click that follows it is ignored.
  let pressClick = false

  // Typing on the closed trigger selects the next item that starts with the
  // text, like a native select. Space continues a search that still matches.
  // Returns whether the key was used.
  function triggerTypeahead(event: KeyboardEvent) {
    const state = store.get()
    if (state.multiple || state.readOnly || isDisabled(state)) {
      return false
    }
    const found = listbox.search(event.key, selection.keys()[0] ?? null)
    if (!found) {
      return event.key !== " "
    }
    const entry = listbox.find(found.key) ?? found
    listbox.remember(entry.key, entry.label, entry.value)
    setValue(entry.value, { reason: "list-navigation", event })
    return true
  }

  // Keys on the closed trigger. Arrows, Home and End open the list on an
  // item; Enter and Space open it when the trigger isn't a native button,
  // which opens on click by itself.
  function onTriggerKeyDown(
    event: KeyboardEvent,
    trigger: HTMLElement | undefined
  ) {
    const { open, virtualFocus, searchable, focusInList } = store.get()
    if (open) {
      // With `virtualFocus`, focus stays here and the open list takes the keys.
      if (virtualFocus && !searchable && !focusInList) {
        onListKeyDown(event, trigger)
      }
      return
    }
    if (event.key === " " && listbox.typing()) {
      event.preventDefault()
      if (triggerTypeahead(event)) {
        return
      }
    }
    const focus = initialHighlightFor(event.key)
    if (focus) {
      event.preventDefault()
      show({ event, by: "keyboard", focus })
      return
    }
    const nativeButton = trigger?.tagName === "BUTTON"
    if (!nativeButton && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault()
      show({ event, by: "keyboard" })
      return
    }
    if (isTypeaheadKey(event) && event.key !== " ") {
      prepare()
      if (triggerTypeahead(event)) {
        event.preventDefault()
      }
    }
  }

  // Keys in the open list. The search field takes its own.
  function onContentKeyDown(event: KeyboardEvent) {
    if (event.target === searchElement()) {
      return onSearchKeyDown(event)
    }
    onListKeyDown(event)
  }

  // Keys for the open list, from an item, or from the trigger with
  // `virtualFocus`. Tab from the trigger closes the list and lets focus move on.
  function onListKeyDown(event: KeyboardEvent, trigger?: HTMLElement) {
    const { highlighted } = store.get()
    if (event.altKey && event.key === "ArrowDown") {
      return
    }
    if (event.altKey && event.key === "ArrowUp") {
      return chooseAndClose(event)
    }
    const step = selectStep(event, { field: false })
    if (step !== undefined) {
      return moveHighlight(event, step)
    }
    switch (event.key) {
      case "Tab":
        if (trigger) {
          return hide({ reason: "focus-out", event, focus: false })
        }
        return popupKeyDown(event)
      case "Escape":
        return popupKeyDown(event)
      case "Enter":
      case " ":
        return activate(event, highlighted)
    }
    if (isTypeaheadKey(event)) {
      highlightTyped(event, highlighted)
    }
  }

  // Keys in the search field, which keeps focus while arrows move the
  // highlight. Typing filters instead of searching by first letters, and Home,
  // End and Space stay the field's, as the APG's combobox asks.
  function onSearchKeyDown(event: KeyboardEvent) {
    if (isComposing(event)) {
      return
    }
    const { highlighted } = store.get()
    if (event.altKey && event.key === "ArrowUp") {
      return chooseAndClose(event)
    }
    const step = selectStep(event, { field: true })
    if (step !== undefined) {
      return moveHighlight(event, step)
    }
    switch (event.key) {
      case "Tab":
      case "Escape":
        return popupKeyDown(event)
      case "Enter":
        event.preventDefault()
        if (highlighted === null) {
          return
        }
        if (listbox.element(highlighted)?.matches("a[href]")) {
          return listbox.element(highlighted)?.click()
        }
        return choose(highlighted, event)
    }
  }

  function moveHighlight(
    event: KeyboardEvent,
    step: number | "first" | "last"
  ) {
    event.preventDefault()
    listbox.move(step, event)
  }

  // Alt+ArrowUp chooses the highlighted item and closes, as the APG asks. With
  // `multiple` it only closes.
  function chooseAndClose(event: KeyboardEvent) {
    const { highlighted, multiple } = store.get()
    event.preventDefault()
    if (highlighted !== null && !multiple) {
      choose(highlighted, event)
    } else {
      hide({ reason: "item-press", event })
    }
  }

  // Enter or Space on the highlighted item chooses it. Space continues a
  // search while it still matches.
  function activate(event: KeyboardEvent, highlighted: string | null) {
    if (event.key === " " && listbox.typing()) {
      if (highlightTyped(event, highlighted)) {
        return
      }
      listbox.resetTyping()
    }
    event.preventDefault()
    if (highlighted === null) {
      return
    }
    const el = listbox.element(highlighted)
    // Links follow themselves, so routers and modifier keys work.
    if (el?.matches("a[href]")) {
      return el.click()
    }
    choose(highlighted, event)
  }

  // Highlights the next item that starts with what the user typed. Returns whether one did.
  function highlightTyped(event: KeyboardEvent, highlighted: string | null) {
    const found = listbox.search(event.key, highlighted)
    if (!found) {
      return false
    }
    event.preventDefault()
    listbox.highlight(found.key, { event })
    return true
  }

  // Opens on press, like a native select. Releasing over an item after
  // dragging or holding chooses it. A quick click never chooses, even when the
  // list covers the trigger.
  function pointerPress(trigger: HTMLElement, event: PointerEvent) {
    pressClick = true
    const opening = !store.get().open
    if (opening) {
      show({ event, by: "pointer" })
    } else {
      hide({ reason: "trigger-press", event })
    }
    const start = { x: event.clientX, y: event.clientY }
    const off = on(window, "pointerup", (up) => {
      off()
      // The window sees only the shadow host around a trigger in a shadow root.
      const target = up.composedPath()[0] as HTMLElement
      // A release off the trigger sends it no click, so the next click, like Enter, is a new press.
      if (!composedContains(trigger, target)) {
        pressClick = false
      }
      if (!opening) {
        return
      }
      // Timed by when the input happened, so a busy page rendering the list
      // doesn't turn a click into a hold.
      const held = up.timeStamp - event.timeStamp >= HOLD_MS
      const moved =
        Math.hypot(up.clientX - start.x, up.clientY - start.y) > DRAG_PX
      if ((!held && !moved) || composedContains(trigger, target)) {
        return
      }
      const option = composedClosest<HTMLElement>(target, '[role="option"]')
      const entry =
        option &&
        listbox.entries().find((entry) => listbox.element(entry.key) === option)
      if (entry) {
        choose(entry.key, up)
      }
    })
  }

  return {
    onTriggerKeyDown,
    onContentKeyDown,
    pointerPress,
    // Whether the click that just happened follows a press that already opened or closed the list.
    consumePressClick() {
      const pressed = pressClick
      pressClick = false
      return pressed
    },
  }
}

// The step a key takes through the open list. PageUp and PageDown go to the
// ends, like Home and End in the list, while the search field keeps Home and
// End for its caret.
function selectStep(event: KeyboardEvent, { field }: { field: boolean }) {
  if (event.key === "PageUp" || (!field && event.key === "Home")) {
    return "first"
  }
  if (event.key === "PageDown" || (!field && event.key === "End")) {
    return "last"
  }
  return listStep(event, { apple: isApple() })
}

// The item an arrow, Home or End key on the closed trigger highlights once the list opens.
function initialHighlightFor(key: string) {
  if (key === "ArrowDown" || key === "ArrowUp") {
    return "selected"
  }
  if (key === "Home") {
    return "first"
  }
  if (key === "End") {
    return "last"
  }
}

export { createSelectKeyboard }
