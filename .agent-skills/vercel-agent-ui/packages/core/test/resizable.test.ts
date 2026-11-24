import { describe, expect, test, vi } from "vitest"
import {
  createResizableController,
  resizable,
} from "../src/components/resizable/resizable"
import {
  allHandleBounds,
  carryLayout,
  constraintsOf,
  endDelta,
  fitLayout,
  handleBounds,
  homeDelta,
  initialLayout,
  keyDelta,
  resizeAt,
  resizePanel,
  settle,
  toPercent,
  toggleTarget,
  type PanelConstraints,
} from "../src/components/resizable/resizable-layout"
import {
  loadLayout,
  saveLayout,
  type ResizableStorage,
} from "../src/components/resizable/resizable-storage"
import { kept } from "./kept"

const panel = (
  overrides: Partial<PanelConstraints> = {}
): PanelConstraints => ({
  min: 0,
  max: 100,
  collapsible: false,
  collapsed: 0,
  initial: undefined,
  ...overrides,
})

const round = (layout: readonly number[]) =>
  layout.map((size) => Math.round(size * 1000) / 1000)

describe("sizes", () => {
  test("numbers are percentages, and pixel and rem sizes resolve against the space", () => {
    expect(toPercent(30, 0)).toBe(30)
    expect(toPercent("30%", 0)).toBe(30)
    expect(toPercent("200px", 800)).toBe(25)
    expect(toPercent("10rem", 800, 20)).toBe(25)
  })

  test("pixel sizes stay unknown until the group is measured", () => {
    expect(toPercent("200px", 0)).toBeUndefined()
    expect(constraintsOf({ minSize: "200px" }, 0).min).toBe(0)
  })

  test("constraints keep collapsed at most the minimum and the maximum at least the minimum", () => {
    expect(
      constraintsOf({ minSize: 30, maxSize: 20, collapsedSize: 40 }, 1000)
    ).toEqual({
      min: 30,
      max: 30,
      collapsible: false,
      collapsed: 30,
      initial: undefined,
    })
  })
})

describe("settling", () => {
  const sidebar = panel({ min: 20, collapsible: true })

  test("an open panel collapses past half the way to collapsed, and stops at its minimum before", () => {
    expect(settle(sidebar, 11, 30)).toBe(20)
    expect(settle(sidebar, 9, 30)).toBe(0)
  })

  test("a collapsed panel opens to its minimum past half the way there", () => {
    expect(settle(sidebar, 9, 0)).toBe(0)
    expect(settle(sidebar, 11, 0)).toBe(20)
  })

  test("keys collapse one step past the minimum and open one step out", () => {
    expect(settle(sidebar, 19, 20, 1)).toBe(0)
    expect(settle(sidebar, 1, 0, 1)).toBe(20)
  })

  test("a panel that can't collapse stops at its minimum", () => {
    expect(settle(panel({ min: 20 }), 5, 30)).toBe(20)
  })
})

