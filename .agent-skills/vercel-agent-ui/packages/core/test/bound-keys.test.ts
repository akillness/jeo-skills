import { describe, expect, test } from "vitest"
import {
  flagWhileBound,
  keyWhileBound,
  settleFlag,
} from "../src/foundation/kernel/bound-keys"
import { createStore } from "../src/foundation/kernel/store"

const tick = () => new Promise<void>((done) => queueMicrotask(done))

describe("flags set while a part is bound", () => {
  test("parts that bind together write the store once, a microtask later", async () => {
    const store = createStore(
      { titled: null as boolean | null, labels: [] as readonly string[] },
      []
    )
    let writes = 0
    store.subscribe(() => writes++)
    flagWhileBound(store, "titled")
    keyWhileBound(store, "labels", "a")
    keyWhileBound(store, "labels", "b")
    expect(store.get()).toEqual({ titled: null, labels: [] })
    await tick()
    expect(store.get()).toEqual({ titled: true, labels: ["a", "b"] })
    expect(writes).toBe(1)
  })

  test("a flag set now is set as its part binds and cleared as it unbinds", () => {
    const store = createStore({ titled: null as boolean | null }, [])
    const unbind = flagWhileBound(store, "titled", { now: true })
    expect(store.get().titled).toBe(true)
    unbind()
    expect(store.get().titled).toBe(false)
  })

  test("a flag is false once its part unbinds", async () => {
    const store = createStore({ titled: null as boolean | null }, [])
    const unbind = flagWhileBound(store, "titled")
    await tick()
    unbind()
    await tick()
    expect(store.get().titled).toBe(false)
  })

  test("a settled flag is false when no part set it, whichever bound first", async () => {
    const store = createStore({ titled: null as boolean | null }, [])
    settleFlag(store, "titled")
    await tick()
    expect(store.get().titled).toBe(false)

    const before = createStore({ titled: null as boolean | null }, [])
    flagWhileBound(before, "titled")
    settleFlag(before, "titled")
    const after = createStore({ titled: null as boolean | null }, [])
    settleFlag(after, "titled")
    flagWhileBound(after, "titled")
    await tick()
    expect([before.get().titled, after.get().titled]).toEqual([true, true])
  })

  test("settling leaves a flag a part already set", async () => {
    const store = createStore({ titled: null as boolean | null }, [])
    const unbind = flagWhileBound(store, "titled")
    await tick()
    unbind()
    settleFlag(store, "titled")
    await tick()
    expect(store.get().titled).toBe(false)
    flagWhileBound(store, "titled")
    settleFlag(store, "titled")
    await tick()
    expect(store.get().titled).toBe(true)
  })
})
