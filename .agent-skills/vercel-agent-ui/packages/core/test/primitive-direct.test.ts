import { describe, expect, test } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { attrs, bind, directNames, ref } from "../src/foundation/kernel/part"
import { direct } from "../src/foundation/kernel/live"

// Items a query hides, with `hidden` written by core, like a combobox's options.
const filtered = definePrimitive({
  name: "filtered",
  options: { query: "string" },
  state: (options: { query?: string }) => ({ query: options.query ?? "" }),
  sync: (options) => ({ query: options.query ?? "" }),
  api: () => ({}),
  slots: (slot) => ({
    item: slot<{ label: string }>({
      props: { label: "string" },
      attrs: (state, { props }) => ({
        role: "option",
        hidden: props.label.includes(state.query) ? undefined : "",
      }),
      direct: direct(["hidden"]),
    }),
  }),
})

// The attribute methods core calls on an element. Adapters that render through
// a framework bind it as `{ by: "framework" }`, since they attach handlers themselves.
// Its document has no head, so the rule that keeps hidden parts hidden isn't written.
function element(initial: Record<string, string> = {}) {
  const attributes = new Map(Object.entries(initial))
  return {
    isConnected: true,
    ownerDocument: {},
    attributes,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  }
}

describe("direct attributes", () => {
  test("render, so the server and every render have them", () => {
    const instance = filtered({ id: "f", query: "an" })
    expect(
      attrs(instance.part("item", { id: "a", label: "Apple" })).hidden
    ).toBe("")
    expect(
      attrs(instance.part("item", { id: "b", label: "Banana" })).hidden
    ).toBeUndefined()
    expect(directNames(instance.part("item"))).toEqual(["hidden"])
  })

  test("follow state on an element a framework rendered, without a render", () => {
    const instance = filtered({ id: "f" })
    const props = { id: "a", label: "Apple" }
    attrs(instance.part("item", props))
    const el = element({ role: "option" })
    ref(instance.part("item", props), { by: "framework", attaches: "all" })(
      el as unknown as HTMLElement
    )
    instance.setOptions({ id: "f", query: "x" })
    expect(el.getAttribute("hidden")).toBe("")
    instance.setOptions({ id: "f", query: "pp" })
    expect(el.getAttribute("hidden")).toBeNull()
  })

  test("are removed when the framework wrote them, not core", () => {
    const instance = filtered({ id: "f", query: "x" })
    const props = { id: "a", label: "Apple" }
    // Rendered hidden, as the server would.
    const el = element({
      role: "option",
      hidden: attrs(instance.part("item", props)).hidden!,
    })
    ref(instance.part("item", props), { by: "framework", attaches: "all" })(
      el as unknown as HTMLElement
    )
    instance.setOptions({ id: "f", query: "" })
    expect(el.getAttribute("hidden")).toBeNull()
  })

  test("are removed from an element a framework reuses for a part that doesn't have them", () => {
    const instance = filtered({ id: "f" })
    const apple = { id: "a", label: "Apple" }
    const banana = { id: "b", label: "Banana" }
    attrs(instance.part("item", apple))
    const el = element({ role: "option" })
    const unbind = ref(instance.part("item", apple), {
      by: "framework",
      attaches: "all",
    })
    unbind(el as unknown as HTMLElement)
    instance.setOptions({ id: "f", query: "pp" })
    instance.setOptions({ id: "f", query: "x" })
    expect(el.getAttribute("hidden")).toBe("")
    unbind(null)
    instance.setOptions({ id: "f", query: "an" })
    attrs(instance.part("item", banana))
    ref(instance.part("item", banana), { by: "framework", attaches: "all" })(
      el as unknown as HTMLElement
    )
    expect(el.getAttribute("hidden")).toBeNull()
  })

  test("are left to elements core renders, like web components, which write every attribute", () => {
    const instance = filtered({ id: "f" })
    const props = { id: "a", label: "Apple" }
    const el = element()
    bind(instance.part("item", props), el as unknown as HTMLElement)
    instance.setOptions({ id: "f", query: "x" })
    expect(el.getAttribute("hidden")).toBeNull()
  })
})
