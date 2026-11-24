import { describe, expect, test, vi } from "vitest"
import {
  pagination,
  paginationRange,
} from "../src/components/pagination/pagination"
import {
  clampPage,
  pageCountOf,
} from "../src/components/pagination/pagination-range"
import { attrs, partState, press } from "../src/foundation/kernel/part"

const range = (
  page: number,
  pageCount: number,
  siblings?: number,
  boundaries?: number
) => paginationRange({ page, pageCount, siblings, boundaries })

// Every page of a count, as one string per page, for compact expectations.
const every = (pageCount: number, siblings?: number, boundaries?: number) =>
  Array.from({ length: pageCount }, (_, index) =>
    range(index + 1, pageCount, siblings, boundaries)
      .map((item) =>
        item === "ellipsis-start" || item === "ellipsis-end" ? "…" : item
      )
      .join(" ")
  )

describe("paginationRange", () => {
  test("no pages is an empty range", () => {
    expect(range(1, 0)).toEqual([])
    expect(range(3, -2)).toEqual([])
  })

  test("one page is just that page", () => {
    expect(range(1, 1)).toEqual([1])
  })

  test("counts that fit show every page", () => {
    expect(range(1, 2)).toEqual([1, 2])
    expect(range(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  test("the first page past the fit gets one gap", () => {
    expect(every(8)).toEqual([
      "1 2 3 4 5 … 8",
      "1 2 3 4 5 … 8",
      "1 2 3 4 5 … 8",
      "1 2 3 4 5 … 8",
      "1 … 4 5 6 7 8",
      "1 … 4 5 6 7 8",
      "1 … 4 5 6 7 8",
      "1 … 4 5 6 7 8",
    ])
  })

  test("the middle of a long range has a gap on each side", () => {
    expect(range(5, 10)).toEqual([
      1,
      "ellipsis-start",
      4,
      5,
      6,
      "ellipsis-end",
      10,
    ])
    expect(range(50, 100)).toEqual([
      1,
      "ellipsis-start",
      49,
      50,
      51,
      "ellipsis-end",
      100,
    ])
  })

  test("the length never changes across the pages of a count", () => {
    for (const [count, siblings, boundaries] of [
      [10, 1, 1],
      [100, 2, 1],
      [37, 0, 0],
      [50, 3, 2],
      [12, 1, 2],
      [1000, 1, 1],
    ]) {
      const lengths = new Set(
        every(count, siblings, boundaries).map((line) => line.split(" ").length)
      )
      expect(
        lengths.size,
        `${count} pages, ${siblings} siblings, ${boundaries} boundaries`
      ).toBe(1)
    }
  })

  test("a gap of one page shows that page instead", () => {
    expect(range(4, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 10])
    expect(range(7, 10)).toEqual([1, "ellipsis-start", 6, 7, 8, 9, 10])
  })

  test("every page appears once, in order, and the current one is always there", () => {
    for (const count of [1, 2, 7, 8, 9, 10, 23, 100]) {
      for (let page = 1; page <= count; page++) {
        const pages = range(page, count).filter(
          (item) => typeof item === "number"
        )
        expect(pages).toContain(page)
        expect(pages).toEqual([...pages].sort((a, b) => a - b))
        expect(new Set(pages).size).toBe(pages.length)
        expect(pages[0]).toBe(1)
        expect(pages.at(-1)).toBe(count)
      }
    }
  })

  test("ellipses only stand for hidden pages", () => {
    for (const count of [8, 9, 10, 15, 64]) {
      for (let page = 1; page <= count; page++) {
        const items = range(page, count)
        items.forEach((item, index) => {
          if (typeof item === "number") {
            return
          }
          const before = items[index - 1] as number
          const after = items[index + 1] as number
          expect(
            after - before,
            `${item} on page ${page} of ${count}`
          ).toBeGreaterThan(2)
        })
      }
    }
  })

  test("siblings widen the window around the current page", () => {
    expect(range(10, 20, 0)).toEqual([
      1,
      "ellipsis-start",
      10,
      "ellipsis-end",
      20,
    ])
    expect(range(10, 20, 2)).toEqual([
      1,
      "ellipsis-start",
      8,
      9,
      10,
      11,
      12,
      "ellipsis-end",
      20,
    ])
    expect(range(10, 20, 3)).toEqual([
      1,
      "ellipsis-start",
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      "ellipsis-end",
      20,
    ])
  })

  test("even and odd sibling counts both keep the window centered on the current page", () => {
    for (const siblings of [0, 1, 2, 3, 4]) {
      const items = range(50, 100, siblings)
      const middle = items.indexOf(50)
      expect(items.slice(middle - siblings, middle + siblings + 1)).toEqual(
        Array.from(
          { length: 2 * siblings + 1 },
          (_, index) => 50 - siblings + index
        )
      )
    }
  })

  test("boundaries keep more pages at each end", () => {
    expect(range(10, 20, 1, 2)).toEqual([
      1,
      2,
      "ellipsis-start",
      9,
      10,
      11,
      "ellipsis-end",
      19,
      20,
    ])
    expect(range(10, 20, 1, 0)).toEqual([
      "ellipsis-start",
      9,
      10,
      11,
      "ellipsis-end",
    ])
  })

  test("no boundaries still shows the end page when the gap would hide only it", () => {
    expect(range(1, 20, 1, 0)).toEqual([1, 2, 3, 4, "ellipsis-end"])
    expect(range(2, 20, 1, 0)).toEqual([1, 2, 3, 4, "ellipsis-end"])
    expect(range(20, 20, 1, 0)).toEqual(["ellipsis-start", 17, 18, 19, 20])
  })

  test("pages out of range are clamped", () => {
    expect(range(0, 10)).toEqual(range(1, 10))
    expect(range(99, 10)).toEqual(range(10, 10))
    expect(range(Number.NaN, 10)).toEqual(range(1, 10))
  })

  test("fractions and negative settings are made whole and non-negative", () => {
    expect(range(5.4, 10.9, 1.7, 1.2)).toEqual(range(5, 10, 1, 1))
    expect(range(5, 10, -3, -1)).toEqual(range(5, 10, 0, 0))
    expect(range(5, 10, Number.NaN, Number.POSITIVE_INFINITY)).toEqual(
      range(5, 10, 1, 1)
    )
  })

  test("a huge count stays short", () => {
    const items = range(500_000, 1_000_000)
    expect(items).toEqual([
      1,
      "ellipsis-start",
      499_999,
      500_000,
      500_001,
      "ellipsis-end",
      1_000_000,
    ])
  })

  test("the ends of a long range", () => {
    expect(range(1, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis-end", 10])
    expect(range(10, 10)).toEqual([1, "ellipsis-start", 6, 7, 8, 9, 10])
  })
})

describe("page helpers", () => {
  test("clampPage keeps pages within the count, and at least 1", () => {
    expect(clampPage(0, 5)).toBe(1)
    expect(clampPage(6, 5)).toBe(5)
    expect(clampPage(3, 0)).toBe(1)
    expect(clampPage(2.6, 5)).toBe(3)
  })

  test("pageCountOf rounds up, and is never less than 1", () => {
    expect(pageCountOf(95, 10)).toBe(10)
    expect(pageCountOf(100, 10)).toBe(10)
    expect(pageCountOf(101, 10)).toBe(11)
    expect(pageCountOf(0, 10)).toBe(1)
    expect(pageCountOf(10, 0)).toBe(1)
  })
})

describe("pagination primitive", () => {
  const create = (options: Parameters<typeof pagination>[0]) =>
    pagination(options)

  test("starts on page 1, or the default page", () => {
    expect(create({ id: "p", pageCount: 5 }).api.getPage()).toBe(1)
    expect(
      create({ id: "p", pageCount: 5, defaultPage: 3 }).api.getPage()
    ).toBe(3)
  })

  test("pageCount comes from total and pageSize", () => {
    expect(
      create({ id: "p", total: 95, pageSize: 20 }).api.getPageCount()
    ).toBe(5)
    expect(create({ id: "p", total: 95 }).api.getPageCount()).toBe(10)
  })

  test("next, previous, first and last stop at the ends", () => {
    const onPageChange = vi.fn()
    const { api } = create({ id: "p", pageCount: 3, onPageChange })
    expect(api.previous()).toBe(false)
    expect(api.next()).toBe(true)
    expect(api.last()).toBe(true)
    expect(api.next()).toBe(false)
    expect(api.getPage()).toBe(3)
    expect(api.first()).toBe(true)
    expect(
      onPageChange.mock.calls.map(([page, details]) => [page, details.reason])
    ).toEqual([
      [2, "imperative"],
      [3, "imperative"],
      [1, "imperative"],
    ])
  })

  test("setPage clamps, and does nothing for the current page", () => {
    const onPageChange = vi.fn()
    const { api } = create({ id: "p", pageCount: 4, onPageChange })
    expect(api.setPage(9)).toBe(true)
    expect(api.getPage()).toBe(4)
    expect(api.setPage(4)).toBe(false)
    expect(onPageChange).toHaveBeenCalledTimes(1)
  })

  test("a canceled change keeps the page", () => {
    const { api } = create({
      id: "p",
      pageCount: 4,
      onPageChange: (_, details) => details.cancel(),
    })
    expect(api.next()).toBe(false)
    expect(api.getPage()).toBe(1)
  })

  test("a controlled page waits for the owner", () => {
    const instance = create({
      id: "p",
      pageCount: 4,
      page: 2,
      onPageChange: () => {},
    })
    instance.api.next({ reason: "next-press" })
    expect(instance.api.getPage()).toBe(2)
    instance.setOptions({ id: "p", pageCount: 4, page: 3 })
    expect(instance.api.getPage()).toBe(3)
  })

  test("a controlled page past a shrinking count shows the last page", () => {
    const instance = create({ id: "p", pageCount: 10, page: 9 })
    instance.setOptions({ id: "p", pageCount: 4, page: 9 })
    expect(instance.api.getPage()).toBe(4)
    expect(partState(instance.part("root", {})).items).toEqual([1, 2, 3, 4])
  })

  test("the range is the same array until it changes", () => {
    const instance = create({ id: "p", pageCount: 20, defaultPage: 10 })
    const first = partState(instance.part("list", {})).items
    expect(partState(instance.part("list", {})).items).toBe(first)
    instance.api.next()
    expect(partState(instance.part("list", {})).items).not.toBe(first)
  })

  test("parts are buttons, or links with getHref", () => {
    const buttons = create({ id: "p", pageCount: 5, defaultPage: 2 })
    expect(attrs(buttons.part("link", { page: 2 }))).toMatchObject({
      type: "button",
      "aria-current": "page",
    })
    expect(
      attrs(buttons.part("link", { page: 3 }))["aria-current"]
    ).toBeUndefined()
    const links = create({
      id: "p",
      pageCount: 5,
      getHref: (page) => `?page=${page}`,
    })
    expect(attrs(links.part("link", { page: 3 }))).toMatchObject({
      href: "?page=3",
    })
    expect(attrs(links.part("link", { page: 3 })).type).toBeUndefined()
    expect(attrs(links.part("next", {}))).toMatchObject({ href: "?page=2" })
  })

  test("a step at its end is aria-disabled, and a link loses its href", () => {
    const buttons = create({ id: "p", pageCount: 5 })
    expect(attrs(buttons.part("previous", {}))).toMatchObject({
      "aria-disabled": "true",
    })
    expect(attrs(buttons.part("previous", {})).disabled).toBeUndefined()
    expect(attrs(buttons.part("first", {}))).toMatchObject({
      "aria-disabled": "true",
    })
    expect(attrs(buttons.part("next", {}))["aria-disabled"]).toBeUndefined()
    const links = create({
      id: "p",
      pageCount: 5,
      getHref: (page) => `?page=${page}`,
    })
    expect(attrs(links.part("previous", {}))).toMatchObject({
      role: "link",
      "aria-disabled": "true",
    })
    expect(attrs(links.part("previous", {})).href).toBeUndefined()
  })
})

describe("pagination without a DOM", () => {
  test("presses without an event page it", () => {
    const instance = pagination({ id: "p", pageCount: 5 })
    press(instance.part("next", {}))?.()
    expect(instance.api.getPage()).toBe(2)
    press(instance.part("link", { page: 4, id: "4" }))?.()
    expect(instance.api.getPage()).toBe(4)
    press(instance.part("last", {}))?.()
    press(instance.part("next", {}))?.()
    expect(instance.api.getPage()).toBe(5)
  })

  test("a disabled pagination ignores presses on every page and step, but not its controller", () => {
    const instance = pagination({
      id: "p",
      pageCount: 5,
      defaultPage: 2,
      disabled: true,
      getHref: (page) => `?page=${page}`,
    })
    for (const part of [
      instance.part("next", {}),
      instance.part("previous", {}),
      instance.part("link", { page: 4 }),
    ]) {
      expect(attrs(part)).toMatchObject({
        role: "link",
        "aria-disabled": "true",
        "data-disabled": "",
      })
      expect(attrs(part).href).toBeUndefined()
      press(part)?.()
    }
    expect(attrs(instance.part("root", {}))["data-disabled"]).toBe("")
    expect(instance.api.getPage()).toBe(2)
    expect(instance.api.next()).toBe(true)
    expect(instance.api.getPage()).toBe(3)
  })

  test("a controller step in the same task as a step link's press goes from the new page", () => {
    const instance = pagination({
      id: "p",
      pageCount: 5,
      getHref: (page) => `?page=${page}`,
    })
    const link = { matches: () => true } as unknown as HTMLElement
    instance.api.internal.press("next", { page: 2 }, undefined, link)
    expect(instance.api.getPage()).toBe(2)
    expect(instance.api.next()).toBe(true)
    expect(instance.api.getPage()).toBe(3)
  })
})
