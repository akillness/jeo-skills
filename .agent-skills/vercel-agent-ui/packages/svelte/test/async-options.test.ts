import { flushSync, mount, unmount } from "svelte"
import { expect, test } from "vitest"
import App from "./apps/async-options-app.svelte"

test("an immediate load starts once the component mounts, and cancels on unmount", () => {
  const signals: AbortSignal[] = []
  const load = (_query: string, { signal }: { signal: AbortSignal }) => {
    signals.push(signal)
    return new Promise<string[]>(() => {})
  }
  const target = document.createElement("div")
  const app = mount(App, { target, props: { load } })
  flushSync()
  expect(target.textContent).toBe("loading")
  expect(signals).toHaveLength(1)
  unmount(app)
  expect(signals.map((signal) => signal.aborted)).toEqual([true])
})
