import { describe, expect, test, vi } from "vitest"
import {
  ariaKeyshortcuts,
  formatShortcut,
  matchesShortcut,
} from "../src/foundation/platform/platform"
import {
  isShortcutAllowed,
  isTypingIn,
  shortcutOrder,
} from "../src/foundation/shortcuts/shortcut-order"
import { hasCommandModifier } from "../src/foundation/platform/platform"
import { createShortcuts } from "../src/foundation/shortcuts/create-shortcuts"

// The shape of a keydown event that matching reads.
function key(init: {
  key: string
  code?: string
  meta?: boolean
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
}) {
  return {
    key: init.key,
    code: init.code ?? "",
    metaKey: !!init.meta,
    ctrlKey: !!init.ctrl,
    altKey: !!init.alt,
    shiftKey: !!init.shift,
  } as KeyboardEvent
}

// Shortcut text without its left-to-right isolate.
const plain = (text: string) => text.replace(/[⁦⁩]/g, "")

describe("matching shortcuts", () => {
  test("a keydown with no key, like Chrome's autofill sends, matches nothing", () => {
    const autofill = new Event("keydown") as KeyboardEvent
    expect(matchesShortcut(autofill, "f6", true)).toBe(false)
    expect(matchesShortcut(autofill, "mod+k", false)).toBe(false)
  })

  test("letters match the typed key, case-insensitively", () => {
    expect(
      matchesShortcut(
        key({ key: "n", code: "KeyN", meta: true }),
        "mod+n",
        true
      )
    ).toBe(true)
    expect(
      matchesShortcut(
        key({ key: "N", code: "KeyN", ctrl: true, shift: true }),
        "mod+shift+n",
        false
      )
    ).toBe(true)
  })

  test("the same keys parsed for one platform still match the other's", () => {
    const command = key({ key: "k", code: "KeyK", meta: true })
    const control = key({ key: "k", code: "KeyK", ctrl: true })
    expect(matchesShortcut(command, "mod+k", true)).toBe(true)
    expect(matchesShortcut(command, "mod+k", false)).toBe(false)
    expect(matchesShortcut(control, "mod+k", false)).toBe(true)
    expect(matchesShortcut(control, "mod+k", true)).toBe(false)
  })

  test("Option shortcuts on a Mac match by physical key", () => {
    expect(
      matchesShortcut(key({ key: "˜", code: "KeyN", alt: true }), "alt+n", true)
    ).toBe(true)
    expect(
      matchesShortcut(
        key({ key: "Dead", code: "KeyN", alt: true }),
        "alt+n",
        true
      )
    ).toBe(true)
    expect(
      matchesShortcut(
        key({ key: "¡", code: "Digit1", alt: true }),
        "alt+1",
        true
      )
    ).toBe(true)
  })

  test("other alphabets match by physical key", () => {
    expect(
      matchesShortcut(
        key({ key: "т", code: "KeyN", ctrl: true }),
        "mod+n",
        false
      )
    ).toBe(true)
  })

  test("a Latin letter matches by what it types, so other layouts keep their letters", () => {
    // AZERTY: the key in QWERTY's A position types "q".
    expect(
      matchesShortcut(
        key({ key: "q", code: "KeyA", ctrl: true }),
        "mod+a",
        false
      )
    ).toBe(false)
    expect(
      matchesShortcut(
        key({ key: "a", code: "KeyQ", ctrl: true }),
        "mod+a",
        false
      )
    ).toBe(true)
  })

  test("shifted digits match by physical key", () => {
    expect(
      matchesShortcut(
        key({ key: "!", code: "Digit1", shift: true }),
        "shift+1",
        false
      )
    ).toBe(true)
  })

  test("other keys match by name, with aliases", () => {
    expect(
      matchesShortcut(
        key({ key: "Backspace", code: "Backspace", meta: true }),
        "mod+backspace",
        true
      )
    ).toBe(true)
    expect(matchesShortcut(key({ key: "Escape" }), "esc", true)).toBe(true)
    expect(
      matchesShortcut(key({ key: "ArrowUp", alt: true }), "alt+up", true)
    ).toBe(true)
    expect(
      matchesShortcut(
        key({ key: " ", code: "Space", ctrl: true }),
        "ctrl+space",
        true
      )
    ).toBe(true)
    expect(
      matchesShortcut(
        key({ key: "/", code: "Slash", meta: true }),
        "mod+/",
        true
      )
    ).toBe(true)
  })

  test("modifiers must match exactly", () => {
    expect(
      matchesShortcut(
        key({ key: "n", code: "KeyN", meta: true, shift: true }),
        "mod+n",
        true
      )
    ).toBe(false)
    expect(
      matchesShortcut(key({ key: "n", code: "KeyN" }), "mod+n", true)
    ).toBe(false)
    expect(
      matchesShortcut(
        key({ key: "m", code: "KeyM", meta: true }),
        "mod+n",
        true
      )
    ).toBe(false)
  })
})

