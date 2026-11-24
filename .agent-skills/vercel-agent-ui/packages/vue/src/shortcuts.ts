import { initialApple, isApple } from "@ui-sdk/core/renderer"
import {
  ariaKeyshortcuts,
  formatShortcut,
  shortcuts,
  type ShortcutHandler,
  type ShortcutOptions,
} from "@ui-sdk/core/shortcuts"
import {
  computed,
  onMounted,
  onScopeDispose,
  shallowRef,
  toValue,
  watchEffect,
  type MaybeRefOrGetter,
} from "vue"

/**
 * Options for `useShortcut`. `layer` also takes a template ref.
 * @stable
 */
type UseShortcutOptions = Omit<ShortcutOptions, "layer"> & {
  /** An element inside a popup, a ref or a getter of one. The shortcut belongs to that popup. */
  layer?: MaybeRefOrGetter<Element | null | undefined>
}

/**
 * Registers a keyboard shortcut for the life of the component, in the shared
 * `shortcuts`. Keys can be a ref or a getter, and nothing registers for `null`.
 * Options can be a ref or a getter too, like `() => ({ scope: props.scope })`,
 * and it registers again when they change.
 * @stable
 */
function useShortcut(
  keys: MaybeRefOrGetter<string | null | undefined>,
  handler: ShortcutHandler,
  options: MaybeRefOrGetter<UseShortcutOptions> = {}
) {
  let off: (() => void) | undefined
  watchEffect(() => {
    off?.()
    off = undefined
    const current = toValue(keys)
    if (!current || typeof document === "undefined") {
      return
    }
    const { layer, ...rest } = toValue(options)
    off = shortcuts.register(current, handler, {
      ...rest,
      layer: layer === undefined ? undefined : () => toValue(layer),
    })
  })
  onScopeDispose(() => off?.())
}

/**
 * Keys formatted for this platform, like `⌘S` on Apple platforms and `Ctrl+S`
 * elsewhere, with the matching `aria-keyshortcuts`, as computed refs. The
 * server and the first client render use the same platform, so hydration
 * matches, and they update after mount. Keys can be a ref or a getter. The
 * text is wrapped in a left-to-right isolate, like `formatShortcut`'s.
 * @stable
 */
function useShortcutHint(keys: MaybeRefOrGetter<string>) {
  const apple = shallowRef(initialApple())
  onMounted(() => (apple.value = isApple()))
  return {
    text: computed(() => formatShortcut(toValue(keys), apple.value)),
    ariaKeyshortcuts: computed(() =>
      ariaKeyshortcuts(toValue(keys), apple.value)
    ),
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
