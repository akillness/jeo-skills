// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest"
import { createVirtualizer } from "../src/index"

// jsdom has no find in page: stand in for it.
beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
  Object.defineProperty(HTMLElement.prototype, "onbeforematch", {
    value: null,
    writable: true,
    configurable: true,
  })
})

let cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup())
  cleanups = []
  document.body.innerHTML = ""
})

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
const microtask = () =>
  new Promise((resolve) => queueMicrotask(() => resolve(undefined)))
// The stand-ins load with the module they live in.
const loaded = () => vi.dynamicImportSettled()

// A scroller of a fixed size whose scroll position can be set, as jsdom has no layout.
function scroller(height: number, contentHeight: () => number) {
  const el = document.createElement("div")
  let top = 0
  Object.defineProperties(el, {
    clientHeight: { get: () => height },
    clientWidth: { get: () => 300 },
    scrollHeight: { get: () => Math.max(height, contentHeight()) },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = Math.max(
          0,
          Math.min(value, Math.max(0, contentHeight() - height))
        )
      },
    },
  })
  el.scrollTo = ((options: ScrollToOptions) => {
    el.scrollTop = options.top ?? top
  }) as typeof el.scrollTo
  document.body.append(el)
  return el
}

const scrollTo = (el: HTMLElement, top: number) => {
  el.scrollTop = top
  el.dispatchEvent(new Event("scroll"))
}

const label = (index: number) =>
  `Row ${index}${index % 100 === 0 ? " needle" : ""}`

// 1000 rows of 20px in a 100px scroller, findable.
async function list(connect = { findable: true }) {
  const rows = createVirtualizer({
    count: () => 1000,
    estimate: () => 20,
    overscan: 2,
    findable: label,
  })
  const el = scroller(100, () => rows.size())
  cleanups.push(rows.connect(el, connect))
  await loaded()
  return { rows, el }
}

// Renders the rows the list asks for, measured, in row order, like a keyed framework list.
function render(rows: ReturnType<typeof createVirtualizer>, el: HTMLElement) {
  const content = document.createElement("div")
  el.insertBefore(content, el.lastElementChild)
  const shown = new Map<number, HTMLElement>()
  const draw = () => {
    const want = new Set(rows.items().map((item) => item.index))
    for (const [index, row] of shown) {
      if (!want.has(index)) {
        row.remove()
        shown.delete(index)
      }
    }
    for (const item of rows.items()) {
      if (!shown.has(item.index)) {
        const row = document.createElement("div")
        row.textContent = label(item.index)
        shown.set(item.index, row)
        rows.measure(item.index, row)
      }
    }
    for (const item of rows.items()) {
      shown.get(item.index)!.toggleAttribute("data-found", !!item.found)
    }
    content.replaceChildren(
      ...[...shown.entries()].sort(([a], [b]) => a - b).map(([, row]) => row)
    )
  }
  draw()
  cleanups.push(rows.subscribe(draw))
  return { shown, content }
}

// The stand-ins in the page, in document order.
const standIns = (root: Element) =>
  [
    ...root.querySelectorAll("[data-findable-layer] > div > div"),
  ] as HTMLElement[]
const standIn = (root: Element, index: number) =>
  standIns(root).find((el) => el.textContent === label(index))!
const indexOf = (el: Element) =>
  Number(/Row (\d+)/.exec(el.textContent ?? "")![1])
const all = Array.from({ length: 1000 }, (_, index) => index)
const order = (el: Element, content: Element) =>
  [...standIns(el), ...content.children]
    .sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1))
    .map(indexOf)
    .filter((value, i, list) => list.indexOf(value) === i)

