// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  createTooltipController,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("tooltip server rendering", () => {
  test("a closed tooltip is in the HTML, hidden, and already describes its trigger", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Tooltip, { shortcut: "mod+s" }, () => [
          h(TooltipTrigger, null, () => "Save"),
          h(TooltipContent, null, () => [
            "Save your changes",
            h(TooltipShortcut),
          ]),
        ])
      )
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/aria-describedby="[^"]+-content"/)
    expect(html).toContain('aria-keyshortcuts="Control+S"')
    expect(html).toContain('role="tooltip"')
    expect(html).toContain("hidden")
    expect(html).toContain("Ctrl+S")
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the tooltip", async () => {
    const save = createTooltipController()
    const html = await renderToString(
      createSSRApp(() => [
        h(TooltipTrigger, { controller: save }, () => [
          "Save",
          h(TooltipShortcut),
        ]),
        h(Tooltip, { controller: save, shortcut: "mod+s" }, () =>
          h(TooltipContent, null, () => "Save your changes")
        ),
      ])
    )
    expect(html).toContain("Save")
    expect(html).not.toContain('data-slot="tooltip-shortcut"')
  })

  test("a tooltip that labels its trigger names it from the server HTML", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Tooltip, { type: "label" }, () => [
          h(TooltipTrigger, null, () => h("svg", { "aria-hidden": "true" })),
          h(TooltipContent, null, () => "Bold"),
        ])
      )
    )
    expect(html).toMatch(/aria-labelledby="[^"]+-content"/)
    expect(html).not.toContain("aria-describedby")
  })
})

describe("hover card server rendering", () => {
  const card = (open: boolean) =>
    createSSRApp(() =>
      h(HoverCard, { defaultOpen: open }, () => [
        h(HoverCardTrigger, { href: "/ada" }, () => "@ada"),
        h(HoverCardContent, null, () => "Ada Lovelace"),
      ])
    )

  test("a closed card renders its link only", async () => {
    const html = await renderToString(card(false))
    expect(html).toContain('href="/ada"')
    expect(html).not.toContain("Ada Lovelace")
  })

  test("an open card renders its content", async () => {
    expect(await renderToString(card(true))).toContain("Ada Lovelace")
  })
})
