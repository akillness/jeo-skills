// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering", () => {
  test("a closed menu renders its trigger only", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Menu, null, () => [
          h(MenuTrigger, null, () => "File"),
          h(MenuContent, null, () =>
            h(MenuItem, { value: "new" }, () => "New file")
          ),
        ])
      )
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="menu"')
  })

  test("an open menu renders its content with neutral shortcuts", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Menu, { defaultOpen: true }, () => [
          h(MenuTrigger, null, () => "File"),
          h(MenuContent, null, () => [
            h(MenuItem, { value: "new", shortcut: "mod+n" }, () => "New file"),
            h(MenuSub, null, () => [
              h(MenuSubTrigger, null, () => "Share"),
              h(MenuSubContent, null, () =>
                h(MenuItem, { value: "email" }, () => "Email")
              ),
            ]),
          ]),
        ])
      )
    )
    expect(html).toContain('role="menu"')
    expect(html).toContain('aria-keyshortcuts="Control+N"')
    expect(html).toContain("Ctrl+N")
  })

  test("data menus render on the server", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(
          Menu,
          {
            defaultOpen: true,
            items: [{ value: "new", label: "New file" }, { type: "separator" }],
          },
          () => h(MenuTrigger, null, () => "File")
        )
      )
    )
    expect(html).toContain('role="menuitem"')
    expect(html).toContain('role="separator"')
  })
})
