import { initialApple, isApple } from "@ui-sdk/core/renderer"
import {
  ariaKeyshortcuts,
  formatShortcut,
  shortcuts,
  type ShortcutHandler,
  type ShortcutOptions,
} from "@ui-sdk/core/shortcuts"
import { createEffect, createSignal } from "solid-js"

/**
 * A value, or an accessor of one, like `() => props.keys`.
 * @stable
 */
type MaybeAccessor<T> = T | (() => T)

/**
 * Options for `useShortcut`. `layer` takes an element or a function that returns one.
 * @stable
 */
type UseShortcutOptions = ShortcutOptions

const read = <T>(value: MaybeAccessor<T>) =>
  typeof value === "function" ? (value as () => T)() : value

/**
 * Registers a keyboard shortcut for the life of the component, in the shared
 * `shortcuts`. Keys can be a value or an accessor, like `() => props.keys`,
 * and nothing registers for `null`. Options can be an accessor too, like
 * `() => ({ scope: props.scope })`, and it registers again when they change.
 * The server registers nothing.
 * @stable
 */
function useShortcut(
  keys: MaybeAccessor<string | null | undefined>,
  handler: ShortcutHandler,
  options: MaybeAccessor<UseShortcutOptions> = {}
) {
  createEffect(
    () => ({ keys: read(keys), options: read(options) }),
    ({ keys, options }) => {
      if (!keys) {
        return
      }
      return shortcuts.register(keys, handler, options)
    }
  )
}

/**
 * Keys formatted for this platform, like `⌘S` on Apple platforms and `Ctrl+S`
 * elsewhere, with the matching `aria-keyshortcuts`, as accessors. The server
 * and the first client render use the same platform, so hydration matches,
 * and they update after mount. Keys can be a value or an accessor. The text
 * is wrapped in a left-to-right isolate, like `formatShortcut`'s.
 * @stable
 */
function useShortcutHint(keys: MaybeAccessor<string>) {
  const [apple, setApple] = createSignal(initialApple())
  createEffect(
    () => 0,
    () => {
      setApple(isApple())
    }
  )
  return {
    text: () => formatShortcut(read(keys), apple()),
    ariaKeyshortcuts: () => ariaKeyshortcuts(read(keys), apple()),
  }
}

export {
  ariaKeyshortcuts,
  formatShortcut,
  registerShortcut,
  shortcuts,
} from "@ui-sdk/core/shortcuts"
export type {
  ShortcutHandler,
  ShortcutInfo,
  ShortcutKeys,
  ShortcutOptions,
  Shortcuts,
} from "@ui-sdk/core/shortcuts"

export {
  type MaybeAccessor,
  useShortcut,
  useShortcutHint,
  type UseShortcutOptions,
}
