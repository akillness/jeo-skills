import { expect, test, vi } from "vitest"
import { createAsyncOptions } from "../src/foundation/lists/async-options"

test("a loader that resolves to nothing leaves no items and stops loading", async () => {
  vi.useFakeTimers()
  const options = createAsyncOptions(
    () => Promise.resolve(null as unknown as string[]),
    { debounce: 0 }
  )
  options.setQuery("pa")
  await vi.advanceTimersByTimeAsync(10)
  expect(options.getState()).toMatchObject({ status: "idle", items: [] })
  vi.useRealTimers()
})
