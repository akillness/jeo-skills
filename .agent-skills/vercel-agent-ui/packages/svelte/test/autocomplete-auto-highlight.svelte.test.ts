// autoHighlight turned on after typing highlights the best match once the
// options are handed over: the setup fails a test that writes state while they are.
import { flushSync, mount, unmount } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/autocomplete-auto-highlight-app.svelte"

let app: ReturnType<typeof mount> | undefined
afterEach(() => {
  if (app) {
    unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

test("turning autoHighlight on after typing highlights the best match", async () => {
  const props = $state({ autoHighlight: false })
  app = mount(App, { target: document.body, props })
  flushSync()
  const input = document.querySelector<HTMLInputElement>('[role="combobox"]')!
  input.value = "b"
  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: "b",
      inputType: "insertText",
    })
  )
  flushSync()
  expect(input.getAttribute("aria-activedescendant")).toBeNull()
  props.autoHighlight = true
  flushSync()
  await Promise.resolve()
  flushSync()
  expect(input.getAttribute("aria-activedescendant")).toMatch(/option-Banana$/)
})
