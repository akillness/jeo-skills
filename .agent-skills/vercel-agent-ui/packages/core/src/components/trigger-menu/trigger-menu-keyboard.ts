// TriggerMenu's keys, heard on the editor while a match is active. Focus never
// leaves the editor: arrows move a virtual highlight, Enter and Tab choose, and
// Escape dismisses. Keys an input method owns never reach here.
import { isApple } from "../../foundation/platform/platform"
import type { Listbox } from "../../foundation/lists/listbox"
import { listStep } from "../../foundation/lists/listbox-keyboard"
import type { Store } from "../../foundation/kernel/store"

function createTriggerMenuKeyboard({
  store,
  listbox,
  active,
  inArguments,
  choose,
  accept,
  dismiss,
  caretMove,
}: {
  store: Store<{
    open: boolean
    highlighted: string | null
    navigated: boolean
  }>
  listbox: Listbox
  // Whether a match is active, open or not, like a free-text argument with no list.
  active: () => boolean
  inArguments: () => boolean
  choose: (key: string, event: KeyboardEvent, options: { tab: boolean }) => void
  accept: (event: KeyboardEvent, options: { tab: boolean }) => void
  dismiss: (event: KeyboardEvent) => void
  caretMove: (event: KeyboardEvent) => void
}) {
  // The first arrow press is when screen readers hear about the highlight.
  function move(event: KeyboardEvent, step: number | "first" | "last") {
    event.preventDefault()
    store.set({ navigated: true })
    listbox.move(step, event)
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!active()) {
      return
    }
    const { open, highlighted } = store.get()
    const step = listStep(event, { apple: isApple() })
    // Alt and Cmd with an arrow stay the editor's, which moves its caret with them.
    const arrow = event.key === "ArrowDown" || event.key === "ArrowUp"
    if (step !== undefined) {
      if (open && !(arrow && (event.altKey || event.metaKey))) {
        move(event, step)
      }
      return
    }
    switch (event.key) {
      case "Enter":
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
          return
        }
        // An open menu's Enter wins over the editor's, like a prompt's submit.
        if (!open && !inArguments()) {
          return
        }
        event.preventDefault()
        if (inArguments()) {
          return accept(event, { tab: false })
        }
        if (highlighted !== null) {
          choose(highlighted, event, { tab: false })
        }
        return
      case "Tab":
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
          return
        }
        if (inArguments()) {
          event.preventDefault()
          return accept(event, { tab: true })
        }
        if (open && highlighted !== null) {
          event.preventDefault()
          choose(highlighted, event, { tab: true })
        }
        return
      case "Escape":
        // An open list's Escape is its layer's. A match with no list, like a
        // free-text argument, dismisses here.
        if (open) {
          return
        }
        event.preventDefault()
        dismiss(event)
        return
      case "Home":
      case "End":
        caretMove(event)
        return
    }
  }

  return { onKeyDown }
}

export { createTriggerMenuKeyboard }
