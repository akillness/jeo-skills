// Text fields in a toolbar, which keep the arrows that move their caret.
import { fieldKeepsKey } from "../../foundation/focus/collection"
import { isRTL } from "../../foundation/platform/env"

// Puts the caret of a text field that focus moved into at the end the move
// pointed to, so pressing the same arrow again moves on.
function placeCaret(el: HTMLElement, forward: boolean) {
  if (
    !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ||
    el.selectionStart === null
  ) {
    return
  }
  const at = forward ? el.value.length : 0
  el.setSelectionRange(at, at)
}

// Whether a focused text field keeps a key for its caret. See `fieldKeepsKey`.
function fieldKeeps(event: KeyboardEvent, el: Element) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return false
  }
  // Inputs without a caret, like checkboxes and number fields, have no selection.
  return fieldKeepsKey(event.key, {
    start: el.selectionStart,
    end: el.selectionEnd,
    length: el.value.length,
    rtl: isRTL(el),
    usesUpDown: el instanceof HTMLTextAreaElement || el.type === "number",
  })
}

export { fieldKeeps, placeCaret }
