// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest"
import { sheetPhysics } from "../src/foundation/motion/physics"
import type {
  SheetDriver,
  SheetDriverOptions,
} from "../src/foundation/popups/sheet-driver"
import { createPointerDriver } from "../src/foundation/popups/sheet-pointer"
import { createScrollSnapDriver } from "../src/foundation/popups/sheet-scroll-snap"

const settles: { frames: number; easing: string | undefined }[] = []
Element.prototype.animate = function (keyframes, options) {
  const { translate } = keyframes as { translate?: string[] }
  const { easing } = options as KeyframeAnimationOptions
  if (translate) {
    settles.push({ frames: translate.length, easing })
  }
  return { onfinish: null, startTime: 0, cancel() {} } as never
}
globalThis.IntersectionObserver = class {
  observe() {}
  disconnect() {}
} as never

let driver: SheetDriver | undefined
afterEach(() => {
  driver?.destroy()
  document.body.replaceChildren()
  settles.length = 0
  vi.unstubAllGlobals()
})

function close(create: (options: SheetDriverOptions) => SheetDriver) {
  const host = document.createElement("div")
  const sheet = host.appendChild(document.createElement("div"))
  document.body.append(host)
  const none = () => {}
  driver = create({
    sheet,
    host,
    side: () => "bottom",
    config: () => ({
      snapPoints: [{ id: "full", extent: 400 }],
      dimension: 1000,
      dismissible: true,
      expandOnScroll: true,
      physics: sheetPhysics.ios,
    }),
    size: () => 400,
    closedExtent: () => -120,
    reducedMotion: () => false,
    owns: () => true,
    canMouseDrag: () => true,
    onSnap: none,
    onRest: none,
    onDismiss: none,
    onDismissAttempt: none,
    onDragChange: none,
    isInteractive: () => false,
    onFrame: none,
    onMotion: none,
    onMotionStart: none,
  })
  driver.open("full", false)
  driver.close()
  return settles.at(-1)!
}

describe.each([
  ["pointer", createPointerDriver],
  ["scroll-snap", createScrollSnapDriver],
])("a settle with the %s driver", (_name, create) => {
  test("is a spring in a linear() easing where the browser has one", () => {
    vi.stubGlobal("CSS", { supports: () => true })
    const settle = close(create)
    expect(settle.frames).toBe(2)
    expect(settle.easing).toMatch(/^linear\(/)
  })

  test("is a keyframe per frame in a browser without linear(), like Safari before 17.2", () => {
    vi.stubGlobal("CSS", { supports: () => false })
    const settle = close(create)
    expect(settle.frames).toBeGreaterThan(2)
    expect(settle.easing ?? "linear").toBe("linear")
  })
})