describe("formatting shortcuts", () => {
  test("Apple platforms show glyphs", () => {
    expect(plain(formatShortcut("mod+shift+n", true))).toBe("⌘⇧N")
    expect(plain(formatShortcut("mod+n", true))).toBe("⌘N")
    expect(plain(formatShortcut("alt+n", true))).toBe("⌥N")
    expect(plain(formatShortcut("mod+backspace", true))).toBe("⌘⌫")
    expect(plain(formatShortcut("delete", true))).toBe("⌦")
    expect(plain(formatShortcut("shift+enter", true))).toBe("⇧↩")
    expect(plain(formatShortcut("esc", true))).toBe("⎋")
    expect(plain(formatShortcut("ctrl+tab", true))).toBe("⌃⇥")
    expect(plain(formatShortcut("alt+up", true))).toBe("⌥↑")
    expect(plain(formatShortcut("mod+down", true))).toBe("⌘↓")
    expect(plain(formatShortcut("mod+left", true))).toBe("⌘←")
    expect(plain(formatShortcut("mod+right", true))).toBe("⌘→")
    expect(plain(formatShortcut("ctrl+space", true))).toBe("⌃␣")
  })

  test("other platforms show readable names", () => {
    expect(plain(formatShortcut("mod+n", false))).toBe("Ctrl+N")
    expect(plain(formatShortcut("mod+backspace", false))).toBe("Ctrl+Backspace")
    expect(plain(formatShortcut("delete", false))).toBe("Del")
    expect(plain(formatShortcut("shift+enter", false))).toBe("Shift+Enter")
    expect(plain(formatShortcut("esc", false))).toBe("Esc")
    expect(plain(formatShortcut("ctrl+tab", false))).toBe("Ctrl+Tab")
    expect(plain(formatShortcut("alt+up", false))).toBe("Alt+Up")
    expect(plain(formatShortcut("ctrl+space", false))).toBe("Ctrl+Space")
  })

  test("the text is isolated left to right, so right-to-left layouts don't reorder it", () => {
    expect(formatShortcut("mod+n", true)).toBe("⁦⌘N⁩")
    expect(formatShortcut("mod+n", false)).toBe("⁦Ctrl+N⁩")
  })

  test("aria-keyshortcuts uses standard key names", () => {
    expect(ariaKeyshortcuts("mod+backspace", true)).toBe("Meta+Backspace")
    expect(ariaKeyshortcuts("option+esc", false)).toBe("Alt+Escape")
    expect(ariaKeyshortcuts("cmd+up", false)).toBe("Meta+ArrowUp")
    expect(ariaKeyshortcuts("shift+space", true)).toBe("Shift+Space")
  })

  test("a shortcut with no keys formats as nothing", () => {
    for (const apple of [true, false]) {
      expect(formatShortcut("", apple)).toBe("")
      expect(ariaKeyshortcuts("", apple)).toBe("")
    }
  })
})

