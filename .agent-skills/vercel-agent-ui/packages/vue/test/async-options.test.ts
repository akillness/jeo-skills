// @vitest-environment jsdom
import { expect, test } from "vitest"
import {
  createApp,
  defineComponent,
  effectScope,
  h,
  nextTick,
  onMounted,
} from "vue"
import { useAsyncOptions } from "../src/async-options"

function recordLoads() {
  const signals: AbortSignal[] = []
  const load = (_query: string, { signal }: { signal: AbortSignal }) => {
    signals.push(signal)
    return new Promise<string[]>(() => {})
  }
  return { signals, load }
}

test("an immediate load starts once the component mounts, and cancels on unmount", async () => {
  const { signals, load } = recordLoads()
  const Options = defineComponent(() => {
    const { state } = useAsyncOptions(load, { immediate: true })
    return () => h("p", state.value.status)
  })
  const root = document.createElement("div")
  const app = createApp(Options)
  app.mount(root)
  await nextTick()
  expect(root.textContent).toBe("loading")
  expect(signals).toHaveLength(1)
  app.unmount()
  expect(signals.map((signal) => signal.aborted)).toEqual([true])
})

// Like a setup store first used from a component's `onMounted`.
test("an immediate load first called after its component mounted still starts", async () => {
  const { signals, load } = recordLoads()
  const Options = defineComponent(() => {
    onMounted(() => useAsyncOptions(load, { immediate: true }))
    return () => h("p")
  })
  const root = document.createElement("div")
  const app = createApp(Options)
  app.mount(root)
  await nextTick()
  expect(signals).toHaveLength(1)
  app.unmount()
})

test("an immediate load in a scope outside any component starts at once", () => {
  const { signals, load } = recordLoads()
  const scope = effectScope()
  scope.run(() => useAsyncOptions(load, { immediate: true }))
  expect(signals).toHaveLength(1)
  scope.stop()
  expect(signals.map((signal) => signal.aborted)).toEqual([true])
})
