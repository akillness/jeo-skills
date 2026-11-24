// How the shortcut manager decides whether a key press runs a shortcut: where
// it stands among the open layers, and whether the user is typing. Internal to
// `shortcuts.ts`, kept apart so tests can check it alone.
import type { ShortcutOptions } from "./shortcuts"

/**
 * Where a shortcut stands among the open layers: the order of the layer it
 * belongs to, 0 for the page, or null when it belongs to a popup that's
 * closed, whether it left the page or stays in it hidden. One in a persistent
 * layer, like a toast region, stands above every layer, so no modal pauses it.
 */
function shortcutOrder(
  layer: ShortcutOptions["layer"],
  find: (el: Element) => { order?: number } | undefined,
  persistent: (el: Element) => boolean = () => false,
  inPopup: (el: Element) => boolean = () => false
) {
  if (!layer) {
    return 0
  }
  const el = typeof layer === "function" ? layer() : layer
  if (!el || !el.isConnected) {
    return null
  }
  if (persistent(el)) {
    return Infinity
  }
  const open = find(el)
  if (open) {
    return open.order ?? 0
  }
  return inPopup(el) ? null : 0
}

/**
 * Whether a shortcut at `order` may run while the topmost blocking layer,
 * like a modal dialog, opened at `blocking`. Shortcuts of that layer and of
 * layers opened after it run. The page's and those of layers beneath pause.
 */
function isShortcutAllowed(order: number | null, blocking: number | undefined) {
  if (order === null) {
    return false
  }
  return blocking === undefined || order >= blocking
}

/** Whether a key press happened while typing text, where letters are text. */
function isTypingIn(target: EventTarget | null | undefined) {
  if (!target || !(target as Element).tagName) {
    return false
  }
  const el = target as HTMLElement
  if (el.isContentEditable) {
    return true
  }
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
    return true
  }
  if (el.tagName !== "INPUT") {
    return false
  }
  const type = (el as HTMLInputElement).type
  return !/^(button|checkbox|radio|submit|reset|range|color|file|image)$/.test(
    type
  )
}

export { isShortcutAllowed, isTypingIn, shortcutOrder }
