// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import { OverlayHost, Toast, ToastRegion, ToastTitle } from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("toast server rendering", () => {
  test("a region renders its empty list, with no landmark until it has toasts", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(ToastRegion, { side: "top", align: "center" }, () =>
          h(Toast, null, () => h(ToastTitle))
        )
      )
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain('data-slot="toast-region"')
    expect(html).toContain('data-side="top"')
    expect(html).toContain('data-slot="toast-list"')
    expect(html).not.toContain('role="region"')
  })

  test("the overlay host renders nothing on the server", async () => {
    expect(await renderToString(createSSRApp(() => h(OverlayHost)))).toBe(
      "<!--[--><!--]-->"
    )
  })
})
