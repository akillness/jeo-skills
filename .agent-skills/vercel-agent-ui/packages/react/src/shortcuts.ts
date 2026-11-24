import { initialApple, isApple } from "@ui-sdk/core/renderer"
import {
  ariaKeyshortcuts,
  formatShortcut,
  shortcuts,
  type ShortcutHandler,
  type ShortcutOptions,
} from "@ui-sdk/core/shortcuts"
import * as React from "react"

/**
 * Options for `useShortcut`. `layer` also takes a ref, like one on an element inside a dialog.
 * @stable
 */
type UseShortcutOptions = Omit<ShortcutOptions, "layer"> & {
  /** An element inside a popup, a ref to one, or a function that returns one. The shortcut belongs to that popup. */
  layer?: ShortcutOptions["layer"] | React.RefObject<Element | null>
}

/**
 * Registers a keyboard shortcut while the component is mounted, in the shared
 * `shortcuts`. Keys like `"mod+k"`; nothing registers for `null`. The latest
 * handler and `when` always run, so they needn't be stable.
 * @stable
 */
function useShortcut(
  keys: string | null | undefined,
  handler: ShortcutHandler,
  options: UseShortcutOptions = {}
) {
  const latest = React.useRef({ handler, options })
  // After the commit, so a render React discards never runs.
  React.useLayoutEffect(() => {
    latest.current = { handler, options }
  })
  const { scope, allowInInput, repeat, description } = options
  // Only a shortcut with a condition passes one, so the development warning
  // for the same keys registered twice still sees the rest.
  const conditional = !!options.when
  const layered = !!options.layer
  React.useEffect(() => {
    if (!keys) {
      return
    }
    return shortcuts.register(keys, (event) => latest.current.handler(event), {
      scope,
      allowInInput,
      repeat,
      description,
      when: conditional
        ? () => latest.current.options.when?.() ?? true
        : undefined,
      layer: layered
        ? () => {
            const layer = latest.current.options.layer
            if (!layer) {
              return null
            }
            if (typeof layer === "function") {
              return layer()
            }
            return "current" in layer ? layer.current : layer
          }
        : undefined,
    })
  }, [keys, scope, allowInInput, repeat, description, layered, conditional])
}

/**
 * Keys formatted for this platform, like `⌘S` on Apple platforms and `Ctrl+S`
 * elsewhere, with the matching `aria-keyshortcuts`. The server and the first
 * client render use the same platform, so hydration matches, and it updates
 * after mount. Calling `formatShortcut` during render instead differs between
 * the server and a Mac. The text is wrapped in a left-to-right isolate, like
 * `formatShortcut`'s.
 * @stable
 */
function useShortcutHint(keys: string) {
  const [apple, setApple] = React.useState(initialApple)
  React.useEffect(() => setApple(isApple()), [])
  return {
    text: formatShortcut(keys, apple),
    ariaKeyshortcuts: ariaKeyshortcuts(keys, apple),
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

export { useShortcut, useShortcutHint, type UseShortcutOptions }
