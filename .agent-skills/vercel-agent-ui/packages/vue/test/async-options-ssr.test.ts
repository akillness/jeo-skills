// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { expect, test, vi } from "vitest"
import { createSSRApp, defineComponent, effectScope, h } from "vue"
import { useAsyncOptions } from "../src/async-options"

// Runs with no DOM: the server renders the first load as loading, without starting it.
test("an immediate load doesn't run on the server, which renders it as loading", async () => {
  const load = vi.fn(() => new Promise<string[]>(() => {}))
  const Options = defineComponent(() => {
    const { state } = useAsyncOptions(load, { immediate: true })
    return () => h("p", state.value.status)
  })
  const html = await renderToString(createSSRApp(Options))
  expect(load).not.toHaveBeenCalled()
  expect(html).toBe("<p>loading</p>")
})

test("an immediate load in a scope outside any component doesn't run on the server", () => {
  const load = vi.fn(() => new Promise<string[]>(() => {}))
  const scope = effectScope()
  const options = scope.run(() => useAsyncOptions(load, { immediate: true }))
  expect(load).not.toHaveBeenCalled()
  expect(options?.state.value.status).toBe("loading")
  scope.stop()
})
