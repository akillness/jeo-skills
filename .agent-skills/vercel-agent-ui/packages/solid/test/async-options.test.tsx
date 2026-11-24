import { render } from "@solidjs/web"
import { createMemo, flush, Loading } from "solid-js"
import { expect, test } from "vitest"
import { useAsyncOptions } from "../src/async-options"

function recordLoads() {
  const signals: AbortSignal[] = []
  const load = (_query: string, { signal }: { signal: AbortSignal }) => {
    signals.push(signal)
    return new Promise<string[]>(() => {})
  }
  function Options() {
    const options = useAsyncOptions(load, { immediate: true })
    return <p>{options.status}</p>
  }
  return { signals, Options }
}

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  const dispose = render(code, root)
  flush()
  return {
    root,
    dispose() {
      dispose()
      root.remove()
    },
  }
}

test("an immediate load starts once the component mounts, and cancels on unmount", () => {
  const { signals, Options } = recordLoads()
  const { root, dispose } = mount(() => <Options />)
  expect(root.textContent).toBe("loading")
  expect(signals).toHaveLength(1)
  dispose()
  expect(signals.map((signal) => signal.aborted)).toEqual([true])
})

test("an immediate load starts while a sibling under <Loading> is still pending", () => {
  const { signals, Options } = recordLoads()
  function Pending() {
    const value = createMemo(() => new Promise<string>(() => {}))
    return <p>{value()}</p>
  }
  const { root, dispose } = mount(() => (
    <Loading fallback="Waiting">
      <Pending />
      <Options />
    </Loading>
  ))
  expect(root.textContent).toBe("Waiting")
  expect(signals).toHaveLength(1)
  dispose()
})
