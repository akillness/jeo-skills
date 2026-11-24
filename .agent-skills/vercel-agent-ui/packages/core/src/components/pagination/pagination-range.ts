// Which page numbers a pagination shows, and where the gaps go. Pure, so it
// runs anywhere: on the server and in any app's own markup.

/**
 * One entry of a pagination's range: a page number, or a gap before or after the current page's neighbours.
 * @stable
 */
type PaginationRangeItem = number | "ellipsis-start" | "ellipsis-end"

/**
 * What `paginationRange()` takes.
 * @stable
 */
type PaginationRangeOptions = {
  /** The current page, from 1. Clamped to the range. */
  page: number
  /** How many pages there are. */
  pageCount: number
  /**
   * How many pages show on each side of the current one.
   * @defaultValue 1
   */
  siblings?: number
  /**
   * How many pages always show at each end.
   * @defaultValue 1
   */
  boundaries?: number
}

// Counts are whole and never negative.
const count = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : fallback

const span = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index)

/**
 * The pages to show, with an ellipsis for each gap. The list has the same
 * length on every page of a given count, so links never shift under the
 * pointer while paging, and a gap of one page shows that page instead.
 *
 * ```ts
 * paginationRange({ page: 5, pageCount: 10 }) // [1, "ellipsis-start", 4, 5, 6, "ellipsis-end", 10]
 * ```
 * @stable
 */
function paginationRange({
  page,
  pageCount,
  siblings,
  boundaries,
}: PaginationRangeOptions) {
  const total = count(pageCount, 0)
  const around = count(siblings, 1)
  const ends = count(boundaries, 1)
  if (total === 0) {
    return [] as PaginationRangeItem[]
  }
  const current = clampPage(page, total)
  // Both ends, the current page with its siblings, and two gaps.
  const slots = 2 * ends + 2 * around + 3
  if (total <= slots) {
    return span(1, total) as PaginationRangeItem[]
  }
  // The window around the current page slides to stay clear of the ends, so the length never changes.
  const start = Math.min(
    Math.max(current - around, ends + 2),
    total - ends - 1 - 2 * around
  )
  const end = start + 2 * around
  return [
    ...span(1, ends),
    start > ends + 2 ? "ellipsis-start" : ends + 1,
    ...span(start, end),
    end < total - ends - 1 ? "ellipsis-end" : total - ends,
    ...span(total - ends + 1, total),
  ] as PaginationRangeItem[]
}

/** A page number brought within 1 and `pageCount`. Anything that isn't a number is page 1. */
function clampPage(page: number, pageCount: number) {
  if (!Number.isFinite(page)) {
    return 1
  }
  return Math.min(Math.max(Math.round(page), 1), Math.max(1, pageCount))
}

/** How many pages `total` items fill, `pageSize` to a page. Never less than 1. */
function pageCountOf(total: number, pageSize: number) {
  if (!Number.isFinite(total) || !Number.isFinite(pageSize) || pageSize <= 0) {
    return 1
  }
  return Math.max(1, Math.ceil(total / pageSize))
}

export {
  clampPage,
  pageCountOf,
  paginationRange,
  type PaginationRangeItem,
  type PaginationRangeOptions,
}
