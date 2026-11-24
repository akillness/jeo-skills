// @vitest-environment jsdom
import { createApp, defineComponent, h } from "vue"
import { expect, test } from "vitest"
import { Button } from "../src/button"
import { withSource } from "../src/observe"

test("a press hands the @click handler its event and how the button was pressed", () => {
  const calls: [string, string][] = []
  const el = document.body.appendChild(document.createElement("div"))
  const app = createApp(
    defineComponent({
      setup: () => () =>
        h(
          Button,
          {
            onClick: (event: MouseEvent, { source }) =>
              calls.push([event.type, source]),
          },
          () => "Save"
        ),
    })
  )
  app.mount(el)
  withSource("agent", () => el.querySelector("button")!.click())
  expect(calls).toEqual([["click", "agent"]])
  app.unmount()
  el.remove()
})