describe("findable rows", () => {
  test("stand-ins sit before and after the rows in row order, and rendered rows have none", async () => {
    const { rows, el } = await list()
    const { content } = render(rows, el)
    expect(el.firstElementChild!.hasAttribute("data-findable-layer")).toBe(true)
    expect(el.lastElementChild!.hasAttribute("data-findable-layer")).toBe(true)
    expect(order(el, content)).toEqual(all)
    for (const node of standIns(el)) {
      expect(node.getAttribute("hidden")).toBe("until-found")
    }
    scrollTo(el, 4000)
    expect(order(el, content)).toEqual(all)
    expect(standIns(el)).toHaveLength(1000 - rows.items().length)
  })

  test("the order holds through small scrolls both ways and a run of matches", async () => {
    const { rows, el } = await list()
    const { shown, content } = render(rows, el)
    for (const top of [
      0, 30, 75, 140, 200, 1990, 2060, 2100, 2040, 1980, 150, 90, 20,
    ]) {
      scrollTo(el, top)
      expect(order(el, content), `at ${top}px`).toEqual(all)
    }
    // Every eighth row, as the find bar would step through them.
    for (let index = 16; index <= 400; index += 8) {
      const target = standIns(el).find(
        (node) => node.textContent === label(index)
      )
      if (!target) {
        continue
      }
      target.dispatchEvent(new Event("beforematch", { bubbles: true }))
      await frame()
      expect(target.parentElement, `after matching ${index}`).toBe(
        shown.get(index)
      )
      expect(order(el, content), `after matching ${index}`).toEqual(all)
    }
  })

  test("without the option, connect adds no layers, and nothing loads", async () => {
    const { el } = await list({ findable: false })
    expect(el.querySelector("[data-findable-layer]")).toBeNull()
  })

  test("a match scrolls the list to the row, marks it found, then moves its stand-in into the row", async () => {
    const { rows, el } = await list()
    const { shown } = render(rows, el)
    const match = standIn(el, 500)
    match.dispatchEvent(new Event("beforematch", { bubbles: true }))
    // Row 500 starts at 10000px; centered in 100px of scroller.
    expect(el.scrollTop).toBe(9960)
    expect(rows.items().find((item) => item.found)?.index).toBe(500)
    expect(shown.get(500)!.hasAttribute("data-found")).toBe(true)
    // Clear and over the row until the browser has scrolled to it; nothing else moves yet.
    expect(match.style).toMatchObject({
      position: "absolute",
      opacity: "0",
      top: "40px",
      height: "20px",
    })
    await frame()
    expect(match.parentElement).toBe(shown.get(500))
    // Out of view again, it's an ordinary stand-in in its place, and nothing is found.
    scrollTo(el, 0)
    expect(match.closest("[data-findable-layer]")).not.toBeNull()
    expect(match.getAttribute("hidden")).toBe("until-found")
    expect(match.getAttribute("style")).toBeNull()
    expect(rows.items().some((item) => item.found)).toBe(false)
  })

  test("pressing in the list ends the found row and puts its stand-in back", async () => {
    const { rows, el } = await list()
    const { shown } = render(rows, el)
    const match = standIn(el, 300)
    match.dispatchEvent(new Event("beforematch", { bubbles: true }))
    await frame()
    el.dispatchEvent(new Event("pointerdown"))
    expect(rows.items().some((item) => item.found)).toBe(false)
    expect(shown.get(300)!.hasAttribute("data-found")).toBe(false)
    expect(match.isConnected).toBe(false)
    scrollTo(el, 0)
    expect(standIn(el, 300)).toBe(match)
  })

  test("refresh keeps the stand-ins and changes only the text that changed, and rebuilds when the count does", async () => {
    let count = 1000
    let suffix = ""
    const rows = createVirtualizer({
      count: () => count,
      estimate: () => 20,
      findable: (index) => `Row ${index}${suffix}`,
    })
    const el = scroller(100, () => rows.size())
    cleanups.push(rows.connect(el, { findable: true }))
    await loaded()
    const before = standIns(el)[500]
    const text = before.firstChild
    rows.refresh()
    expect(standIns(el)[500]).toBe(before)
    suffix = " new"
    rows.refresh()
    expect(standIns(el)[500]).toBe(before)
    expect(before.firstChild).toBe(text)
    expect(before.textContent).toMatch(/ new$/)
    count = 2000
    rows.refresh()
    expect(standIns(el)).toHaveLength(2000 - rows.items().length)
    expect(standIns(el).at(-1)!.textContent).toBe("Row 1999 new")
  })

  test("disconnecting removes the layers", async () => {
    const rows = createVirtualizer({
      count: () => 1000,
      estimate: () => 20,
      findable: label,
    })
    const el = scroller(100, () => rows.size())
    const disconnect = rows.connect(el, { findable: true })
    await loaded()
    expect(el.querySelectorAll("[data-findable-layer]")).toHaveLength(2)
    disconnect()
    expect(el.querySelector("[data-findable-layer]")).toBeNull()
  })
})

