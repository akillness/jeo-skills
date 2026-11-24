// Chips that collapse to "+N more" when they don't fit on the chips' first
// line, once a chips-overflow part is rendered. Widths come from a
// ResizeObserver, which reports them after layout, so nothing is measured by
// forcing layout, and hidden chips keep the width they last had. Decisions are
// a pure function of those widths.

// How many chips fit on one line of `available` pixels, in order, leaving
// room for the input and, when some don't fit, for the overflow part. A chip
// never measured, like one just added while others were hidden, is shown when
// everything before it fits, so it can be measured.
function chipsThatFit({
  available,
  gap,
  widths,
  overflow,
  reserve,
}: {
  available: number
  gap: number
  // Each chip's width, or undefined when it has never been measured.
  widths: (number | undefined)[]
  overflow: number
  // The input's minimum width.
  reserve: number
}) {
  // Whether `count` chips, `used` pixels wide, fit beside `extra` and the input.
  const fit = (count: number, used: number, extra: number) =>
    (count ? used + gap : 0) + extra + reserve <= available
  const unknown = widths.indexOf(undefined)
  const measured = unknown === -1 ? widths.length : unknown
  let used = 0
  let fits = 0
  // Every width before `measured` is known.
  for (let index = 0; index < measured; index++) {
    used += (index ? gap : 0) + widths[index]!
    if (fits === index && fit(index + 1, used, overflow + gap)) {
      fits = index + 1
    }
  }
  if (unknown === -1) {
    return fit(widths.length, used, 0) ? widths.length : fits
  }
  return fits === measured ? measured + 1 : fits
}

// Watches the chips around a combobox's input and reports how many fit, or
// null when all of them do. `chips` are in value order.
function bindChipsOverflow(
  container: HTMLElement,
  {
    chips,
    overflow,
    input,
    report,
    subscribe,
  }: {
    chips: () => HTMLElement[]
    overflow: HTMLElement
    input: () => HTMLElement | undefined
    report: (visible: number | null) => void
    subscribe: (listener: () => void) => () => void
  }
) {
  if (typeof ResizeObserver === "undefined") {
    return () => {}
  }
  const widths = new WeakMap<Element, number>()
  const observed = new Set<Element>()
  let available = 0
  let frame = 0

  // Decides in the next frame, after this one's layout, and writes nothing here.
  const schedule = () => {
    if (!frame) {
      frame = requestAnimationFrame(decide)
    }
  }
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const box = entry.borderBoxSize?.[0]
      if (entry.target === container) {
        available =
          entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width
        continue
      }
      const width = box?.inlineSize ?? entry.contentRect.width
      // A hidden chip reports nothing, and keeps the width it had.
      if (width > 0) {
        widths.set(entry.target, width)
      }
    }
    schedule()
  })

  function observe() {
    const current = new Set<Element>([container, overflow, ...chips()])
    for (const el of current) {
      if (!observed.has(el)) {
        observer.observe(el, { box: "border-box" })
      }
    }
    for (const el of observed) {
      if (!current.has(el)) {
        observer.unobserve(el)
      }
    }
    observed.clear()
    for (const el of current) {
      observed.add(el)
    }
  }

  function decide() {
    frame = 0
    const list = chips()
    const style = getComputedStyle(container)
    const field = input()
    const visible = chipsThatFit({
      available,
      gap: parseFloat(style.columnGap) || 0,
      widths: list.map((el) => widths.get(el)),
      overflow: widths.get(overflow) ?? 0,
      reserve: field ? parseFloat(getComputedStyle(field).minWidth) || 0 : 0,
    })
    report(visible >= list.length ? null : visible)
  }

  observe()
  // Chips come and go with the value.
  let seen = chips()
  const unsubscribe = subscribe(() => {
    const next = chips()
    if (
      next.length === seen.length &&
      next.every((el, index) => el === seen[index])
    ) {
      return
    }
    seen = next
    observe()
    schedule()
  })
  return () => {
    unsubscribe()
    observer.disconnect()
    cancelAnimationFrame(frame)
  }
}

export { bindChipsOverflow, chipsThatFit }
