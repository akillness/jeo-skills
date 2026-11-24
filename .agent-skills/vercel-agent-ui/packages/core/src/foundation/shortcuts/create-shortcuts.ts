// One set of keyboard shortcuts with one key listener, scoped to the open layers.
import { dev, warn } from "#dev"
import {
  activeLayers,
  findLayer,
  inPersistentLayer,
  type Layer,
} from "../platform/layers"
import { isBrowser } from "../platform/env"
import {
  ariaKeyshortcuts,
  formatShortcut,
  hasCommandModifier,
  isApple,
  matchesShortcut,
} from "../platform/platform"
import { inPopupElement } from "../popups/popup-elements"
import { isComposing, on } from "../kernel/events"
import { isShortcutAllowed, isTypingIn, shortcutOrder } from "./shortcut-order"

/**
 * Runs when a shortcut's keys are pressed. The key press is already marked handled.
 * @stable
 */
type ShortcutHandler = (event: KeyboardEvent) => void

/**
 * Where and when a registered shortcut runs.
 * @stable
 */
type ShortcutOptions = {
  /**
   * A named scope, like `"editor"`. The shortcut runs only while `setScope(name, true)` is in effect.
   * @defaultValue undefined, so it runs in every scope
   */
  scope?: string
  /**
   * An element inside a popup, or a function that returns one. The shortcut belongs to that popup: it
   * runs only while the popup is open, and keeps running while a modal is open above the page. An
   * element on the page makes it a page shortcut, which a modal pauses. An element in a persistent
   * layer, like a toast region, keeps it running over every modal. A closed popup's content that
   * stays in the page, hidden, keeps it from running.
   * @defaultValue undefined, a page shortcut
   */
  layer?: Element | (() => Element | null | undefined)
  /**
   * Whether it runs while focus is in a text field. Shortcuts with Command, Control or Option
   * always do. Other keys typed into a field are text, so they don't run unless this is set.
   * @defaultValue false
   */
  allowInInput?: boolean
  /**
   * Whether it runs again while the keys are held down, like `j` moving through a list.
   * @defaultValue false, so it runs once per press
   */
  repeat?: boolean
  /** Checked each time the keys are pressed, and by `list()`. The shortcut runs only while it returns true. */
  when?: () => boolean
  /** What the shortcut does, for a help screen that lists them. */
  description?: string
}

/**
 * A registered shortcut, as `list()` describes it for a help screen.
 * @stable
 */
type ShortcutInfo = {
  /** The keys it was registered with, like `"mod+k"`. */
  keys: string
  /** The keys formatted for this platform: `⌘K` on Apple platforms and `Ctrl+K` elsewhere. */
  hint: string
  /** The keys as `aria-keyshortcuts` names them, like `"Meta+K"`. */
  ariaKeyshortcuts: string
  /** What it does, from `description`. */
  description?: string
  /** Its named scope, from `scope`. */
  scope?: string
}

/**
 * Keys like `"mod+k"`, or a function read on every key press, for keys that change. Nothing turns it off.
 * @stable
 */
type ShortcutKeys = string | (() => string | null | undefined)

type Entry = {
  keys: ShortcutKeys
  handler: ShortcutHandler
  options: ShortcutOptions
  id: number
}

const keysOf = (entry: Entry) =>
  (typeof entry.keys === "function" ? entry.keys() : entry.keys) || undefined

// Escape closes the topmost layer first, like an open tooltip, even when the
// layers started listening after the shortcuts did.
function escapesLayerAbove(order: number) {
  const top = activeLayers()
    .filter((layer) => (layer.el?.ownerDocument ?? document) === document)
    .at(-1)
  return !!top?.onEscape && (top.order ?? 0) > order
}

// The same keys on every platform, to tell conflicting registrations apart.
function normalize(keys: string) {
  return ariaKeyshortcuts(keys, true).split("+").sort().join("+")
}

/**
 * Creates a set of keyboard shortcuts with one key listener. The page has
 * one, the shared `shortcuts`, which components and apps register into.
 */
