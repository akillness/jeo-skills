import { afterEach, expect, test, vi } from "vitest"
import { createAsyncOptions } from "../src/foundation/lists/async-options"

afterEach(() => {
  vi.useRealTimers()
})

const search = (calls: string[]) => (query: string) => {
  calls.push(query)
  return new Promise<string[]>((resolve) =>
    setTimeout(() => resolve([`${query}-result`]), 50)
  )
}

test("text shorter than minLength loads nothing and clears the items", async () => {
  vi.useFakeTimers()
  const calls: string[] = []
  const options = createAsyncOptions(search(calls), {
    debounce: 20,
    minLength: 3,
  })
  options.setQuery("pa")
  expect(options.getState()).toMatchObject({ status: "idle", items: [] })
  options.setQuery("par")
  expect(options.getState().status).toBe("loading")
  await vi.advanceTimersByTimeAsync(100)
  expect(options.getState().items).toEqual(["par-result"])
  options.setQuery("pa ")
  await vi.advanceTimersByTimeAsync(100)
  expect(calls).toEqual(["par"])
  expect(options.getState()).toMatchObject({
    query: "pa ",
    items: [],
    status: "idle",
  })
})

test("going below minLength aborts a load in flight", async () => {
  vi.useFakeTimers()
  const aborted = vi.fn()
  const options = createAsyncOptions(
    (_query, { signal }) => {
      signal.addEventListener("abort", aborted)
      return new Promise<string[]>(() => {})
    },
    { debounce: 0, minLength: 2 }
  )
  options.setQuery("pa")
  await vi.advanceTimersByTimeAsync(10)
  options.setQuery("p")
  expect(aborted).toHaveBeenCalledTimes(1)
  expect(options.getState().status).toBe("idle")
})

test("an immediate load or a reload for short text loads nothing", () => {
  const calls: string[] = []
  const options = createAsyncOptions(search(calls), {
    immediate: true,
    minLength: 1,
  })
  options.reload()
  expect(calls).toEqual([])
  expect(options.getState().status).toBe("idle")
})
