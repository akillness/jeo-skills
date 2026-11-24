import { afterEach, describe, expect, test } from "vitest"
import { dialog } from "../src/components/dialog/dialog"
import { setPlatform } from "../src/foundation/platform/platform"
import { drawer } from "../src/components/drawer/drawer"
import { popover } from "../src/components/popover/popover"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import type { PrimitiveInstance } from "../src/foundation/kernel/primitive-types"
import { shortcutSlot } from "../src/foundation/shortcuts/shortcut-slot"
import { tooltip } from "../src/components/tooltip/tooltip"
import { attrs, bind, partState } from "../src/foundation/kernel/part"

// A primitive with only a Shortcut part, whose keys default to `shortcut` in its options.
const hint = definePrimitive({
  name: "hint",
  options: { shortcut: "string" },
  state: (options: { shortcut?: string }) => ({
    apple: false,
    shortcut: options.shortcut,
  }),
  api: () => ({}),
  slots: (slot) => ({
    shortcut: shortcutSlot(slot, (state) => state.shortcut),
  }),
})

// The parts of an element the slot touches, without a DOM.
const element = (text = "") =>
  ({
    childNodes: text ? [text] : [],
    textContent: text,
    isConnected: true,
  }) as unknown as HTMLElement

const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve))

// The client turns out to be a Mac once the instance exists, as on a server-rendered page.
afterEach(() => setPlatform("other"))

describe("shortcut slot", () => {
  test("shows the keys with neutral names until the client binds, hidden from screen readers", () => {
    const instance = hint({ id: "h", shortcut: "mod+k" })
    expect(partState(instance.part("shortcut"))).toEqual({ text: "⁦Ctrl+K⁩" })
    expect(attrs(instance.part("shortcut"))["aria-hidden"]).toBe("true")
  })

  test("a part's own shortcut wins over the one it inherits", () => {
    const instance = hint({ id: "h", shortcut: "mod+k" })
    expect(
      partState(instance.part("shortcut", { shortcut: "mod+s" })).text
    ).toBe("⁦Ctrl+S⁩")
  })

  test("shows nothing without keys", () => {
    expect(partState(hint({ id: "h" }).part("shortcut")).text).toBe("")
  })

  test("switches to the client's platform a microtask after it binds", async () => {
    const instance = hint({ id: "h", shortcut: "mod+k" })
    setPlatform("apple")
    bind(instance.part("shortcut"), element())
    expect(partState(instance.part("shortcut")).text).toBe("⁦Ctrl+K⁩")
    await microtask()
    expect(partState(instance.part("shortcut")).text).toBe("⁦⌘K⁩")
  })

  test("an empty element shows the keys itself, follows the platform, and clears them when it unbinds", async () => {
    const instance = hint({ id: "h", shortcut: "mod+k" })
    const el = element()
    setPlatform("apple")
    const unbind = bind(instance.part("shortcut"), el)
    expect(el.textContent).toBe("⁦Ctrl+K⁩")
    await microtask()
    expect(el.textContent).toBe("⁦⌘K⁩")
    unbind()
    expect(el.textContent).toBe("")
  })

  test("an element with content of its own keeps it", () => {
    const el = element("Search")
    bind(hint({ id: "h", shortcut: "mod+k" }).part("shortcut"), el)()
    expect(el.textContent).toBe("Search")
  })
})

// Popups opened only through a controller have no trigger to learn the platform
// from, so the Shortcut part does it.
describe("a popup with no trigger", () => {
  const popups = { dialog, drawer, popover, tooltip }
  for (const [name, primitive] of Object.entries(popups)) {
    test(`a ${name}'s Shortcut part switches to the client's platform`, async () => {
      const instance: PrimitiveInstance = primitive({ id: name })
      setPlatform("apple")
      bind(instance.part("shortcut", { shortcut: "mod+s" }), element())
      await microtask()
      expect(
        partState(instance.part("shortcut", { shortcut: "mod+s" })).text
      ).toBe("⁦⌘S⁩")
    })
  }
})
