import { renderToStream } from "@solidjs/web"
import { createMemo, Loading } from "solid-js"
import { expect, test } from "vitest"
import { Switch } from "../src/switch"

// Runs with no DOM: the stream waits for the option, and the component that
// renders the switch is made once, so its source loads once.
test("the server waits for a controlled option that is loading, and makes the parent once", async () => {
  let made = 0
  function Parent() {
    made++
    const checked = createMemo(
      () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true)))
    )
    return <Switch checked={checked()} aria-label="Notifications" />
  }
  const html = await renderToStream(() => (
    <Loading fallback="Waiting">
      <Parent />
    </Loading>
  ))
  expect(made).toBe(1)
  expect(html).toMatch(/<button[^>]*aria-checked="true"/)
})