// A list whose rows render their text in two slots, the row's number and a word.
const pieces = (index: number) => [
  `Row ${index}`,
  index % 100 === 0 ? "needle" : "plain",
]
async function slottedList(connect = { findable: true }) {
  const rows = createVirtualizer({
    count: () => 1000,
    estimate: () => 20,
    overscan: 2,
    findable: pieces,
  })
  const el = scroller(100, () => rows.size())
  const content = document.createElement("div")
  el.append(content)
  cleanups.push(rows.connect(el, connect))
  const shown = new Map<
    number,
    { row: HTMLElement; slots: HTMLElement[]; off: (() => void)[] }
  >()
  const draw = () => {
    const want = new Set(rows.items().map((item) => item.index))
    for (const [index, item] of shown) {
      if (!want.has(index)) {
        item.off.forEach((off) => off())
        item.row.remove()
        shown.delete(index)
      }
    }
    for (const index of [...want].sort((a, b) => a - b)) {
      if (!shown.has(index)) {
        const row = document.createElement("div")
        const slots = [
          document.createElement("span"),
          document.createElement("span"),
        ]
        row.append(slots[0], " ", slots[1])
        rows.measure(index, row)
        shown.set(index, {
          row,
          slots,
          off: slots.map((slot, part) => rows.findableText(index, slot, part)),
        })
      }
    }
    content.replaceChildren(
      ...[...shown.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, item]) => item.row)
    )
  }
  draw()
  cleanups.push(rows.subscribe(draw))
  await loaded()
  return { rows, el, shown }
}

const rowTexts = (el: Element) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const found: string[] = []
  while (walker.nextNode()) {
    if (/^Row \d+$/.test(walker.currentNode.textContent!)) {
      found.push(walker.currentNode.textContent!)
    }
  }
  return found
}

