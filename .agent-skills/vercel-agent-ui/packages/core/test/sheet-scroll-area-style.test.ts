// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { sheetPhysics } from "../src/foundation/motion/physics"
import type { SheetDriver } from "../src/foundation/popups/sheet-driver"
import { createScrollSnapDriver } from "../src/foundation/popups/sheet-scroll-snap"

const animations: { onfinish: (() => void) | null }[] = []
Element.prototype.animate = function () {
  const animation = { onfinish: null, startTime: 0, cancel() {} }
  animations.push(animation)
  return animation as never
}
globalThis.IntersectionObserver = class {
  observe() {}
  disconnect() {}
} as never

let driver: SheetDriver | undefined
afterEach(() => {
  driver?.destroy()
  document.body.replaceChildren()
  animations.length = 0
})

test("a scroll area keeps its own inline overflow-y at the largest snap point and after", () => {
  const host = document.body.appendChild(document.createElement("div"))
  const sheet = host.appendChild(document.createElement("div"))
  const list = sheet.appendChild(document.createElement("ul"))
  list.style.setProperty("overflow-y", "auto")
  const none = () => {}
  driver = createScrollSnapDriver({
    sheet,
    host,
    side: () => "bottom",
    config: () => ({
      snapPoints: [
        { id: "half", extent: 200 },
        { id: "full", extent: 400 },
      ],
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
  driver.open("half", false)
  expect(list.style.overflowY).toBe("hidden")
  driver.snapTo("full", "imperative")
  animations.at(-1)?.onfinish?.()
  expect(list.style.overflowY).toBe("auto")
  driver.snapTo("half", "imperative")
  animations.at(-1)?.onfinish?.()
  driver.destroy()
  driver = undefined
  expect(list.style.overflowY).toBe("auto")
})
