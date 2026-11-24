import { describe, expect, test } from "vitest"
import {
  createWaterfallController,
  visibleWaterfallRows,
  waterfall,
  type WaterfallData,
} from "../src/components/waterfall/waterfall"
import {
  formatTime,
  spanPlacement,
  spanRange,
  tickTimes,
  waterfallTicks,
} from "../src/components/waterfall/waterfall-time"
import { attrs, partState } from "../src/foundation/kernel/part"
import { expectNoMissedUpdates, type Part } from "./selects"
import { kept } from "./kept"

const items: WaterfallData = [
  {
    value: "page",
    label: "GET /",
    start: 0,
    duration: 1000,
    children: [
      { value: "css", label: "GET /app.css", start: 100, duration: 200 },
      {
        value: "js",
        label: "GET /app.js",
        start: 100,
        duration: 500,
        children: [
          { value: "api", label: "GET /api/user", start: 600, duration: 300 },
        ],
      },
    ],
  },
  { value: "font", label: "GET /font.woff2", start: 1000, duration: 1000 },
]

describe("time axis", () => {
  test("the range runs from the earliest start to the latest end", () => {
    expect(spanRange(items)).toEqual([0, 2000])
    expect(spanRange([])).toEqual([0, 0])
  })

  test("a span is placed as a share of the range, clamped to its edges", () => {
    expect(spanPlacement({ start: 500, duration: 500 }, [0, 2000])).toEqual({
      start: 25,
      size: 25,
    })
    expect(spanPlacement({ start: 0, duration: 1000 }, [500, 1500])).toEqual({
      start: 0,
      size: 50,
    })
    expect(spanPlacement({ start: 3000, duration: 10 }, [0, 2000])).toEqual({
      start: 100,
      size: 0,
    })
  })

  test("ticks a step apart read differently, however late the range", () => {
    const labels = (range: [number, number]) =>
      waterfallTicks(range, 6, "en-US").map((tick) => tick.label)
    expect(labels([5000, 5004])).toEqual([
      "5 sec",
      "5.001 sec",
      "5.002 sec",
      "5.003 sec",
    ])
    expect(labels([120_000, 120_050])).toEqual([
      "2 min",
      "2.0002 min",
      "2.0003 min",
      "2.0005 min",
      "2.0007 min",
    ])
  })

  test("ticks fall on round times and never pass the limit", () => {
    expect(tickTimes([0, 2000], 6)).toEqual([0, 500, 1000, 1500])
    expect(tickTimes([0, 1], 6)).toEqual([0, 0.2, 0.4, 0.6, 0.8])
    expect(tickTimes([120, 980], 4)).toEqual([200, 400, 600])
    expect(tickTimes([120, 980], 2)).toEqual([500])
    expect(tickTimes([0, 820], 6)).toEqual([0, 200, 400, 600])
    expect(tickTimes([0, 920], 6)).toEqual([0, 200, 400, 600])
    for (const max of [2, 3, 5, 8]) {
      expect(tickTimes([0, 12345], max).length).toBeLessThanOrEqual(max)
    }
  })

  test("times read in milliseconds, seconds or minutes", () => {
    expect(formatTime(340, "en-US")).toBe("340 ms")
    expect(formatTime(1250, "en-US")).toBe("1.25 sec")
    expect(formatTime(90_000, "en-US")).toBe("1.5 min")
    expect(formatTime(500, "en-US", undefined, 2000)).toBe("0.5 sec")
    expect(formatTime(5, "en-US", (ms) => `${ms}ms`)).toBe("5ms")
  })
})

