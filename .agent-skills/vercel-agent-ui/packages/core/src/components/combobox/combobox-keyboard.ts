// Combobox's keyboard: keys in the input, which keeps focus while arrows move
// a virtual highlight through the list, keys in the list when a screen reader
// moved real focus there, and keys on chips, which move between them and
// remove them.
import type {
  ComboboxOpenChangeReason,
  ComboboxQueryChangeReason,
} from "./combobox"
import type { ComboboxState } from "./combobox-api"
import { isRTL } from "../../foundation/platform/env"
import { isApple } from "../../foundation/platform/platform"
import { listKeyDown, listStep } from "../../foundation/lists/listbox-keyboard"
import { type ListEntry, type Listbox } from "../../foundation/lists/listbox"
import { type PopupOpener } from "../../foundation/popups/popup"
import { isComposing } from "../../foundation/kernel/events"
import type { Store } from "../../foundation/kernel/store"
import { type ValueSelection } from "../../foundation/lists/listbox-value"

function createComboboxKeyboard({
  store,
  listbox,
  selection,
  show,
  hide,
  choose,
  create,
  remove,
  itemLabelled,
  commitCustom,
  hasCreate,
  allowCustomValue,
  chips,
  inputElement,
  focusInput,
  highlightOnOpen,
}: {
  store: Store<ComboboxState>
  listbox: Listbox
  selection: ValueSelection
  show: (options: { event?: Event; by?: PopupOpener }) => unknown
  hide: (options: { reason: ComboboxOpenChangeReason; event?: Event }) => void
  choose: (key: string, event?: Event) => void
  create: (event?: Event) => void
  remove: (value: unknown, event?: Event) => void
  itemLabelled: (
    query: string,
    candidates: ListEntry[]
  ) => ListEntry | undefined
  commitCustom: (reason: ComboboxQueryChangeReason, event?: Event) => boolean
  hasCreate: () => boolean
  allowCustomValue: () => boolean
  // The chips, in order.
  chips: () => HTMLElement[]
  inputElement: () => HTMLElement | undefined
  // Moves focus from the list back to the input, for typing.
  focusInput: () => void
  // The item to highlight once the list has mounted, after an arrow key opened it.
  highlightOnOpen: (target: "first" | "last") => void
}) {
  function onInputKeyDown(event: KeyboardEvent) {
    const { open } = store.get()
    const input = event.target as HTMLInputElement
    // Alt+ArrowDown opens without moving the highlight, and Alt+ArrowUp closes, as the APG asks.
    if (event.altKey && event.key === "ArrowDown" && !open) {
      event.preventDefault()
      show({ event, by: "keyboard" })
      return
    }
    if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault()
      hide({ reason: "escape-key", event })
      return
    }
    const step = listStep(event, { apple: isApple() })
    if (step !== undefined) {
      return moveHighlight(event, step, open)
    }
    switch (event.key) {
      case "Enter": {
        // Chips with no suggestions may keep the list closed, and Enter still adds the text.
        const { multiple, query } = store.get()
        const adds = multiple && allowCustomValue() && !!query.trim()
        if (open || (adds && !isComposing(event))) {
          onEnter(event)
        }
        return
      }
      case "Tab":
        if (open) {
          hide({ reason: "focus-out", event })
        }
        return
      case "Backspace":
        // Backspace in an empty input removes the last chip.
        if (
          store.get().multiple &&
          input.value === "" &&
          input.selectionStart === 0 &&
          selection.values().length
        ) {
          event.preventDefault()
          remove(selection.values().at(-1), event)
        }
        return
      case "ArrowLeft":
      case "ArrowRight":
        return focusLastChip(event, input)
    }
    // Escape closes an open list through its layer. A closed one with chosen text has nothing to do.
  }

  // Moves the highlight through the open list. A step to the next or previous
  // item opens a closed one at its first or last item, once it has mounted.
  function moveHighlight(
    event: KeyboardEvent,
    step: number | "first" | "last",
    open: boolean
  ) {
    if (open) {
      event.preventDefault()
      return listbox.move(step, event)
    }
    if (step !== 1 && step !== -1) {
      return
    }
    event.preventDefault()
    highlightOnOpen(step === -1 ? "last" : "first")
    show({ event, by: "keyboard" })
  }

  // Enter: the item highlighted in the open list, else an item whose label is
  // the text, else the create option, else the text itself with `allowCustomValue`.
  function onEnter(event: KeyboardEvent) {
    const { highlighted, query, multiple, open } = store.get()
    event.preventDefault()
    // In a list kept closed, `autoHighlight` highlights an item nobody saw.
    if (open && highlighted !== null) {
      const el = listbox.element(highlighted)
      // Links follow themselves, so routers and modifier keys work.
      if (el?.matches("a[href]")) {
        return el.click()
      }
      return choose(highlighted, event)
    }
    const text = query.trim()
    const exact = text ? itemLabelled(text, listbox.entries()) : undefined
    if (exact) {
      return choose(exact.key, event)
    }
    if (hasCreate()) {
      return create(event)
    }
    if (
      allowCustomValue() &&
      commitCustom("input-change", event) &&
      !multiple
    ) {
      hide({ reason: "item-press", event })
    }
  }

  // Keys in the list, when a screen reader's tap moved real focus there.
  function onListKeyDown(event: KeyboardEvent) {
    if (!store.get().focusInList || event.target === inputElement()) {
      return
    }
    listKeyDown(event, {
      listbox,
      highlighted: store.get().highlighted,
      choose,
      focusInput,
    })
  }

  // The arrow toward the chips, with the caret at the input's start, moves to the last chip.
  function focusLastChip(event: KeyboardEvent, input: HTMLInputElement) {
    const back = (event.key === "ArrowLeft") !== isRTL(input)
    if (!back || input.selectionStart !== 0 || input.selectionEnd !== 0) {
      return
    }
    const last = chips().at(-1)
    if (!last) {
      return
    }
    event.preventDefault()
    last.focus()
  }

  // Arrows move between chips and back to the input. Backspace and Delete
  // remove a chip and move to its neighbour, and Escape returns to the input.
  function onChipKeyDown(
    event: KeyboardEvent,
    el: HTMLElement,
    value: unknown
  ) {
    const list = chips()
    const index = list.indexOf(el)
    const input = inputElement()
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        event.preventDefault()
        const previous = (event.key === "ArrowLeft") !== isRTL(el)
        const next = list[index + (previous ? -1 : 1)]
        if (next) {
          next.focus()
        } else if (!previous) {
          input?.focus()
        }
        return
      }
      case "Backspace":
      case "Delete": {
        event.preventDefault()
        const neighbour = list[index - 1] ?? list[index + 1]
        remove(value, event)
        ;(neighbour ?? input)?.focus()
        return
      }
      case "Escape":
        event.preventDefault()
        input?.focus()
        return
    }
  }

  // Like a select's button, ArrowDown and ArrowUp on the trigger open the list
  // at its first or last item. Enter and Space press it.
  function onTriggerKeyDown(event: KeyboardEvent) {
    if (
      store.get().open ||
      (event.key !== "ArrowDown" && event.key !== "ArrowUp")
    ) {
      return
    }
    event.preventDefault()
    highlightOnOpen(event.key === "ArrowUp" ? "last" : "first")
    show({ event, by: "keyboard" })
  }

  return { onInputKeyDown, onListKeyDown, onChipKeyDown, onTriggerKeyDown }
}

export { createComboboxKeyboard }