describe("moving a handle", () => {
  test("the panels on either side give and take the same amount", () => {
    expect(resizeAt([30, 70], [panel(), panel()], 0, 10)).toEqual([40, 60])
    expect(resizeAt([30, 70], [panel(), panel()], 0, -10)).toEqual([20, 80])
  })

  test("returns the same array when nothing can move", () => {
    const layout = [30, 70]
    expect(resizeAt(layout, [panel({ max: 30 }), panel()], 0, 10)).toBe(layout)
    expect(resizeAt(layout, [panel(), panel()], 0, 0)).toBe(layout)
    expect(resizeAt(layout, [panel(), panel()], 1, 10)).toBe(layout)
  })

  test("a panel at its minimum passes the rest on to the next one", () => {
    const panels = [panel(), panel({ min: 20 }), panel()]
    expect(resizeAt([20, 30, 50], panels, 0, 30)).toEqual([50, 20, 30])
  })

  test("a disabled handle stops the cascade either way, so the panels past it keep their sizes", () => {
    const panels = [panel(), panel({ min: 20 }), panel(), panel({ min: 10 })]
    const layout = [20, 30, 30, 20]
    // Handle 1 is disabled: moving handle 0 forward shrinks panel 1 only.
    expect(resizeAt(layout, panels, 0, 30, 0.5, [false, true])).toEqual([
      30, 20, 30, 20,
    ])
    // Moving handle 2 back shrinks panel 2 only, never panels 1 or 0.
    expect(resizeAt(layout, panels, 2, -40, 0.5, [false, true])).toEqual([
      20, 30, 0, 50,
    ])
    expect(
      resizeAt([20, 30, 0, 50], panels, 2, -5, 0.5, [false, true])
    ).toEqual([20, 30, 0, 50])
    // Without it, the move passes on.
    expect(resizeAt(layout, panels, 0, 30)).toEqual([50, 20, 10, 20])
  })

  test("a handle's bounds stop at a disabled handle", () => {
    const panels = [panel(), panel({ min: 20 }), panel()]
    expect(handleBounds([20, 30, 50], panels, 0, [false, true])).toEqual({
      min: 0,
      max: 30,
    })
    expect(handleBounds([20, 30, 50], panels, 0)).toEqual({ min: 0, max: 80 })
  })

  test("the growing panel stops at its maximum", () => {
    expect(resizeAt([20, 80], [panel({ max: 40 }), panel()], 0, 50)).toEqual([
      40, 60,
    ])
  })

  test("a shrinking panel collapses past half the way, and the other takes all it frees", () => {
    const panels = [panel({ min: 20, collapsible: true }), panel()]
    expect(resizeAt([30, 70], panels, 0, -15)).toEqual([20, 80])
    expect(resizeAt([30, 70], panels, 0, -21)).toEqual([0, 100])
  })

  test("dragging a collapsed panel open snaps it to its minimum", () => {
    const panels = [panel({ min: 20, collapsible: true }), panel()]
    expect(resizeAt([0, 100], panels, 0, 5)).toEqual([0, 100])
    expect(resizeAt([0, 100], panels, 0, 12)).toEqual([20, 80])
  })

  test("a collapse that frees more than the other panel can take stops at the minimum", () => {
    const panels = [panel({ min: 20, collapsible: true }), panel({ max: 75 })]
    expect(resizeAt([30, 70], panels, 0, -25)).toEqual([25, 75])
  })

  test("a collapsed panel stays shut when its neighbours can't free its minimum", () => {
    const panels = [panel({ min: 30, collapsible: true }), panel({ min: 80 })]
    expect(resizeAt([0, 100], panels, 0, 40)).toEqual([0, 100])
  })

  test("Home and End go as far as the panels allow", () => {
    const panels = [
      panel({ min: 10, max: 60, collapsible: true }),
      panel({ min: 30 }),
    ]
    expect(handleBounds([30, 70], panels, 0)).toEqual({ min: 0, max: 60 })
    expect(
      handleBounds([30, 70], [panel({ min: 10 }), panel({ min: 50 })], 0)
    ).toEqual({ min: 10, max: 50 })
  })

  test("every handle's bounds at once match each handle's own", () => {
    // A seeded generator, so a failure repeats.
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    // A bound in whole percent, or a fraction of one, like a pixel size.
    const bound = (most: number) =>
      random() < 0.5 ? Math.round(random() * most) : random() * most
    let onePass = 0
    for (let run = 0; run < 500; run++) {
      const count = 2 + Math.floor(random() * 7)
      const collapsing = run % 4 === 0
      const panels = Array.from({ length: count }, () => {
        const min = random() < 0.4 ? 0 : bound(15)
        const collapsible = collapsing && random() < 0.5
        return panel({
          min,
          max: random() < 0.4 ? 100 : Math.min(100, min + bound(60)),
          collapsible,
          collapsed: collapsible && random() < 0.5 ? min / 2 : 0,
        })
      })
      let layout: readonly number[] = fitLayout(
        panels.map(() => random() * 100),
        panels
      )
      // Some handles pushed to an end, so panels sit at their minimum or maximum.
      for (let handle = 0; handle < count - 1; handle++) {
        const pick = random()
        if (pick < 0.15) {
          layout = resizeAt(
            layout,
            panels,
            handle,
            homeDelta(layout, panels, handle),
            1
          )
        } else if (pick < 0.3) {
          layout = resizeAt(
            layout,
            panels,
            handle,
            endDelta(layout, panels, handle),
            1
          )
        }
      }
      // Now and then a layout the panels don't allow, like one saved before their bounds changed.
      if (run % 10 === 5) {
        layout = panels.map(() => 100 / count)
      }
      if (
        panels.every(
          (one, index) =>
            !one.collapsible &&
            layout[index] >= one.min - 1e-6 &&
            layout[index] <= one.max + 1e-6
        )
      ) {
        onePass++
      }
      const locked = panels.map(() => random() < 0.2)
      const all = allHandleBounds(layout, panels, locked)
      expect(all).toHaveLength(count - 1)
      all.forEach((bounds, handle) => {
        const one = handleBounds(layout, panels, handle, locked)
        expect(bounds.min, `run ${run}, handle ${handle}`).toBeCloseTo(
          one.min,
          9
        )
        expect(bounds.max, `run ${run}, handle ${handle}`).toBeCloseTo(
          one.max,
          9
        )
      })
    }
    // Most runs take the one pass, so it's what's checked, not the fallback.
    expect(onePass).toBeGreaterThan(250)
  })

  test("every handle's bounds at once work each handle out alone when a panel can collapse or is out of its bounds", () => {
    // Home collapses the first panel, so its handle goes down to 0, not to its minimum.
    const collapsible = [panel({ min: 20, collapsible: true }), panel()]
    expect(allHandleBounds([30, 70], collapsible)).toEqual([
      { min: 0, max: 100 },
    ])
    // A panel under its minimum, from a layout saved before its bounds changed, goes up to it.
    const under = [panel({ min: 10 }), panel()]
    expect(allHandleBounds([5, 95], under)).toEqual([{ min: 10, max: 100 }])
  })
})

