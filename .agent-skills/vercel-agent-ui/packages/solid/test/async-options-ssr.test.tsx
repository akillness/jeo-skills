import { renderToString } from "@solidjs/web"
import { expect, test, vi } from "vitest"
import { useAsyncOptions } from "../src/async-options"

// Runs with no DOM: the server renders the first load as loading, without starting it.
test("an immediate load doesn't run on the server, which renders it as loading", () => {
  const load = vi.fn(() => new Promise<string[]>(() => {}))
  function Options() {
    const options = useAsyncOptions(load, { immediate: true })
    return <p>{options.status}</p>
  }
  const html = renderToString(() => <Options />)
  expect(load).not.toHaveBeenCalled()
  expect(html).toMatch(/<p[^>]*>loading<\/p>/)
})
