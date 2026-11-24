// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { Button, Separator, Toggle, ToggleGroup } from "../src"

const render = (view: () => ReturnType<typeof h>) =>
  renderToString(createSSRApp(view))

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering toggles, buttons and separators", () => {
  test("a toggle group renders one tab stop, on the pressed toggle", async () => {
    const html = await render(() =>
      h(ToggleGroup, { defaultValue: ["c"], "aria-label": "Alignment" }, () => [
        h(Toggle, { value: "a" }, () => "A"),
        h(Toggle, { value: "b" }, () => "B"),
        h(Toggle, { value: "c" }, () => "C"),
      ])
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="group"')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>C/)
  })

  test("a button renders as a native button that doesn't submit by default", async () => {
    expect(await render(() => h(Button, null, () => "Save"))).toMatch(
      /<button[^>]*type="button"/
    )
    expect(
      await render(() => h(Button, { type: "submit" }, () => "Save"))
    ).toMatch(/type="submit"/)
  })

  test("a separator renders its role and orientation", async () => {
    expect(
      await render(() => h(Separator, { orientation: "vertical" }))
    ).toMatch(/role="separator"[^>]*aria-orientation="vertical"/)
    expect(await render(() => h(Separator, { decorative: true }))).toContain(
      'role="none"'
    )
  })
})