describe("fitting a layout", () => {
  test("a layout that doesn't add up to 100 is scaled", () => {
    expect(fitLayout([1, 3], [panel(), panel()])).toEqual([25, 75])
  })

  test("sizes settle into their bounds, and the difference goes to panels that can take it", () => {
    expect(fitLayout([10, 90], [panel({ min: 20 }), panel()])).toEqual([20, 80])
    expect(fitLayout([50, 50], [panel({ max: 30 }), panel()])).toEqual([30, 70])
  })

  test("collapsed panels stay collapsed", () => {
    expect(
      fitLayout(
        [0, 50, 50],
        [panel({ min: 20, collapsible: true }), panel(), panel()]
      )
    ).toEqual([0, 50, 50])
  })

  test("panels without a default share what's left evenly", () => {
    expect(initialLayout([panel({ initial: 40 }), panel(), panel()])).toEqual([
      40, 30, 30,
    ])
    expect(round(initialLayout([panel(), panel(), panel()]))).toEqual([
      33.333, 33.333, 33.333,
    ])
  })

  test("panels that stay keep their sizes relative to each other when one comes", () => {
    const previous = { ids: ["a", "b"], layout: [25, 75] }
    const panels = [panel(), panel(), panel({ initial: 20 })]
    expect(carryLayout(previous, ["a", "b", "c"], panels)).toEqual([20, 60, 20])
    expect(
      carryLayout(
        { ids: ["a", "b", "c"], layout: [20, 60, 20] },
        ["a", "b"],
        [panel(), panel()]
      )
    ).toEqual([25, 75])
  })
})

