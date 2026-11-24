import { render } from "svelte/server"
import { expect, test, vi } from "vitest"
import App from "./apps/async-options-app.svelte"

// Runs with no DOM: the server renders the first load as loading, without starting it.
test("an immediate load doesn't run on the server, which renders it as loading", () => {
  const load = vi.fn(() => new Promise<string[]>(() => {}))
  const { body } = render(App, { props: { load } })
  expect(load).not.toHaveBeenCalled()
  expect(body).toContain("<p>loading</p>")
})
