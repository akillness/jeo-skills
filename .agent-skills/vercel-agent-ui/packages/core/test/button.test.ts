import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { button } from "../src/components/button/button"
import { setAnnouncer } from "../src/foundation/platform/announce"
import { attrs, partState } from "../src/foundation/kernel/part"

const settle = () => new Promise((resolve) => setTimeout(resolve))

// Node has no document, so announcements are caught here instead of in a live region.
const announcements: string[] = []
beforeAll(() => setAnnouncer((text) => announcements.push(text)))

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  announcements.length = 0
})

describe("button", () => {
  test("debug logs the pending and error changes a press makes", async () => {
    const log = vi.spyOn(console, "debug").mockImplementation(() => {})
    const instance = button({
      id: "b",
      debug: true,
      action: () => Promise.reject(new Error("Offline")),
    })
    instance.api.internal.press()
    await settle()
    const lines = log.mock.calls.map(([line]) => String(line))
    expect(lines).toEqual([
      expect.stringContaining("button#b pending: true (action"),
      expect.stringContaining("button#b pending: false (action"),
      expect.stringContaining("button#b error: Error: Offline (action"),
    ])
  })

  test("without debug, a press logs nothing", async () => {
    const log = vi.spyOn(console, "debug").mockImplementation(() => {})
    const instance = button({ id: "b", action: () => Promise.resolve() })
    instance.api.internal.press()
    await settle()
    expect(log).not.toHaveBeenCalled()
  })

  test("the next press clears the last error, and a success keeps it clear", async () => {
    let fail = true
    const instance = button({
      id: "b",
      action: () => (fail ? Promise.reject("offline") : Promise.resolve()),
    })
    instance.api.internal.press()
    await settle()
    expect(partState(instance.part("root"))).toMatchObject({ error: "offline" })
    fail = false
    instance.api.internal.press()
    expect(partState(instance.part("root"))).toMatchObject({
      pending: true,
      error: undefined,
    })
    await settle()
    expect(partState(instance.part("root"))).toMatchObject({
      pending: false,
      error: undefined,
    })
  })

  test("a handler that throws sets the error without going pending", () => {
    const instance = button({
      id: "b",
      action: () => {
        throw "broken"
      },
    })
    instance.api.internal.press()
    expect(partState(instance.part("root"))).toMatchObject({
      pending: false,
      error: "broken",
    })
    expect(attrs(instance.part("root"))).not.toHaveProperty("aria-busy", "true")
  })

  test("a failed action warns with the error in development, thrown or rejected", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const thrown = new Error("boom")
    button({
      id: "b",
      action: () => {
        throw thrown
      },
    }).api.internal.press()
    const rejected = new Error("Offline")
    button({
      id: "c",
      action: () => Promise.reject(rejected),
    }).api.internal.press()
    await settle()
    expect(warn.mock.calls).toEqual([
      [expect.stringContaining("an action failed"), thrown],
      [expect.stringContaining("an action failed"), rejected],
    ])
  })

  test("a failed action keeps its error in strict mode instead of throwing", async () => {
    const flags = globalThis as { __UI_SDK_STRICT__?: boolean }
    flags.__UI_SDK_STRICT__ = true
    vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const thrown = button({
        id: "b",
        action: () => {
          throw "broken"
        },
      })
      thrown.api.internal.press()
      const rejected = button({
        id: "c",
        action: () => Promise.reject("Offline"),
      })
      rejected.api.internal.press()
      await settle()
      expect(partState(thrown.part("root"))).toMatchObject({ error: "broken" })
      expect(partState(rejected.part("root"))).toMatchObject({
        pending: false,
        error: "Offline",
      })
    } finally {
      delete flags.__UI_SDK_STRICT__
    }
  })

  test("a successful action warns nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    button({ id: "b", action: () => Promise.resolve() }).api.internal.press()
    await settle()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe("pending announcement", () => {
  // A press whose Promise settles only when `finish` is called.
  function slowButton(options: Parameters<typeof button>[0] = { id: "b" }) {
    let finish = () => {}
    const instance = button({
      ...options,
      action: () => new Promise<void>((resolve) => (finish = resolve)),
    })
    instance.api.internal.press()
    return { instance, finish: () => finish() }
  }

  test("says nothing before a second, then Loading once", async () => {
    vi.useFakeTimers()
    const { finish } = slowButton()
    await vi.advanceTimersByTimeAsync(999)
    expect(announcements).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(announcements).toEqual(["Loading"])
    await vi.advanceTimersByTimeAsync(5000)
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(announcements).toEqual(["Loading"])
  })

  test("an action that settles within a second says nothing", async () => {
    vi.useFakeTimers()
    const { finish } = slowButton()
    await vi.advanceTimersByTimeAsync(500)
    finish()
    await vi.advanceTimersByTimeAsync(2000)
    expect(announcements).toEqual([])
  })

  test("a button that leaves the page while pending says nothing", async () => {
    vi.useFakeTimers()
    const { instance } = slowButton()
    instance.destroy()
    await vi.advanceTimersByTimeAsync(2000)
    expect(announcements).toEqual([])
  })

  test("a button that settles or leaves while the announcer loads says nothing", async () => {
    vi.useFakeTimers()
    const settled = slowButton({ id: "a" })
    const left = slowButton({ id: "b" })
    vi.advanceTimersByTime(1000)
    settled.finish()
    left.instance.destroy()
    await vi.advanceTimersByTimeAsync(1000)
    expect(announcements).toEqual([])
  })

  test("pendingAnnouncement replaces the text, and an empty one says nothing", async () => {
    vi.useFakeTimers()
    slowButton({ id: "a", pendingAnnouncement: "Chargement" })
    slowButton({ id: "b", pendingAnnouncement: "" })
    await vi.advanceTimersByTimeAsync(1000)
    expect(announcements).toEqual(["Chargement"])
  })

  test("a pending button is aria-disabled until it settles, without the native attribute", async () => {
    const { instance, finish } = slowButton()
    expect(attrs(instance.part("root"))).toMatchObject({
      "aria-disabled": "true",
      disabled: undefined,
    })
    finish()
    await settle()
    expect(attrs(instance.part("root"))).toMatchObject({
      "aria-disabled": undefined,
    })
  })

  test("a button disabled anyway stays aria-disabled after it settles", async () => {
    const { instance, finish } = slowButton({
      id: "b",
      focusableWhenDisabled: true,
    })
    instance.setOptions({
      id: "b",
      focusableWhenDisabled: true,
      disabled: true,
    })
    finish()
    await settle()
    expect(attrs(instance.part("root"))).toMatchObject({
      "aria-disabled": "true",
    })
  })
})