describe("panels and keys", () => {
  test("resizing a panel goes through the handle after it, or before it for the last", () => {
    const panels = [panel(), panel(), panel()]
    expect(resizePanel([30, 40, 30], panels, 0, 20)).toEqual([20, 50, 30])
    expect(resizePanel([30, 40, 30], panels, 2, 40)).toEqual([30, 30, 40])
  })

  test("Enter collapses the panel before a handle, or the one after when only it can", () => {
    expect(toggleTarget([panel({ collapsible: true }), panel()], 0)).toBe(0)
    expect(toggleTarget([panel(), panel({ collapsible: true })], 0)).toBe(1)
    expect(toggleTarget([panel(), panel()], 0)).toBeNull()
  })

  test("arrows follow the axis, and swap right to left", () => {
    const keys = {
      vertical: false,
      rtl: false,
      step: 1,
      largeStep: 10,
      shiftKey: false,
    }
    expect(keyDelta("ArrowRight", keys)).toBe(1)
    expect(keyDelta("ArrowRight", { ...keys, rtl: true })).toBe(-1)
    expect(keyDelta("ArrowDown", keys)).toBeNull()
    expect(keyDelta("ArrowDown", { ...keys, vertical: true })).toBe(1)
    expect(
      keyDelta("ArrowUp", { ...keys, vertical: true, shiftKey: true })
    ).toBe(-10)
  })
})

describe("saved layouts", () => {
  const memory = () => {
    const items = new Map<string, string>()
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    } satisfies ResizableStorage
  }

  test("each set of panels keeps its own layout", () => {
    const storage = memory()
    saveLayout("editor", ["a", "b"], [25, 75], storage)
    saveLayout("editor", ["a", "b", "c"], [20, 60, 20], storage)
    expect(loadLayout("editor", ["a", "b"], storage)).toEqual([25, 75])
    expect(loadLayout("editor", ["a", "b", "c"], storage)).toEqual([20, 60, 20])
    expect(loadLayout("editor", ["a", "c"], storage)).toBeUndefined()
  })

  test("broken or blocked storage loads nothing", () => {
    const storage = memory()
    storage.setItem("ui-sdk-resizable:editor", "{")
    expect(loadLayout("editor", ["a"], storage)).toBeUndefined()
    const blocked = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(loadLayout("editor", ["a"], blocked)).toBeUndefined()
    expect(() => saveLayout("editor", ["a"], [100], blocked)).not.toThrow()
  })
})

