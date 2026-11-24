// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
  createPopoverController,
} from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("popover server rendering", () => {
  const app = (open: boolean) =>
    createSSRApp(() =>
      h(Popover, { defaultOpen: open }, () => [
        h(PopoverTrigger, { shortcut: "mod+i" }, () => [
          "Profile",
          h(PopoverShortcut),
        ]),
        h(PopoverContent, null, () => [
          h(PopoverTitle, null, () => "Edit profile"),
          h(PopoverDescription, null, () => "Your name appears on your posts."),
          h(PopoverClose, null, () => "Close"),
        ]),
      ])
    )

  test("a closed popover renders its trigger only, with its shortcut", async () => {
    const html = await renderToString(app(false))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-keyshortcuts="Control+I"')
    expect(html).toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>\u2066Ctrl\+I\u2069<\/span>/
    )
    expect(html).not.toContain('role="dialog"')
  })

  test("an open popover renders its content in place", async () => {
    const html = await renderToString(app(true))
    expect(html).toContain('role="dialog"')
    expect(html).toContain("<h2")
  })

  test("a shortcut renders inside a trigger connected through a controller", async () => {
    const share = createPopoverController()
    const html = await renderToString(
      createSSRApp(() => [
        h(PopoverTrigger, { controller: share, shortcut: "mod+i" }, () => [
          "Share",
          h(PopoverShortcut),
        ]),
        h(Popover, { controller: share }, () =>
          h(PopoverContent, null, () => "Share")
        ),
      ])
    )
    expect(html).toContain("Share")
  })

  test("a disabled trigger whose popover hasn't mounted renders disabled", async () => {
    const share = createPopoverController()
    const html = await renderToString(
      createSSRApp(() => [
        h(PopoverTrigger, { controller: share, disabled: true }, () => "Share"),
        h(Popover, { controller: share }, () =>
          h(PopoverContent, null, () => "Share")
        ),
      ])
    )
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Share/)
  })
})
