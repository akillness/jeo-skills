// How a custom element's `modal` attribute becomes a popup's `modal` option,
// for the schemas of the popups that take one. In a module of its own, so a
// primitive that only names a parser, like a menubar, doesn't load `popup.ts`.

/**
 * A `modal` attribute as a `Modal` (`popup.ts`), for a schema's `modal` option. A bare
 * `modal` means true, like any boolean attribute, "false" is false, and
 * "pointer" or "trap-focus" keep one effect. A missing one is undefined, so
 * the component's default applies.
 */
function modalAttribute(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  if (attribute === "false") {
    return false
  }
  if (attribute === "pointer" || attribute === "trap-focus") {
    return attribute
  }
  return true
}

/**
 * The same for popups that take no "trap-focus", like menus and the lists of
 * Select, Combobox and Autocomplete: it reads as a bare `modal`.
 */
function pointerModalAttribute(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  if (attribute === "false") {
    return false
  }
  if (attribute === "pointer") {
    return "pointer"
  }
  return true
}

export { modalAttribute, pointerModalAttribute }