describe("waterfall rows", () => {
  test("rows render their level, place, expansion and placement on the server", () => {
    const instance = waterfall({ id: "w", items, defaultExpanded: ["page"] })
    const row = (value: string) =>
      attrs(instance.part("row", { value }), { value })
    expect(row("page")).toMatchObject({
      role: "row",
      "aria-level": "1",
      "aria-posinset": "1",
      "aria-setsize": "2",
      "aria-expanded": "true",
      "aria-selected": undefined,
      tabindex: "0",
      style: "--waterfall-level:1;--waterfall-start:0%;--waterfall-size:50%",
    })
    expect(row("js")).toMatchObject({
      "aria-level": "2",
      "aria-posinset": "2",
      "aria-setsize": "2",
      "aria-expanded": "false",
      tabindex: "-1",
    })
    expect(row("api").hidden).toBe("")
    expect(row("css").hidden).toBeUndefined()
  })

  test("the bar names the span's start and duration, in a label of your own too", () => {
    const bar = (instance: ReturnType<typeof waterfall>) =>
      attrs(instance.part("bar", { value: "api" }), { value: "api" })[
        "aria-label"
      ]
    expect(bar(waterfall({ id: "w", items }))).toBe(
      "Starts at 600 ms, lasts 300 ms"
    )
    expect(
      bar(
        waterfall({
          id: "w",
          items,
          getBarLabel: (item, { start, duration }) =>
            `${item.label} ${start} ${duration}`,
        })
      )
    ).toBe("GET /api/user 600 ms 300 ms")
  })

  test("a range of your own moves every bar", () => {
    const instance = waterfall({ id: "w", items, range: [500, 1000] })
    expect(
      attrs(instance.part("row", { value: "api" }), { value: "api" }).style
    ).toContain("--waterfall-start:20%;--waterfall-size:60%")
    expect(partState(instance.part("root", {}), {})).toEqual({
      range: [500, 1000],
    })
  })

  test("the axis follows a range changed in place", () => {
    const range: [number, number] = [0, 1000]
    const instance = waterfall({ id: "w", items, range })
    const ticks = () =>
      (
        partState(instance.part("axis", { maxTicks: 3 }), {
          maxTicks: 3,
        }) as { ticks: { time: number }[] }
      ).ticks.map((tick) => tick.time)
    expect(ticks()).toEqual([0, 500])
    range[1] = 100
    instance.setOptions({ id: "w", items, range })
    expect(ticks()).toEqual([0, 50])
  })

  test("the visible rows follow the expanded spans", () => {
    expect(
      visibleWaterfallRows(items, ["page", "js"]).map((row) => [
        row.item.value,
        row.level,
        row.index,
      ])
    ).toEqual([
      ["page", 1, 0],
      ["css", 2, 1],
      ["js", 2, 2],
      ["api", 3, 3],
      ["font", 1, 4],
    ])
  })

  test("the controller expands, collapses and selects", () => {
    const controller = createWaterfallController()
    const instance = kept(waterfall({ id: "w", items, controller }))
    expect(controller.expandAll()).toBe(true)
    expect(controller.getExpanded()).toEqual(["page", "js"])
    expect(controller.collapse("js")).toBe(true)
    expect(controller.isExpanded("js")).toBe(false)
    expect(controller.collapse("css")).toBe(false)
    expect(controller.setValue("api")).toBe(true)
    expect(controller.getValue()).toBe("api")
    instance.destroy()
  })
})

describe("waterfall parts select on their own row", () => {
  const values = ["page", "css", "js", "api", "font"]
  const parts: Part[] = [
    { slot: "root", props: {} },
    { slot: "axis", props: {} },
    { slot: "tick", props: { time: 500 } },
    { slot: "mark", props: { time: 820 } },
    ...values.flatMap((value) => [
      { slot: "row", props: { value } },
      { slot: "row-header", props: { value } },
      { slot: "indicator", props: { value } },
      { slot: "cell", props: { value } },
      { slot: "bar", props: { value } },
    ]),
  ]

  test("selecting, expanding and moving the stop reach the rows they change", async () => {
    const instance = kept(waterfall({ id: "w", items }))
    const api = instance.api
    const heard = await expectNoMissedUpdates(instance, parts, [
      ["select", () => api.setValue("css")],
      ["select another", () => api.setValue("api")],
      ["clear", () => api.setValue(null)],
      ["expand", () => api.expand("page")],
      ["expand nested", () => api.expand("js")],
      ["collapse", () => api.collapse("page")],
      ["move the stop", () => instance.api.roving.remember("js")],
      ["move it again", () => instance.api.roving.remember("font")],
      ["focus a cell", () => instance.api.roving.remember("css")],
    ])
    // A selection reaches the root and the parts of the two rows it moves between.
    expect(heard["select another"]).toBeLessThanOrEqual(1 + 2 * 5)
    expect(heard["move it again"]).toBeLessThanOrEqual(1 + 2 * 5)
    instance.destroy()
  })
})
