// Presses that leave focus where it is, like on a list while typing goes on in
// its field, or on a token's remove button while the caret stays in the editor.

const fields =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

// Cancels a press on `el` so it takes no focus. A press on a field still
// focuses it, like a search field in a list or one a portal renders from inside
// it. A field around the part, like the editor a token's remove button sits in,
// doesn't count. Pointer and mouse events always target an element.
function holdFocus(event: Event, { el }: { el: HTMLElement | undefined }) {
  const field = (event.target as Element).closest(fields)
  if (field && !field.contains(el ?? null)) {
    return
  }
  event.preventDefault()
}

// Firefox moves focus on mousedown even when pointerdown was canceled.
const pressKeepsFocus = { pointerdown: holdFocus, mousedown: holdFocus }

export { holdFocus, pressKeepsFocus }