describe("findableText slots", () => {
  test("slots show plain text until the stand-ins load, then hold the stand-ins' own text", async () => {
    const rows = createVirtualizer({
      count: () => 1000,
      estimate: () => 20,
      findable: pieces,
    })
    const el = scroller(100, () => rows.size())
    cleanups.push(rows.connect(el, { findable: true }))
    const slot = document.createElement("span")
    rows.findableText(1, slot, 0)
    expect(slot.textContent).toBe("Row 1")
    const plain = slot.firstChild
    await loaded()
    expect(slot.textContent).toBe("Row 1")
    expect(slot.firstChild).not.toBe(plain)
  })

  test("rendered rows show their text through their slots, and every row's text is in the page once", async () => {
    const { el, shown } = await slottedList()
    expect(shown.get(0)!.slots.map((slot) => slot.textContent)).toEqual([
      "Row 0",
      "needle",
    ])
    expect(rowTexts(el)).toEqual(all.map((index) => `Row ${index}`))
    scrollTo(el, 4000)
    await microtask()
    expect(rowTexts(el)).toEqual(all.map((index) => `Row ${index}`))
  })

  test("a match moves the matched text into the row's slots on the next frame", async () => {
    const { rows, el, shown } = await slottedList()
    const match = standIns(el).find((node) =>
      node.textContent?.startsWith("Row 500 ")
    )!
    const matchedText = match.firstChild
    match.dispatchEvent(new Event("beforematch", { bubbles: true }))
    expect(rows.items().find((item) => item.found)?.index).toBe(500)
    // Until the browser has highlighted it, the text stays in the stand-in.
    expect(shown.get(500)!.slots[0].firstChild).not.toBe(matchedText)
    await frame()
    expect(shown.get(500)!.slots[0].firstChild).toBe(matchedText)
    expect(match.isConnected).toBe(false)
  })

  test("a ref that runs again with the same element keeps its text where it is", async () => {
    const { rows, shown } = await slottedList()
    const { slots, off } = shown.get(3)!
    const node = slots[0].firstChild
    const watch = new MutationObserver(() => {})
    watch.observe(slots[0], { childList: true })
    off[0]()
    off[0] = rows.findableText(3, slots[0], 0)
    await microtask()
    expect(watch.takeRecords()).toHaveLength(0)
    expect(slots[0].firstChild).toBe(node)
  })

  // Rows from data that can change, rendered through slots like a framework would.
  async function dataList(connect = { findable: true }) {
    let data = Array.from({ length: 1000 }, (_, index) => ({
      id: `Row ${index}`,
      word: "plain",
    }))
    const rows = createVirtualizer({
      count: () => data.length,
      estimate: () => 20,
      overscan: 2,
      findable: (index) => [data[index].id, data[index].word],
    })
    const el = scroller(100, () => rows.size())
    cleanups.push(rows.connect(el, connect))
    const slots = new Map<number, HTMLElement[]>()
    const offs = new Map<number, (() => void)[]>()
    const draw = () => {
      const want = new Set(rows.items().map((item) => item.index))
      for (const [index, off] of offs) {
        if (!want.has(index)) {
          off.forEach((cleanup) => cleanup())
          offs.delete(index)
          slots.delete(index)
        }
      }
      for (const index of want) {
        if (!slots.has(index)) {
          const own = [
            document.createElement("span"),
            document.createElement("span"),
          ]
          slots.set(index, own)
          offs.set(
            index,
            own.map((slot, part) => rows.findableText(index, slot, part))
          )
        }
      }
    }
    draw()
    await loaded()
    return { rows, el, slots, draw, set: (next: typeof data) => (data = next) }
  }

  test("refresh shows the rows' new text in their slots, with or without the layers", async () => {
    for (const connect of [{ findable: true }, { findable: false }]) {
      const { rows, slots, set } = await dataList(connect)
      set(
        Array.from({ length: 1000 }, (_, index) => ({
          id: `Item ${index}`,
          word: "changed",
        }))
      )
      rows.refresh()
      expect(
        slots.get(1)!.map((slot) => slot.textContent),
        JSON.stringify(connect)
      ).toEqual(["Item 1", "changed"])
      cleanups.forEach((cleanup) => cleanup())
      cleanups = []
    }
  })

  test("after disconnecting, refresh shows the new text too", async () => {
    const { rows, slots, set } = await dataList()
    cleanups.forEach((cleanup) => cleanup())
    cleanups = []
    set(
      Array.from({ length: 1000 }, (_, index) => ({
        id: `Item ${index}`,
        word: "changed",
      }))
    )
    rows.refresh()
    expect(slots.get(1)!.map((slot) => slot.textContent)).toEqual([
      "Item 1",
      "changed",
    ])
  })

  test("filtering bound rows out and refreshing doesn't read past the end", async () => {
    for (const connect of [{ findable: true }, { findable: false }]) {
      const { rows, slots, draw, set } = await dataList(connect)
      set([{ id: "Only", word: "left" }])
      expect(() => rows.refresh(), JSON.stringify(connect)).not.toThrow()
      draw()
      await microtask()
      expect([...slots.keys()]).toEqual([0])
      expect(slots.get(0)!.map((slot) => slot.textContent)).toEqual([
        "Only",
        "left",
      ])
      cleanups.forEach((cleanup) => cleanup())
      cleanups = []
    }
  })

  test("rows that scroll away give their text back even when the framework never runs the cleanup", async () => {
    const rows = createVirtualizer({
      count: () => 1000,
      estimate: () => 20,
      overscan: 2,
      findable: pieces,
    })
    const el = scroller(100, () => rows.size())
    cleanups.push(rows.connect(el, { findable: true }))
    await loaded()
    // Like Vue: the ref runs again on every update, and with null on unmount; what it returns is dropped.
    const bound = new Map<number, HTMLElement[]>()
    const draw = () => {
      for (const item of rows.items()) {
        if (!bound.has(item.index)) {
          const own = [
            document.createElement("span"),
            document.createElement("span"),
          ]
          own.forEach((slot, part) => rows.findableText(item.index, slot, part))
          bound.set(item.index, own)
        }
      }
      for (const [index, own] of bound) {
        if (rows.items().some((item) => item.index === index)) {
          own.forEach((slot, part) => rows.findableText(index, slot, part))
        }
      }
    }
    draw()
    cleanups.push(rows.subscribe(draw))
    expect(bound.get(1)![0].textContent).toBe("Row 1")
    scrollTo(el, 8000)
    expect(
      standIns(el).find((node) => node.textContent?.startsWith("Row 1 "))
        ?.textContent
    ).toBe("Row 1 plain")
    scrollTo(el, 0)
    expect(bound.get(1)![0].textContent).toBe("Row 1")
  })

  test("without the layers, slots show plain text", async () => {
    const { shown } = await slottedList({ findable: false })
    expect(shown.get(2)!.slots.map((slot) => slot.textContent)).toEqual([
      "Row 2",
      "plain",
    ])
  })
})
