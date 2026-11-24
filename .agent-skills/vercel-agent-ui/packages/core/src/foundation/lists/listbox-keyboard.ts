// The keys every list with a highlight shares: the step a key takes through
// it, and the keys on an item that has real focus.
import { isApple } from "../platform/platform"
import { isTypeaheadKey } from "../text/typeahead"
import { type Listbox } from "./listbox"

// How far PageUp and PageDown move the highlight.
const PAGE = 10

// Lists whose PageUp and PageDown something else handles, like a scroll picker
// that pages by what fits in view.
const pagedElsewhere = new WeakSet<Element>()

// The step a key takes through a list: 1 or -1 for the arrows, and for Ctrl+N
// and Ctrl+P on Apple platforms, as in their text fields; the first or last
// item for Cmd with an arrow; a page for PageUp and PageDown. Undefined for any
// other key. Alt with an arrow opens or closes a list, which each component
// decides before asking for a step. Home and End are left out, since a text
// field keeps them for its caret.
function listStep(event: KeyboardEvent, { apple }: { apple: boolean }) {
  const { key } = event
  if (key === "ArrowDown") {
    return event.metaKey ? "last" : 1
  }
  if (key === "ArrowUp") {
    return event.metaKey ? "first" : -1
  }
  if (key === "PageDown") {
    return PAGE
  }
  if (key === "PageUp") {
    return -PAGE
  }
  const emacs =
    apple && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
  if (emacs && key === "n") {
    return 1
  }
  if (emacs && key === "p") {
    return -1
  }
}

// Keys on an item that has real focus, after a screen reader's tap opened the
// list: arrows, Home and End move focus, Enter and Space choose, and typing
// goes back to the input, which has focus by the time the character lands.
// Escape closes through the list's layer.
function listKeyDown(
  event: KeyboardEvent,
  {
    listbox,
    highlighted,
    choose,
    focusInput,
  }: {
    listbox: Listbox
    highlighted: string | null
    choose: (key: string, event: Event) => void
    focusInput: () => void
  }
) {
  const step =
    event.key === "Home"
      ? "first"
      : event.key === "End"
        ? "last"
        : listStep(event, { apple: isApple() })
  if (step !== undefined) {
    event.preventDefault()
    return listbox.move(step, event)
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault()
    if (highlighted === null) {
      return
    }
    const el = listbox.element(highlighted)
    // Links follow themselves, so routers and modifier keys work, and the press chooses.
    if (event.key === "Enter" && el?.matches("a[href]")) {
      return el.click()
    }
    return choose(highlighted, event)
  }
  if (isTypeaheadKey(event)) {
    focusInput()
  }
}

export { listKeyDown, listStep, PAGE, pagedElsewhere }