function createShortcuts() {
  const entries: Entry[] = []
  const scopes = new Set<string>()
  let next = 0
  let off: (() => void) | undefined

  function topBlocking() {
    return activeLayers()
      .filter((layer: Layer) => layer.blocking)
      .at(-1)?.order
  }

  // A shortcut's place among the layers, if it may run at all right now.
  function runnable(entry: Entry, blocking: number | undefined) {
    const { scope, when, layer } = entry.options
    if (scope !== undefined && !scopes.has(scope)) {
      return null
    }
    if (when && !when()) {
      return null
    }
    const order = shortcutOrder(
      layer,
      findLayer,
      inPersistentLayer,
      inPopupElement
    )
    return isShortcutAllowed(order, blocking) ? order : null
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || isComposing(event)) {
      return
    }
    // Read only once some keys match, so typing that matches nothing allocates nothing.
    let context: { typing: boolean; blocking: number | undefined } | undefined
    let best: { entry: Entry; order: number } | undefined
    const apple = isApple()
    for (const entry of entries) {
      const keys = keysOf(entry)
      if (
        !keys ||
        (event.repeat && !entry.options.repeat) ||
        !matchesShortcut(event, keys, apple)
      ) {
        continue
      }
      context ??= {
        typing: isTypingIn(event.composedPath()[0]),
        blocking: topBlocking(),
      }
      if (
        context.typing &&
        !entry.options.allowInInput &&
        !hasCommandModifier(keys)
      ) {
        continue
      }
      const order = runnable(entry, context.blocking)
      if (order === null) {
        continue
      }
      // The topmost layer's shortcut wins, then the newest registration.
      if (
        !best ||
        order > best.order ||
        (order === best.order && entry.id > best.entry.id)
      ) {
        best = { entry, order }
      }
    }
    if (!best || (event.key === "Escape" && escapesLayerAbove(best.order))) {
      return
    }
    event.preventDefault()
    best.entry.handler(event)
  }

  function listen() {
    if (off || !isBrowser) {
      return
    }
    off = on(document, "keydown", onKeydown)
  }

  return {
    /**
     * Registers a shortcut, like `register("mod+k", openSearch)`. Keys are
     * `+`-separated: `mod` is Command on Apple platforms and Control elsewhere.
     * Returns a function that unregisters it.
     */
    register(
      keys: ShortcutKeys,
      handler: ShortcutHandler,
      options: ShortcutOptions = {}
    ) {
      const key = typeof keys === "string" ? normalize(keys) : undefined
      // Development builds only, so production skips the scan.
      const clash =
        dev &&
        key !== undefined &&
        !options.when &&
        entries.some(
          (entry) =>
            typeof entry.keys === "string" &&
            normalize(entry.keys) === key &&
            entry.options.scope === options.scope &&
            entry.options.layer === options.layer &&
            !entry.options.when
        )
      if (clash) {
        warn(
          `The shortcut "${keys}" is registered twice in the same scope. The newest one wins.`
        )
      }
      const entry = { keys, handler, options, id: next++ }
      entries.push(entry)
      listen()
      return () => {
        const index = entries.indexOf(entry)
        if (index !== -1) {
          entries.splice(index, 1)
        }
        if (!entries.length) {
          off?.()
          off = undefined
        }
      }
    },
    /** The shortcuts that would run now, oldest first, formatted for this platform. For a help screen. */
    list() {
      const blocking = isBrowser ? topBlocking() : undefined
      const apple = isApple()
      return entries
        .filter(
          (entry) => !!keysOf(entry) && runnable(entry, blocking) !== null
        )
        .map((entry) => ({
          keys: keysOf(entry)!,
          hint: formatShortcut(keysOf(entry)!, apple),
          ariaKeyshortcuts: ariaKeyshortcuts(keysOf(entry)!, apple),
          description: entry.options.description,
          scope: entry.options.scope,
        }))
    },
    /** Turns a named scope on or off. Shortcuts registered with that `scope` run only while it's on. */
    setScope(name: string, active: boolean) {
      if (active) {
        scopes.add(name)
      } else {
        scopes.delete(name)
      }
    },
    /** Whether a named scope is on. */
    isScopeActive: (name: string) => scopes.has(name),
    /** Unregisters every shortcut and stops listening. */
    destroy() {
      entries.length = 0
      scopes.clear()
      off?.()
      off = undefined
    },
  }
}

export {
  createShortcuts,
  type ShortcutHandler,
  type ShortcutInfo,
  type ShortcutKeys,
  type ShortcutOptions,
}
