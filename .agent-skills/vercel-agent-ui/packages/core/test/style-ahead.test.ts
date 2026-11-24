// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest"
import { ahead } from "../src/foundation/platform/style"

const idle: (() => void)[] = []

function painted() {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([
    {} as PerformanceEntry,
  ])
  window.requestIdleCallback = ((callback: () => void) =>
    idle.push(callback)) as typeof window.requestIdleCallback
}

afterEach(() => {
  vi.restoreAllMocks()
  idle.length = 0
  delete (window as Partial<Window>).requestIdleCallback
})

test("before the first paint, the work runs at once", () => {
  const work = vi.fn()
  ahead(work)
  expect(work).toHaveBeenCalledTimes(1)
})

test("after it, work queued before the page is idle runs in one idle callback", () => {
  painted()
  const done: string[] = []
  ahead(() => done.push("reset"))
  ahead(() => done.push("register"))
  expect(done).toEqual([])
  expect(idle).toHaveLength(1)
  idle[0]()
  expect(done).toEqual(["reset", "register"])
})

test("work queued while the queue runs waits for the next idle callback", () => {
  painted()
  const done: string[] = []
  ahead(() => ahead(() => done.push("later")))
  idle[0]()
  expect(done).toEqual([])
  expect(idle).toHaveLength(2)
  idle[1]()
  expect(done).toEqual(["later"])
})