describe("the primitive without a DOM", () => {
  function group(options: Parameters<typeof resizable>[0]) {
    const instance = resizable(options)
    instance.api.internal.setPanels(
      ["sidebar", "main"],
      [{ defaultSize: 30, minSize: 20, collapsible: true }, {}]
    )
    instance.api.internal.setSpace(1000)
    return instance
  }

  test("starts at its panels' defaults without reporting a change", () => {
    const onLayoutChange = vi.fn()
    const instance = group({ id: "g", onLayoutChange })
    expect(instance.api.getLayout()).toEqual([30, 70])
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  test("a drag reports every move and completes once", () => {
    const onLayoutChange = vi.fn()
    const onLayoutCommit = vi.fn()
    const instance = group({ id: "g", onLayoutChange, onLayoutCommit })
    instance.api.internal.startDrag(0, "h")
    instance.api.internal.dragBy(5)
    instance.api.internal.dragBy(10)
    instance.api.internal.endDrag()
    expect(
      onLayoutChange.mock.calls.map(([layout, details]) => [
        layout,
        details.reason,
      ])
    ).toEqual([
      [[35, 65], "drag"],
      [[40, 60], "drag"],
    ])
    expect(onLayoutCommit).toHaveBeenCalledTimes(1)
    expect(onLayoutCommit.mock.calls[0][0]).toEqual([40, 60])
  })

  test("a controlled group whose owner passes back the last move after the drag ends saves that move", async () => {
    const saved = new Map<string, string>()
    const storage: ResizableStorage = {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => void saved.set(key, value),
    }
    const onLayoutCommit = vi.fn()
    let layout = [30, 70]
    const options = () => ({
      id: "g",
      layout,
      autoSaveId: "s",
      storage,
      onLayoutChange,
      onLayoutCommit,
    })
    // The owner applies each change, but renders the last one late, like React after pointerup.
    const onLayoutChange = (next: number[]) => (layout = next)
    const instance = group(options())
    instance.api.internal.startDrag(0, "h")
    instance.api.internal.dragBy(5)
    instance.setOptions(options())
    instance.api.internal.dragBy(10)
    instance.api.internal.endDrag()
    await Promise.resolve()
    expect(onLayoutCommit).not.toHaveBeenCalled()
    instance.setOptions(options())
    expect(onLayoutCommit.mock.calls.map(([layout]) => layout)).toEqual([
      [40, 60],
    ])
    expect(loadLayout("s", ["sidebar", "main"], storage)).toEqual([40, 60])
  })

  test("a controlled group whose owner ignores the drag completes and saves nothing", () => {
    const onLayoutCommit = vi.fn()
    const setItem = vi.fn()
    const storage: ResizableStorage = { getItem: () => null, setItem }
    const options = {
      id: "g",
      layout: [30, 70],
      autoSaveId: "s",
      storage,
      onLayoutChange: () => {},
      onLayoutCommit,
    }
    vi.useFakeTimers()
    const instance = group(options)
    instance.api.internal.startDrag(0, "h")
    instance.api.internal.dragBy(10)
    instance.api.internal.endDrag()
    instance.setOptions(options)
    vi.advanceTimersByTime(100)
    // A layout of the owner's own later isn't the drag's.
    instance.setOptions({ ...options, layout: [50, 50] })
    vi.useRealTimers()
    expect(onLayoutCommit).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  test("arrows move a handle, and leave Alt, Control and Meta to the browser", () => {
    const instance = group({ id: "g" })
    instance.api.internal.setHandles({ h: 0 })
    const press = (init: Partial<KeyboardEvent>) => {
      const event = {
        key: "ArrowRight",
        shiftKey: false,
        preventDefault: vi.fn(),
        ...init,
      }
      instance.api.internal.keydown(
        event as unknown as KeyboardEvent,
        "h",
        {} as HTMLElement
      )
      return event.preventDefault
    }
    for (const modifier of ["altKey", "ctrlKey", "metaKey"]) {
      expect(press({ [modifier]: true }), modifier).not.toHaveBeenCalled()
    }
    expect(instance.api.getLayout()).toEqual([30, 70])
    expect(press({})).toHaveBeenCalled()
    expect(instance.api.getLayout()).toEqual([31, 69])
  })

  test("a canceled change keeps the layout", () => {
    const instance = group({
      id: "g",
      onLayoutChange: (_, details) => details.cancel(),
    })
    instance.api.resize("sidebar", 50)
    expect(instance.api.getLayout()).toEqual([30, 70])
  })

  test("the controller collapses and expands back to the size before", () => {
    const controller = createResizableController()
    const instance = kept(group({ id: "g", controller }))
    instance.setOptions({ id: "g", controller })
    controller.resize("sidebar", "400px")
    expect(controller.getLayout()).toEqual([40, 60])
    expect(controller.collapse("sidebar")).toBe(true)
    expect(controller.isCollapsed(0)).toBe(true)
    expect(controller.getLayout()).toEqual([0, 100])
    expect(controller.expand("sidebar")).toBe(true)
    expect(controller.getLayout()).toEqual([40, 60])
    expect(instance.get().layout).toEqual([40, 60])
  })

  test("a controlled layout applies once it fits the panels", () => {
    const instance = resizable({ id: "g", layout: [60, 40] })
    instance.api.internal.setPanels(["a", "b"], [{}, {}])
    expect(instance.api.getLayout()).toEqual([60, 40])
    instance.setOptions({ id: "g", layout: [50, 50] })
    expect(instance.api.getLayout()).toEqual([50, 50])
  })

  test("pixel bounds hold as the group shrinks, with the resize reason", () => {
    const onLayoutChange = vi.fn()
    const instance = resizable({ id: "g", onLayoutChange })
    instance.api.internal.setSpace(1000)
    instance.api.internal.setPanels(
      ["a", "b"],
      [{ defaultSize: 30, minSize: "300px" }, {}]
    )
    instance.api.internal.setSpace(600)
    expect(instance.api.getLayout()).toEqual([50, 50])
    expect(onLayoutChange.mock.calls[0][1].reason).toBe("resize")
  })
})
