import { describe, expect, test, vi } from "vitest"
import { definePrimitive } from "../src/foundation/kernel/primitive"
import { bind, handlers } from "../src/foundation/kernel/part"

function hint() {
  const built = vi.fn()
  const calls: string[] = []
  const primitive = definePrimitive({
    name: "hint",
    options: { open: "boolean" },
    state: () => ({}),
    asleep: (options: { open?: boolean }) => options.open === undefined,
    api: () => {
      built()
      return { show: () => calls.push("show") }
    },
    slots: (slot) => ({
      trigger: slot({
        on: { pointerenter: (_, { api }) => api.show() },
        asleep: () => {
          calls.push("asleep")
        },
        bind: () => {
          calls.push("bind")
        },
      }),
    }),
  })
  return { primitive, built, calls }
}

const standIn = () =>
  ({ isConnected: true, addEventListener() {} }) as unknown as HTMLElement

describe("an instance that starts asleep", () => {
  test("binds only `asleep` until an event reaches a part, which wakes it first", () => {
    const { primitive, built, calls } = hint()
    const instance = primitive({ id: "h" })
    const part = instance.part("trigger")
    bind(part, standIn(), { by: "framework", attaches: "all" })
    expect(built).not.toHaveBeenCalled()
    expect(calls).toEqual(["asleep"])
    handlers(part).pointerenter!(new Event("pointerenter"))
    expect(built).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(["asleep", "bind", "show"])
  })

  test("wakes when its api is read, or options arrive that need it awake", () => {
    const { primitive, built } = hint()
    primitive({ id: "a" }).api.show()
    const instance = primitive({ id: "b" })
    instance.setOptions({ id: "b", open: false })
    expect(built).toHaveBeenCalledTimes(2)
  })

  test("a part made while asleep reads the api once it wakes", () => {
    const { primitive } = hint()
    const instance = primitive({ id: "h" })
    const part = instance.part("trigger")
    expect(part.api).toBeUndefined()
    instance.api.show()
    expect(part.api).toBe(instance.api)
  })

  test("gives a part swept while it slept the api it woke with", async () => {
    const { primitive, calls } = hint()
    const instance = primitive({ id: "h" })
    const part = instance.part("trigger")
    const host = { by: "framework", attaches: "all" } as const
    bind(part, standIn(), host)()
    await Promise.resolve()
    void instance.api
    bind(part, standIn(), host)
    handlers(part).pointerenter!(new Event("pointerenter"))
    expect(calls).toEqual(["asleep", "asleep", "bind", "show"])
  })

  test("never sleeps with options that need it awake", () => {
    const { primitive, built } = hint()
    primitive({ id: "h", open: true })
    expect(built).toHaveBeenCalledTimes(1)
  })
})
