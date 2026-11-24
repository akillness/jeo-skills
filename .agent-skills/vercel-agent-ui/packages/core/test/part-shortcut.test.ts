import { afterEach, describe, expect, test, vi } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { bindPartShortcut } from "../src/foundation/shortcuts/shortcut-slot"
import { shortcuts } from "../src/foundation/shortcuts/shortcuts"
import { attrs, onProps, ref as partRef } from "../src/foundation/kernel/part"

// A trigger whose `shortcut` prop registers like Dialog's, Popover's and a command's.
const trigger = definePrimitive({
  name: "trigger",
  state: () => ({}),
  api: () => ({}),
  slots: (slot) => ({
    trigger: slot<{ shortcut?: string }>({
      props: { shortcut: "string" },
      bind: (el, part) =>
        bindPartShortcut(
          () => part.props.shortcut,
          () => {},
          { layer: el },
          (listener) => onProps(part, listener)
        ),
    }),
  }),
})

const element = () => ({ isConnected: true }) as unknown as HTMLElement

afterEach(() => vi.restoreAllMocks())

describe("a part's shortcut", () => {
  test("registers nothing while the part has none, so key presses never ask it", () => {
    const register = vi.spyOn(shortcuts, "register")
    const instance = trigger({ id: "t" })
    for (let index = 0; index < 100; index++) {
      const props = { id: `trigger-${index}` }
      attrs(instance.part("trigger", props))
      partRef(instance.part("trigger", props), { by: "core" })(element())
    }
    expect(register).not.toHaveBeenCalled()
  })

  test("registers when a render adds one, again when one changes it, and unregisters when one drops it", () => {
    const off = vi.fn()
    const register = vi.spyOn(shortcuts, "register").mockReturnValue(off)
    const instance = trigger({ id: "t" })
    partRef(instance.part("trigger", {}), { by: "core" })(element())
    attrs(instance.part("trigger", { shortcut: "mod+k" }))
    attrs(instance.part("trigger", { shortcut: "mod+k" }))
    expect(register.mock.calls.map(([keys]) => keys)).toEqual(["mod+k"])
    attrs(instance.part("trigger", { shortcut: "mod+j" }))
    expect(off).toHaveBeenCalledTimes(1)
    expect(register.mock.calls.map(([keys]) => keys)).toEqual([
      "mod+k",
      "mod+j",
    ])
    attrs(instance.part("trigger", {}))
    expect(off).toHaveBeenCalledTimes(2)
    expect(register).toHaveBeenCalledTimes(2)
  })

  test("unregisters when the part unbinds, and stops hearing its renders", () => {
    const off = vi.fn()
    const register = vi.spyOn(shortcuts, "register").mockReturnValue(off)
    const instance = trigger({ id: "t" })
    const ref = partRef(instance.part("trigger", { shortcut: "mod+k" }), {
      by: "core",
    })
    ref(element())
    ref(null)
    expect(off).toHaveBeenCalledTimes(1)
    attrs(instance.part("trigger", { shortcut: "mod+j" }))
    expect(register).toHaveBeenCalledTimes(1)
  })
})
