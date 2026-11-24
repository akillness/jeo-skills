// Keyboard shortcuts for a whole app, scoped to the layers that are open. A
// modal dialog pauses the page's shortcuts and keeps its own. Components with
// a `shortcut` prop register here, and apps register their own the same way.
import { exposeShortcuts } from "#dev"
import {
  createShortcuts,
  type ShortcutHandler,
  type ShortcutInfo,
  type ShortcutKeys,
  type ShortcutOptions,
} from "./create-shortcuts"

/**
 * Registers a shortcut in the shared `shortcuts`, like `registerShortcut("mod+k", open)`.
 * Returns a function that unregisters it.
 * @stable
 */
function registerShortcut(
  keys: ShortcutKeys,
  handler: ShortcutHandler,
  options?: ShortcutOptions
) {
  return shortcuts.register(keys, handler, options)
}

/**
 * A set of keyboard shortcuts, like the shared `shortcuts`.
 * @stable
 */
type Shortcuts = ReturnType<typeof createShortcuts>

/**
 * The shared shortcuts every component registers into. One per page, even
 * when two copies of the package load. It listens only once something registers.
 * @stable
 */
const shortcuts: Shortcuts = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("ui-sdk.shortcuts@1")
] ??= createShortcuts()) as Shortcuts

// `__UI_SDK__.shortcuts()` lists them in development.
exposeShortcuts(() => shortcuts.list())

export {
  registerShortcut,
  type ShortcutHandler,
  type ShortcutInfo,
  type ShortcutKeys,
  type ShortcutOptions,
  shortcuts,
  type Shortcuts,
}
