// @vitest-environment jsdom
// A content resize while a scroll-snap sheet is still on its way, like a
// popup that grows during its opening frames, keeps the sheet moving.
import { afterEach, expect, test } from "vitest"
import { sheetPhysics } from "../src/foundation/motion/physics"
import type { SheetDriver } from "../src/foundation/popups/sheet-driver"
import type { SheetMotion } from "../src/foundation/popups/sheet-effects"
import { createScrollSnapDriver } from "../src/foundation/popups/sheet-scroll-snap"

const animations: { onfinish: (() => void) | null; startTime: number }[] = []
Element.prototype.animate = function () {
  const animation = { onfinish: null, startTime: 0, cancel() {} }
  animations.push(animation)
  return animation as never
}
globalThis.IntersectionObserver = class {
  observe() {}
  disconnect() {}
} as never
Object.assign(window, { ScrollTimeline: class {} })

let frames: FrameRequestCallback[] = []
window.requestAnimationFrame = (callback) => frames.push(callback)
const runFrame = (time: number) => {
  const due = frames
  frames = []
  due.forEach((callback) => callback(time))
}

let driver: SheetDriver | undefined
afterEach(() => {
  driver?.destroy()
  document.body.replaceChildren()
  animations.length = 0
  frames = []
})

function setup() {
  const host = document.createElement("div")
  const sheet = document.createElement("div")
  host.append(sheet)
  document.body.append(host)
  const seen = {
    extent: 400,
    dismissible: true,
    motions: [] as SheetMotion[],
    rests: [] as (string | null)[],
    starts: [] as number[],
  }
  const none = () => {}
  driver = createScrollSnapDriver({
    sheet,
    host,
    side: () => "bottom",
    config: () => ({
      snapPoints: [{ id: "full", extent: seen.extent }],
      dimension: 1000,
      dismissible: seen.dismissible,
      expandOnScroll: true,
      physics: sheetPhysics.ios,
    }),
    size: () => seen.extent,
    closedExtent: () => -120,
    reducedMotion: () => false,
    owns: () => true,
    canMouseDrag: () => true,
    onSnap: none,
    onRest: (id) => seen.rests.push(id),
    onDismiss: none,
    onDismissAttempt: none,
    onDragChange: none,
    isInteractive: () => false,
    onFrame: none,
    onMotion: (motion) => seen.motions.push(motion),
    onMotionStart: (time) => seen.starts.push(time),
  })
  return seen
}

test("a resize during the opening frames aims the open at the new size and still starts it on the first frame", () => {
  const seen = setup()
  driver!.open("full", true)
  seen.extent = 500
  driver!.relayout(false)
  const motion = seen.motions.at(-1)!
  expect(motion.type).toBe("settle")
  expect(motion.type === "settle" && motion.extentAt(10_000)).toBeCloseTo(500)
  expect(seen.rests).toEqual([])
  runFrame(16)
  runFrame(32)
  expect(seen.starts).toEqual([32])
  expect(animations.at(-1)!.startTime).toBe(32)
  animations.at(-1)!.onfinish!()
  expect(seen.rests).toEqual(["full"])
  expect(seen.motions.at(-1)!.type).toBe("timeline")
})

test("a resize that keeps the snap point where it was leaves the open as it is", () => {
  const seen = setup()
  driver!.open("full", true)
  driver!.relayout(false)
  expect(seen.motions).toHaveLength(1)
  expect(animations).toHaveLength(1)
  expect(seen.rests).toEqual([])
})

test("a resize that moves where scrolling starts aims the open again", () => {
  const seen = setup()
  driver!.open("full", true)
  seen.dismissible = false
  driver!.relayout(false)
  expect(seen.motions).toHaveLength(2)
  expect(document.querySelector("div")!.scrollTop).toBe(0)
})

test("a resize at rest still settles where the sheet rests now", () => {
  const seen = setup()
  driver!.open("full", false)
  seen.extent = 500
  driver!.relayout(false)
  expect(seen.rests).toEqual(["full", "full"])
  expect(seen.motions.at(-1)!.type).toBe("timeline")
})
