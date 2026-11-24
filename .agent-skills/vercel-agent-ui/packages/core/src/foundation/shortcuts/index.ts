// What the rest of core may import from shortcuts's files. import-layers checks every
// import from another folder against this list. Nothing imports this file, so bundles
// don't pay for it.
export {
  createShortcuts,
  type ShortcutHandler,
  type ShortcutInfo,
  type ShortcutKeys,
  type ShortcutOptions,
} from "./create-shortcuts"
export {
  adoptPlatform,
  bindPartShortcut,
  shortcutOf,
  shortcutSlot,
} from "./shortcut-slot"
export { registerShortcut, shortcuts, type Shortcuts } from "./shortcuts"
