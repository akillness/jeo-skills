import { initialApple, isApple } from "@ui-sdk/core/renderer"
import {
  ariaKeyshortcuts,
  formatShortcut,
  shortcuts,
  type ShortcutHandler,
  type ShortcutOptions,
} from "@ui-sdk/core/shortcuts"

/**
 * A value, or a getter that reads it, so props stay in sync.
 * @stable
 */
type MaybeGetter<T> = T | (() => T)

/**
 * Options for `useShortcut`. `layer` also takes a getter.
 * @stable
 */
type UseShortcutOptions = Omit<ShortcutOptions, "layer"> & {
  /** An element inside a popup, or a getter of one. The shortcut belongs to that popup. */
  layer?: MaybeGetter<Element | null | undefined>
}

const read = <T>(value: MaybeGetter<T>) =>
  typeof value === "function" ? (value as () => T)() : value

/**
 * Registers a keyboard shortcut for the life of the component, in the shared
 * `shortcuts`. Keys can be a getter, and nothing registers for `null`.
 * Options can be a getter too, like `() => ({ scope })`, and it registers
 * again when they change. Nothing registers on the server.
 * @stable
 */
function useShortcut(
  keys: MaybeGetter<string | null | undefined>,
  handler: ShortcutHandler,
  options: MaybeGetter<UseShortcutOptions> = {}
) {
  $effect(() => {
    const current = read(keys)
    if (!current) {
      return
    }
    const { layer, ...rest } = read(options)
    return shortcuts.register(current, handler, {
      ...rest,
      layer: layer === undefined ? undefined : () => read(layer),
    })
  })
}

/**
 * Keys formatted for this platform, like `⌘S` on Apple platforms and `Ctrl+S`
 * elsewhere, with the matching `aria-keyshortcuts`, as reactive getters. The
 * server and the first client render use the same platform, so hydration
 * matches, and they update after mount. Keys can be a getter. The text is
 * wrapped in a left-to-right isolate, like `formatShortcut`'s.
 * @stable
 */
function useShortcutHint(keys: MaybeGetter<string>) {
  let apple = $state(initialApple())
  $effect(() => {
    apple = isApple()
  })
  return {
    get text() {
      return formatShortcut(read(keys), apple)
    },
    get ariaKeyshortcuts() {
      return ariaKeyshortcuts(read(keys), apple)
    },
  }
}

export {
  type MaybeGetter,
  useShortcut,
  useShortcutHint,
  type UseShortcutOptions,
}