describe("the shortcut manager", () => {
  test("a page shortcut runs until a modal opens, and a modal's own shortcut keeps running", () => {
    expect(isShortcutAllowed(0, undefined)).toBe(true)
    expect(isShortcutAllowed(0, 3)).toBe(false)
    expect(isShortcutAllowed(3, 3)).toBe(true)
    expect(isShortcutAllowed(4, 3)).toBe(true)
    expect(isShortcutAllowed(2, 3)).toBe(false)
  })

  test("a shortcut of a closed popup never runs", () => {
    expect(isShortcutAllowed(null, undefined)).toBe(false)
    const gone = { isConnected: false } as Element
    expect(shortcutOrder(gone, () => ({ order: 2 }))).toBe(null)
    expect(
      shortcutOrder(
        () => null,
        () => ({ order: 2 })
      )
    ).toBe(null)
  })

  test("a shortcut takes the order of the layer its element is in, or the page's", () => {
    const el = { isConnected: true } as Element
    expect(shortcutOrder(undefined, () => ({ order: 5 }))).toBe(0)
    expect(shortcutOrder(el, () => ({ order: 5 }))).toBe(5)
    expect(
      shortcutOrder(
        () => el,
        () => undefined
      )
    ).toBe(0)
  })

  test("a shortcut that belongs to a closed popup still in the page doesn't run", () => {
    const el = { isConnected: true } as Element
    const closed = () => undefined
    expect(
      shortcutOrder(
        el,
        closed,
        () => false,
        () => true
      )
    ).toBe(null)
    expect(
      shortcutOrder(
        el,
        () => ({ order: 3 }),
        () => false,
        () => true
      )
    ).toBe(3)
  })

  test("shortcuts with Command, Control or Option run in text fields, plain keys don't", () => {
    expect(hasCommandModifier("mod+k")).toBe(true)
    expect(hasCommandModifier("alt+n")).toBe(true)
    expect(hasCommandModifier("ctrl+shift+p")).toBe(true)
    expect(hasCommandModifier("/")).toBe(false)
    expect(hasCommandModifier("shift+g")).toBe(false)
  })

  test("text fields take letters, other controls don't", () => {
    const input = (type: string) =>
      ({ tagName: "INPUT", type }) as unknown as EventTarget
    expect(isTypingIn(input("text"))).toBe(true)
    expect(isTypingIn(input("search"))).toBe(true)
    expect(isTypingIn(input("checkbox"))).toBe(false)
    expect(isTypingIn({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(
      true
    )
    expect(
      isTypingIn({
        tagName: "DIV",
        isContentEditable: true,
      } as unknown as EventTarget)
    ).toBe(true)
    expect(isTypingIn({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(
      false
    )
    expect(isTypingIn(null)).toBe(false)
  })

  test("list() describes what would run now, formatted for the platform", () => {
    const set = createShortcuts()
    const off = set.register("mod+k", () => {}, { description: "Search" })
    set.register("mod+s", () => {}, { scope: "editor" })
    set.register("g", () => {}, { when: () => false })
    expect(set.list().map(({ keys }) => keys)).toEqual(["mod+k"])
    const [search] = set.list()
    expect(search.description).toBe("Search")
    expect(search.ariaKeyshortcuts).toMatch(/^(Meta|Control)\+K$/)
    expect(plain(search.hint)).toMatch(/^(⌘K|Ctrl\+K)$/)
    set.setScope("editor", true)
    expect(set.list().map(({ keys }) => keys)).toEqual(["mod+k", "mod+s"])
    off()
    expect(set.list().map(({ keys }) => keys)).toEqual(["mod+s"])
    set.destroy()
    expect(set.list()).toEqual([])
  })

  test("registering the same keys twice in one scope warns", () => {
    const set = createShortcuts()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    set.register("mod+k", () => {})
    set.register("Meta+K", () => {}, { scope: "other" })
    expect(warn).not.toHaveBeenCalled()
    set.register("mod+k", () => {})
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
    set.destroy()
  })

  test("the same keys registered with a condition don't warn, since the condition picks one", () => {
    const set = createShortcuts()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    set.register("mod+k", () => {})
    set.register("mod+k", () => {}, { when: () => true })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    set.destroy()
  })
})
