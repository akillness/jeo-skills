// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { createMenuController, MenuTrigger } from "../src/menu"

const render = (props: object) =>
  renderToString(
    createSSRApp(() =>
      h(
        MenuTrigger,
        { controller: createMenuController(), ...props },
        () => "Actions"
      )
    )
  )

test("a disabled trigger outside its menu is natively disabled", async () => {
  const html = await render({ disabled: true })
  expect(html).toMatch(/<button[^>]* disabled/)
  expect(html).not.toContain("aria-disabled")
})

test("with focusableWhenDisabled, it stays focusable with aria-disabled", async () => {
  const html = await render({ disabled: true, focusableWhenDisabled: true })
  expect(html).not.toMatch(/<button[^>]* disabled/)
  expect(html).toContain('aria-disabled="true"')
})
