import { afterEach, describe, expect, test, vi } from "vitest"
import { input, inputGroup } from "../src/components/input/input"
import { bind as partBind, present } from "../src/foundation/kernel/part"

const settle = () => new Promise((resolve) => setTimeout(resolve))

// Stands in for MutationObserver, which Node doesn't have, and records what each one watches.
const observers: { target?: unknown; disconnected: boolean }[] = []
class FakeObserver {
  record: { target?: unknown; disconnected: boolean } = { disconnected: false }
  constructor() {
    observers.push(this.record)
  }
  observe(target: unknown) {
    this.record.target = target
  }
  disconnect() {
    this.record.disconnected = true
  }
}

// Stands in for an <input>, with `value` on its prototype like the real one.
class FakeField {
  #value = "Ada"
  get value() {
    return this.#value
  }
  set value(value: string) {
    this.#value = value
  }
  disabled = false
  readOnly = false
  form = null
  isConnected = true
  parentElement = null
  ownerDocument = { addEventListener: () => {}, removeEventListener: () => {} }
  addEventListener() {}
  removeEventListener() {}
}

function setup() {
  vi.stubGlobal("MutationObserver", FakeObserver)
  const field = new FakeField()
  const group = {
    isConnected: true,
    querySelector: () => field,
    hasAttribute: () => false,
  } as unknown as HTMLElement
  const instance = inputGroup({ id: "g" })
  const bind = () =>
    partBind(instance.part("group", {}), group, {
      by: "framework",
      attaches: "all",
    })
  const watching = () =>
    observers.filter((o) => o.target === field && !o.disconnected).length
  return { field, instance, bind, watching }
}

afterEach(() => {
  observers.length = 0
  vi.unstubAllGlobals()
})

describe("input group", () => {
  test("finds its field a microtask after binding, and shows the clear button while it has text", async () => {
    const { instance, bind, watching } = setup()
    expect(present(instance.part("clear"))).toBe(false)
    const unbind = bind()
    await settle()
    expect(watching()).toBe(1)
    expect(present(instance.part("clear"))).toBe(true)
    unbind()
    expect(watching()).toBe(0)
  })

  test("an unbind before the first find leaves nothing watching the field", async () => {
    const { bind, watching } = setup()
    // React's strict mode binds, unbinds and binds again before microtasks run.
    bind()()
    const unbind = bind()
    await settle()
    expect(watching()).toBe(1)
    unbind()
    expect(watching()).toBe(0)
  })

  test("the clear button hides while the field is disabled or read-only", () => {
    const instance = inputGroup({ id: "g" })
    instance.api.internal.update({
      filled: true,
      disabled: false,
      readOnly: false,
    })
    expect(present(instance.part("clear"))).toBe(true)
    instance.api.internal.update({
      filled: true,
      disabled: true,
      readOnly: false,
    })
    expect(present(instance.part("clear"))).toBe(false)
    instance.api.internal.update({
      filled: true,
      disabled: false,
      readOnly: true,
    })
    expect(present(instance.part("clear"))).toBe(false)
  })
})

describe("input", () => {
  test("the controller reports its changes with a reason, and a cancel keeps the value", () => {
    const onValueChange = vi.fn(
      (value: string, details: { reason: string; cancel: () => void }) => {
        if (value === "nope") {
          details.cancel()
        }
      }
    )
    const { api } = input({ id: "i", defaultValue: "Ada", onValueChange })
    api.setValue("Grace")
    api.setValue("nope")
    api.clear()
    expect(api.getValue()).toBe("")
    expect(
      onValueChange.mock.calls.map(([value, details]) => [
        value,
        details.reason,
      ])
    ).toEqual([
      ["Grace", "imperative"],
      ["nope", "imperative"],
      ["", "imperative"],
    ])
  })

  test("a controlled input keeps its value until the new one arrives", () => {
    const onValueChange = vi.fn()
    const instance = input({ id: "i", value: "Ada", onValueChange })
    instance.api.setValue("Grace")
    expect(onValueChange).toHaveBeenCalledOnce()
    expect(instance.api.getValue()).toBe("Ada")
  })
})
