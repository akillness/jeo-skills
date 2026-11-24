// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  createPopoverController,
  Popover,
  PopoverArrow,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverShortcut,
  PopoverTitle,
  PopoverTrigger,
} from "../src/popover"

// Runs with no DOM: any access to window or document during render throws.
describe("popover server rendering", () => {
  const popover = (open: boolean) => (
    <Popover defaultOpen={open}>
      <PopoverTrigger shortcut="mod+i">
        Profile <PopoverShortcut />
      </PopoverTrigger>
      <PopoverContent>
        <PopoverArrow />
        <PopoverTitle>Edit profile</PopoverTitle>
        <PopoverDescription>
          Your name appears on your posts.
        </PopoverDescription>
        <PopoverClose>Close</PopoverClose>
      </PopoverContent>
    </Popover>
  )

  test("a closed popover renders its trigger only", () => {
    const html = renderToString(popover(false))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="dialog"')
  })

  test("an open popover renders its content in place", () => {
    const html = renderToString(popover(true))
    expect(html).toContain('role="dialog"')
    // Added on the client, so the browser doesn't hide the content until then.
    expect(html).not.toContain("popover=")
    expect(html).toContain("<h2")
  })

  test("the shortcut renders the same on the server and the first client render", () => {
    const html = renderToString(popover(false))
    // Neutral names until the client knows its platform, so hydration never mismatches.
    expect(html).toContain('aria-keyshortcuts="Control+I"')
    expect(html).toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>\u2066Ctrl\+I\u2069<\/span>/
    )
  })

  test("a shortcut part takes its own keys", () => {
    const html = renderToString(
      <Popover>
        <PopoverShortcut shortcut="mod+s" />
      </Popover>
    )
    expect(html).toContain("Ctrl+S")
  })

  test("a shortcut renders inside a trigger connected through a controller", () => {
    const share = createPopoverController()
    const html = renderToString(
      <>
        <PopoverTrigger controller={share} shortcut="mod+i">
          Share <PopoverShortcut />
        </PopoverTrigger>
        <Popover controller={share}>
          <PopoverContent>
            <PopoverTitle>Share</PopoverTitle>
          </PopoverContent>
        </Popover>
      </>
    )
    expect(html).toContain("Share")
  })
})
