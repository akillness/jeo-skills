import { isBrowser } from "./env"

/**
 * The top layer (the popover attribute) keeps popups above everything without
 * portals. Older browsers lack it, and adapters portal to the body instead.
 * @stable
 */
function supportsTopLayer() {
  return isBrowser && typeof HTMLElement.prototype.showPopover === "function"
}

/**
 * Where a popup should render. An explicit container wins. Without top layer
 * support, the body. Otherwise null: render in place.
 */
function portalTarget(container?: Element | DocumentFragment | null) {
  if (container) {
    return container
  }
  if (isBrowser && !supportsTopLayer()) {
    return document.body
  }
  return null
}

// The focused element, inside shadow roots too.
function activeElement(doc = document) {
  let active = doc.activeElement
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }
  return active as HTMLElement | null
}

// The node, then each element it shows through in an outer tree: the slot
// it's assigned to and the host of its shadow root. An element in an outer
// tree holds the node when it holds one of these.
function composedHops(node: Node) {
  const hops = [node]
  let at: Node | null | undefined = node
  while (at) {
    const next: Node | null | undefined =
      (at as Element).assignedSlot ??
      at.parentNode ??
      (at as Partial<ShadowRoot>).host
    if (next && next !== at.parentNode) {
      hops.push(next)
    }
    at = next
  }
  return hops
}

// Whether `container` holds `node`, across shadow roots, like a button in the
// shadow root of a custom element inside a popup. `Node.contains` stops at them.
function composedContains(container: Node, node: Node) {
  return composedHops(node).some((hop) => container.contains(hop))
}

// The nearest element around `node` that matches `selector`, across shadow
// roots, like an item around a custom element's own label. `closest` stops at them.
function composedClosest<T extends Element>(node: Node, selector: string) {
  for (const hop of composedHops(node)) {
    const found = (hop as Element).closest?.<T>(selector)
    if (found) {
      return found
    }
  }
  return null
}

// Whether the user asked for less motion. Animations jump instead.
function prefersReducedMotion() {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

let platformOverride: "apple" | "other" | undefined

/**
 * Overrides platform detection for shortcuts and their labels, like in tests or on the server.
 * @stable
 */
function setPlatform(platform: "apple" | "other") {
  platformOverride = platform
}

let apple: boolean | undefined

function isApple() {
  if (platformOverride) {
    return platformOverride === "apple"
  }
  return (apple ??=
    isBrowser &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent))
}

// What to assume before the client is known. Servers render this, and the
// first client render matches it, so hydration never sees a mismatch.
function initialApple() {
  return platformOverride === "apple"
}

const keyNames: Record<string, string> = {
  alt: "Alt",
  option: "Alt",
  opt: "Alt",
  shift: "Shift",
  ctrl: "Control",
  control: "Control",
  cmd: "Meta",
  command: "Meta",
  meta: "Meta",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  enter: "Enter",
  return: "Enter",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  space: "Space",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
}

/**
 * "mod+shift+n" becomes "Meta+Shift+N" on Apple platforms and "Control+Shift+N" elsewhere.
 * @stable
 */
function ariaKeyshortcuts(shortcut: string, apple = isApple()) {
  return shortcut
    .split("+")
    .map((key) => {
      const lower = key.toLowerCase()
      if (lower === "mod") {
        return apple ? "Meta" : "Control"
      }
      if (keyNames[lower]) {
        return keyNames[lower]
      }
      return key.length > 1
        ? key[0].toUpperCase() + key.slice(1)
        : key.toUpperCase()
    })
    .join("+")
}

const appleGlyphs: Record<string, string> = {
  Meta: "⌘",
  Control: "⌃",
  Alt: "⌥",
  Shift: "⇧",
  Backspace: "⌫",
  Delete: "⌦",
  Enter: "↩",
  Escape: "⎋",
  Tab: "⇥",
  Space: "␣",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "⇞",
  PageDown: "⇟",
  Home: "↖",
  End: "↘",
}

const names: Record<string, string> = {
  Control: "Ctrl",
  Delete: "Del",
  Escape: "Esc",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
}

/**
 * What to show next to an item: "⌘N" on Apple platforms, "Ctrl+N" elsewhere.
 * The text is wrapped in a left-to-right isolate, so a right-to-left layout
 * never reorders it into "N⌘".
 * @stable
 */
function formatShortcut(shortcut: string, apple = isApple()) {
  const aria = ariaKeyshortcuts(shortcut, apple)
  if (!aria) {
    return ""
  }
  const keys = aria.split("+")
  const text = apple
    ? keys.map((key) => appleGlyphs[key] ?? key).join("")
    : keys.map((key) => names[key] ?? key).join("+")
  return `\u2066${text}\u2069`
}

// Letters and digits match by physical key, through `event.code`, when the
// typed character isn't the key itself. Option+N on a Mac types "˜", and other
// alphabets type their own letters. Every other key matches by `event.key`.
function matchesKey(event: KeyboardEvent, key: string) {
  const typed = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (key === "Space") {
    return typed === " "
  }
  if (!/^[A-Z0-9]$/.test(key)) {
    return typed.toLowerCase() === key.toLowerCase()
  }
  if (typed === key.toLowerCase()) {
    return true
  }
  // A Latin letter or digit that isn't this key is another key on this layout.
  if (/^[a-z0-9]$/.test(typed)) {
    return false
  }
  return event.code === (/\d/.test(key) ? `Digit${key}` : `Key${key}`)
}

const parsed = [new Map<string, string[]>(), new Map<string, string[]>()]

/**
 * Whether a key press matches a shortcut like `"mod+k"`. `mod` is Command on
 * Apple platforms and Control elsewhere, and letters match by physical key
 * when the layout types another character, like Option+N on a Mac.
 * @experimental
 */
function matchesShortcut(
  event: KeyboardEvent,
  shortcut: string,
  apple = isApple()
) {
  // Chrome's autofill sends a keydown that isn't a KeyboardEvent, with no key.
  if (typeof event.key !== "string") {
    return false
  }
  const cache = parsed[+apple]
  let keys = cache.get(shortcut)
  if (!keys) {
    cache.set(shortcut, (keys = ariaKeyshortcuts(shortcut, apple).split("+")))
  }
  return (
    matchesKey(event, keys.at(-1)!) &&
    event.metaKey === keys.includes("Meta") &&
    event.ctrlKey === keys.includes("Control") &&
    event.altKey === keys.includes("Alt") &&
    event.shiftKey === keys.includes("Shift")
  )
}

// Whether a shortcut holds Command, Control or Option, so it can't be typing.
function hasCommandModifier(keys: string) {
  return /(^|\+)(Meta|Control|Alt)(\+|$)/.test(ariaKeyshortcuts(keys, true))
}

export {
  activeElement,
  ariaKeyshortcuts,
  composedClosest,
  composedContains,
  composedHops,
  formatShortcut,
  hasCommandModifier,
  initialApple,
  isApple,
  matchesShortcut,
  portalTarget,
  prefersReducedMotion,
  setPlatform,
  supportsTopLayer,
}
