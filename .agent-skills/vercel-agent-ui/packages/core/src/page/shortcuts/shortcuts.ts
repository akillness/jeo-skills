// The public `@ui-sdk/core/shortcuts` entry. The manager lives in
// `foundation/shortcuts`, so components can register their triggers'
// shortcuts without importing the page.
export {
  ariaKeyshortcuts,
  formatShortcut,
  matchesShortcut,
} from "../../foundation/platform/platform"
export {
  registerShortcut,
  type ShortcutHandler,
  type ShortcutInfo,
  type ShortcutKeys,
  type ShortcutOptions,
  shortcuts,
  type Shortcuts,
} from "../../foundation/shortcuts/shortcuts"
