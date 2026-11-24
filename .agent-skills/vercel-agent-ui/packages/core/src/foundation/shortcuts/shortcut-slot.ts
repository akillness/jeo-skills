// The Shortcut part Dialog, Drawer, Popover and Tooltip share: the keys of a
// shortcut, for people to see. Screen readers hear `aria-keyshortcuts` on the
// trigger instead, so the part is hidden from them.
import { formatShortcut, isApple } from "../platform/platform"
import { elements } from "../kernel/elements"
import type { Part, SlotFactory } from "../kernel/primitive-types"
import type { Store } from "../kernel/store"
import {
  shortcuts,
  type ShortcutHandler,
  type ShortcutOptions,
} from "./shortcuts"

// What a Shortcut part shows: "⌘K" on Apple platforms, "Ctrl+K" elsewhere,
// and nothing without keys.
function shortcutText(shortcut: string | undefined, apple: boolean) {
  return shortcut ? formatShortcut(shortcut, apple) : ""
}

// Switches shortcut names to the client's platform once an element binds.
// Servers and the first client render use neutral names, so a microtask lets
// hydration finish first.
function adoptPlatform<State extends { apple: boolean }>(store: Store<State>) {
  // A cast, since TypeScript can't tell that `apple` alone is a Partial<State>.
  queueMicrotask(
    () =>
      store.get().apple !== isApple() &&
      store.set({ apple: isApple() } as Partial<State>)
  )
}

// Registers the shortcut a part's props name while they name one, and again
// whenever they change it (`onProps` from the part's `bind`). A page of
// triggers without shortcuts then costs a key press nothing, where reading
// every trigger's props on every key press grew with the triggers.
function bindPartShortcut(
  keys: () => string | null | undefined,
  handler: ShortcutHandler,
  options: ShortcutOptions,
  onProps: (listener: () => void) => () => void
) {
  let current: string | undefined
  let off: (() => void) | undefined
  const update = () => {
    const next = keys() || undefined
    if (next === current) {
      return
    }
    off?.()
    current = next
    off = next ? shortcuts.register(next, handler, options) : undefined
  }
  update()
  const unwatch = onProps(update)
  return () => {
    unwatch()
    off?.()
  }
}

// The shortcut of the part of `slot` an element sits in, like the trigger or
// command a Shortcut part renders inside. With `beside`, a part in the
// element's parent counts too, like a trigger next to its Shortcut part.
function shortcutOf(
  context: { parts(): Iterable<Part> },
  slot: string,
  el: HTMLElement,
  { beside = false } = {}
) {
  const owner = elements<{ shortcut?: string }>(context, slot).find(
    (entry) =>
      entry.el.contains(el) ||
      (beside && !!el.parentElement?.contains(entry.el))
  )
  return owner?.props?.shortcut
}

// `inherited` names the keys a part without its own `shortcut` shows, like the
// shortcut of the trigger it sits in. Renders call it without an element.
function shortcutSlot<State extends { apple: boolean }, Api>(
  slot: SlotFactory<State, Api>,
  inherited: (state: State, api: Api, el?: HTMLElement) => string | undefined
) {
  return slot<
    {
      /** The keys to show, like `"mod+s"`. By default, the shortcut of its trigger or component. */
      shortcut?: string
    },
    { text: string }
  >({
    props: { shortcut: "string" },
    state: (state, { props, api }) => ({
      text: shortcutText(props.shortcut ?? inherited(state, api), state.apple),
    }),
    attrs: () => ({ "aria-hidden": "true", translate: "no" }),
    bind(el, { store, api, props }) {
      // A popup opened only through a controller has no trigger to learn the platform from.
      adoptPlatform(store)
      // An empty element shows the keys itself, like a web component without children.
      if (el.childNodes.length) {
        return
      }
      const write = () => {
        const state = store.get()
        el.textContent = shortcutText(
          props.shortcut ?? inherited(state, api, el),
          state.apple
        )
      }
      write()
      const off = store.subscribe(write)
      return () => {
        off()
        el.textContent = ""
      }
    },
  })
}

export { adoptPlatform, bindPartShortcut, shortcutOf, shortcutSlot }
