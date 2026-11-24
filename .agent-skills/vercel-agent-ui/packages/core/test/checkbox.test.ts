// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest"
import { checkbox, checkboxGroup } from "../src/components/checkbox/checkbox"
import { bind } from "../src/foundation/kernel/part"

// Stands in for a checkbox element at a place in the document.
function fakeElement(position: number) {
  const el = {
    id: "",
    isConnected: true,
    focus: vi.fn(),
    // Node.DOCUMENT_POSITION_FOLLOWING and PRECEDING, for elements that aren't in the document.
    compareDocumentPosition: (other: { position: number }) =>
      other.position > position ? 4 : 2,
    position,
  }
  return el as unknown as HTMLElement & { focus: ReturnType<typeof vi.fn> }
}

const flush = () =>
  new Promise((resolve) => queueMicrotask(() => resolve(undefined)))

describe("checkbox group", () => {
  test("focus goes to the first enabled checkbox in the document, not the first to join", async () => {
    const group = checkboxGroup({ id: "g" })
    const later = fakeElement(2)
    const earlier = fakeElement(1)
    const disabledFirst = fakeElement(0)
    group.api.register("later", later, () => false)
    // These two mount after it, but sit before it on the page.
    group.api.register("earlier", earlier, () => false)
    group.api.register("disabled", disabledFirst, () => true)
    await flush()
    group.api.focus()
    expect(earlier.focus).toHaveBeenCalledOnce()
    expect(later.focus).not.toHaveBeenCalled()
    expect(disabledFirst.focus).not.toHaveBeenCalled()
    expect(group.api.internal.anchor()).toBe(earlier)
  })

  test("a child's press reaches its own callback after the group's", () => {
    const calls: string[] = []
    const group = checkboxGroup({
      id: "g",
      onValueChange: (value) => calls.push(`group:${value}`),
    })
    const child = checkbox({
      id: "c",
      value: "a",
      group: () => group.api,
      onCheckedChange: (checked, details) =>
        calls.push(`child:${checked}:${details.reason}`),
    })
    child.api.toggle({ reason: "press" })
    expect(calls).toEqual(["group:a", "child:true:press"])
  })

  test("a required group counts only the checked checkboxes that submit, not disabled or missing ones", async () => {
    const group = checkboxGroup({
      id: "g",
      required: true,
      defaultValue: ["cheese", "ghost"],
    })
    const input = document.body.appendChild(document.createElement("input"))
    const unbind = bind(group.part("group-input"), input)
    const options = { id: "c", value: "cheese", group: () => group.api }
    const cheese = checkbox(options)
    const unbindCheese = bind(
      cheese.part("root"),
      document.body.appendChild(document.createElement("button"))
    )
    await flush()
    expect(input.checked).toBe(true)
    cheese.setOptions({ ...options, disabled: true })
    await flush()
    expect(input.checked).toBe(false)
    cheese.setOptions(options)
    await flush()
    expect(input.checked).toBe(true)
    unbindCheese?.()
    unbind?.()
    document.body.replaceChildren()
  })

  test("a checkbox whose value changes counts under its new value", async () => {
    const group = checkboxGroup({
      id: "g",
      required: true,
      defaultValue: ["olives"],
    })
    const input = document.body.appendChild(document.createElement("input"))
    const unbind = bind(group.part("group-input"), input)
    const options = { id: "c", value: "cheese", group: () => group.api }
    const child = checkbox(options)
    const unbindChild = bind(
      child.part("root"),
      document.body.appendChild(document.createElement("button"))
    )
    await flush()
    expect(input.checked).toBe(false)
    child.setOptions({ ...options, value: "olives" })
    await flush()
    expect(input.checked).toBe(true)
    unbindChild?.()
    unbind?.()
    document.body.replaceChildren()
  })
})

describe("checkbox group debug", () => {
  test("logs under its own name, not a checkbox's", () => {
    const log = vi.spyOn(console, "debug").mockImplementation(() => {})
    const group = checkboxGroup({ id: "g", debug: true })
    group.api.setValue(["a"])
    expect(String(log.mock.calls[0]?.[0])).toContain(
      "[ui-sdk] checkbox-group#g value: a (imperative"
    )
    log.mockRestore()
  })
})
