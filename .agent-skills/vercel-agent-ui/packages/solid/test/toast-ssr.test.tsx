import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import { OverlayHost } from "../src/overlays"
import { createToaster, Toast, ToastRegion, ToastTitle } from "../src/toast"

// Runs with no DOM: any access to window or document during render throws.
describe("toast server rendering", () => {
  test("a region renders its empty list, with no landmark until it has toasts", () => {
    const html = renderToString(() => (
      <ToastRegion side="top" align="center">
        {() => (
          <Toast>
            <ToastTitle />
          </Toast>
        )}
      </ToastRegion>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('data-slot="toast-region"')
    expect(html).toContain('data-side="top"')
    expect(html).toContain('data-slot="toast-list"')
    expect(html).not.toContain('role="region"')
  })

  test("toasts queued on the server stay unrendered and start no timers", () => {
    const toaster = createToaster()
    toaster("Saved")
    const html = renderToString(() => <ToastRegion toaster={toaster} />)
    expect(html).not.toContain("Saved")
  })

  test("the overlay host renders no element on the server", () => {
    // Solid marks where the host's entries will go, and nothing else.
    expect(renderToString(() => <OverlayHost />)).not.toMatch(/<[a-z]/)
  })
})
