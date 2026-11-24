// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../src/hover-card"
import {
  createTooltipController,
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "../src/tooltip"

// Runs with no DOM: any access to window or document during render throws.
describe("tooltip server rendering", () => {
  test("a closed tooltip is in the HTML, hidden, and already describes its trigger", () => {
    const html = renderToString(
      <Tooltip shortcut="mod+s">
        <TooltipTrigger>Save</TooltipTrigger>
        <TooltipContent>
          Save your changes <TooltipShortcut />
        </TooltipContent>
      </Tooltip>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/aria-describedby="[^"]+-content"/)
    expect(html).toContain('aria-keyshortcuts="Control+S"')
    expect(html).toContain('role="tooltip"')
    expect(html).toContain("hidden")
    expect(html).toContain("Ctrl+S")
  })

  test("a tooltip that labels its trigger names it from the server HTML", () => {
    const html = renderToString(
      <Tooltip type="label">
        <TooltipTrigger>
          <svg aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Bold</TooltipContent>
      </Tooltip>
    )
    expect(html).toMatch(/aria-labelledby="[^"]+-content"/)
    expect(html).not.toContain("aria-describedby")
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the tooltip", () => {
    const save = createTooltipController()
    const html = renderToString(
      <>
        <TooltipTrigger controller={save}>
          Save <TooltipShortcut />
        </TooltipTrigger>
        <Tooltip controller={save} shortcut="mod+s">
          <TooltipContent>Save your changes</TooltipContent>
        </Tooltip>
      </>
    )
    expect(html).toContain("Save")
    expect(html).not.toContain('data-slot="tooltip-shortcut"')
  })

  test("an open tooltip renders shown", () => {
    const html = renderToString(
      <Tooltip defaultOpen>
        <TooltipTrigger>Save</TooltipTrigger>
        <TooltipContent>Save your changes</TooltipContent>
      </Tooltip>
    )
    expect(html).toContain("data-open")
    expect(html).not.toMatch(/role="tooltip"[^>]*hidden/)
  })
})

describe("hover card server rendering", () => {
  const card = (open: boolean) => (
    <HoverCard defaultOpen={open}>
      <HoverCardTrigger href="/ada">@ada</HoverCardTrigger>
      <HoverCardContent>Ada Lovelace</HoverCardContent>
    </HoverCard>
  )

  test("a closed card renders its link only", () => {
    const html = renderToString(card(false))
    expect(html).toContain('href="/ada"')
    expect(html).not.toContain("Ada Lovelace")
  })

  test("an open card renders its content", () => {
    expect(renderToString(card(true))).toContain("Ada Lovelace")
  })
})
