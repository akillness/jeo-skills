// The pure decisions behind resizable panels: sizes and their units, the
// constraints each panel puts on the layout, and how a layout moves when a
// handle does. No DOM here, so every rule is unit tested
// (packages/core/test/resizable.test.ts).
import { clamp } from "../../foundation/number/steps"

/**
 * A panel size: a percentage of the group as a number, like `30`, or a string
 * with a unit: `"30%"`, `"240px"` or `"16rem"`. Pixel sizes follow the group's
 * size as it changes.
 * @stable
 */
type ResizableSize = number | `${number}%` | `${number}px` | `${number}rem`

/** What a panel allows, in percentages of the space panels share. */
type PanelConstraints = {
  min: number
  max: number
  collapsible: boolean
  // The size it collapses to, at most `min`.
  collapsed: number
  // Where it starts, if it says.
  initial: number | undefined
}

/** The size props a panel passes, as written. */
type PanelSizes = {
  defaultSize?: ResizableSize
  minSize?: ResizableSize
  maxSize?: ResizableSize
  collapsible?: boolean
  collapsedSize?: ResizableSize
}

// Sizes closer than this are the same. Drags divide pixels by the group's
// size, so floats rarely land exactly.
const epsilon = 1e-6

const sameSize = (a: number, b: number) => Math.abs(a - b) < epsilon

function sameLayout(a: readonly number[], b: readonly number[]) {
  return (
    a.length === b.length && a.every((size, index) => sameSize(size, b[index]))
  )
}

const sum = (sizes: readonly number[]) =>
  sizes.reduce((total, size) => total + size, 0)

// Whether a size needs the group's pixels to resolve: "240px" and "16rem"
// do. Numbers, percentages and plain numbers written as text, like an
// attribute's "30", are percentages.
const isAbsolute = (size: ResizableSize | undefined) =>
  typeof size === "string" && /(px|rem)\s*$/.test(size)

/**
 * A size in percent of `space`, the pixels panels share. Pixel and rem sizes
 * can't be resolved before the group is measured, so they're undefined then.
 */
function toPercent(
  size: ResizableSize | undefined,
  space: number,
  remSize = 16
) {
  if (size === undefined) {
    return undefined
  }
  const value = typeof size === "number" ? size : parseFloat(size)
  if (Number.isNaN(value)) {
    return undefined
  }
  if (!isAbsolute(size)) {
    return value
  }
  if (space <= 0) {
    return undefined
  }
  return (
    (((size as string).trim().endsWith("rem") ? value * remSize : value) /
      space) *
    100
  )
}

/** A size as CSS, for the server's first paint: percentages unless it says otherwise. */
const toCSS = (size: ResizableSize) =>
  isAbsolute(size) ? String(size).trim() : `${parseFloat(String(size))}%`

function constraintsOf(sizes: PanelSizes, space: number, remSize?: number) {
  const min = clamp(toPercent(sizes.minSize, space, remSize) ?? 0, 0, 100)
  const max = clamp(toPercent(sizes.maxSize, space, remSize) ?? 100, min, 100)
  const initial = toPercent(sizes.defaultSize, space, remSize)
  return {
    min,
    max,
    collapsible: !!sizes.collapsible,
    collapsed: clamp(
      toPercent(sizes.collapsedSize, space, remSize) ?? 0,
      0,
      min
    ),
    initial: initial === undefined ? undefined : clamp(initial, 0, 100),
  }
}

// The smallest a panel gets: collapsed if it can, else its minimum.
const lowest = (panel: PanelConstraints) =>
  panel.collapsible ? panel.collapsed : panel.min

const isCollapsed = (panel: PanelConstraints, size: number) =>
  panel.collapsible &&
  size <= panel.collapsed + epsilon &&
  panel.collapsed < panel.min

// Whether a panel may be this size: within its bounds, or collapsed.
function allowed(panel: PanelConstraints, size: number) {
  if (size >= panel.min - epsilon && size <= panel.max + epsilon) {
    return true
  }
  return panel.collapsible && sameSize(size, panel.collapsed)
}

/**
 * The size a panel takes when asked for `target`, coming from `current`.
 * Between collapsed and the minimum it snaps to one or the other: an open
 * panel collapses once the target falls below `threshold` of that span, and a
 * collapsed one opens once the target passes the same share from the other
 * end. Pointers use half the span. Keys use all of it, so one step past the
 * minimum collapses, and one step out of collapsed opens.
 */
function settle(
  panel: PanelConstraints,
  target: number,
  current: number,
  threshold = 0.5
) {
  if (target >= panel.min - epsilon) {
    return clamp(target, panel.min, panel.max)
  }
  if (!panel.collapsible) {
    return panel.min
  }
  const span = panel.min - panel.collapsed
  if (current <= panel.collapsed + epsilon) {
    return target > panel.collapsed + span * (1 - threshold) + epsilon
      ? panel.min
      : panel.collapsed
  }
  return target < panel.collapsed + span * threshold - epsilon
    ? panel.collapsed
    : panel.min
}

/**
 * The layout after moving handle `handle`, which sits between panels
 * `handle` and `handle + 1`, by `delta` percent. Positive moves it toward the
 * end. The panel on the side it moves away from grows; the other side shrinks
 * from the handle outward, so a panel at its minimum passes the rest on to the
 * next one, up to a handle `locked` marks, which keeps the panels past it as
 * they are. Returns the same array when nothing can move.
 */
function resizeAt(
  layout: readonly number[],
  panels: readonly PanelConstraints[],
  handle: number,
  delta: number,
  threshold = 0.5,
  locked: readonly boolean[] = []
) {
  if (Math.abs(delta) < epsilon || handle < 0 || handle >= layout.length - 1) {
    return layout
  }
  const forward = delta > 0
  const pivot = forward ? handle : handle + 1
  const shrinking = shrinkable(layout.length, handle, forward, locked)
  const start = layout[pivot]
  const room = panels[pivot].max - start
  const capacity = sum(
    shrinking.map((index) => Math.max(0, layout[index] - lowest(panels[index])))
  )
  const asked = Math.min(Math.abs(delta), room, capacity)
  const wanted = settle(panels[pivot], start + asked, start, threshold) - start
  if (wanted <= epsilon) {
    return layout
  }

  const next = layout.slice()
  let given = 0
  for (const index of shrinking) {
    const remaining = wanted - given
    if (remaining <= epsilon) {
      break
    }
    const size = layout[index]
    const panel = panels[index]
    let settled = Math.min(
      size,
      settle(panel, size - remaining, size, threshold)
    )
    // A collapse that frees more than the growing panel can take stops at the minimum instead.
    if (given + size - settled > room + epsilon) {
      settled = Math.min(size, Math.max(panel.min, size - remaining))
    }
    next[index] = settled
    given += size - settled
  }
  // Too little freed to open a collapsed panel, or to reach a size it allows.
  if (given <= epsilon || !allowed(panels[pivot], start + given)) {
    return layout
  }
  next[pivot] = start + given
  return next
}

// The panels a move shrinks, from the handle outward: the one next to it, then
// each one past it up to the first locked handle. Handle `i` sits between
// panels `i` and `i + 1`.
function shrinkable(
  count: number,
  handle: number,
  forward: boolean,
  locked: readonly boolean[]
) {
  const indices: number[] = []
  if (forward) {
    for (
      let index = handle + 1;
      index < count && (index === handle + 1 || !locked[index - 1]);
      index++
    ) {
      indices.push(index)
    }
  } else {
    for (
      let index = handle;
      index >= 0 && (index === handle || !locked[index]);
      index--
    ) {
      indices.push(index)
    }
  }
  return indices
}

/** How far a handle moves for Home: its panel down to its smallest, which may be collapsed. */
const homeDelta = (
  layout: readonly number[],
  panels: readonly PanelConstraints[],
  handle: number
) => lowest(panels[handle]) - layout[handle]

/** How far a handle moves for End: its panel up to its largest. */
const endDelta = (
  layout: readonly number[],
  panels: readonly PanelConstraints[],
  handle: number
) => panels[handle].max - layout[handle]

/** The range a handle's panel can take from here, for `aria-valuemin` and `aria-valuemax`. */
function handleBounds(
  layout: readonly number[],
  panels: readonly PanelConstraints[],
  handle: number,
  locked: readonly boolean[] = []
) {
  return {
    min: resizeAt(
      layout,
      panels,
      handle,
      homeDelta(layout, panels, handle),
      1,
      locked
    )[handle],
    max: resizeAt(
      layout,
      panels,
      handle,
      endDelta(layout, panels, handle),
      1,
      locked
    )[handle],
  }
}

/**
 * `handleBounds` for every handle, in one pass when no panel can collapse and
 * each is within its bounds. Then a handle's panel shrinks to its minimum or
 * to what the next panel can take, and grows to its maximum or to what the
 * panels after it can give, up to a locked handle.
 */
function allHandleBounds(
  layout: readonly number[],
  panels: readonly PanelConstraints[],
  locked: readonly boolean[] = []
) {
  const handles = layout.slice(1).map((_, handle) => handle)
  if (
    !panels.every(
      (panel, index) => !panel.collapsible && allowed(panel, layout[index])
    )
  ) {
    return handles.map((handle) => handleBounds(layout, panels, handle, locked))
  }
  // What the panels from each one to the next locked handle can give, summed
  // from the end, so a change near the start leaves the later sums exactly as they were.
  const spare: number[] = []
  for (let index = layout.length - 1; index >= 0; index--) {
    spare[index] =
      Math.max(0, layout[index] - panels[index].min) +
      (locked[index] ? 0 : (spare[index + 1] ?? 0))
  }
  return handles.map((handle) => {
    const size = layout[handle]
    const shrink = Math.min(
      size - panels[handle].min,
      panels[handle + 1].max - layout[handle + 1]
    )
    const grow = Math.min(panels[handle].max - size, spare[handle + 1])
    return { min: size - Math.max(0, shrink), max: size + Math.max(0, grow) }
  })
}

/**
 * A layout every panel allows that adds up to 100: scaled to 100 when it
 * doesn't, each size settled into its panel's bounds, and what that leaves
 * over or short shared out in order. Collapsed panels stay collapsed.
 */
function fitLayout(
  layout: readonly number[],
  panels: readonly PanelConstraints[]
) {
  const total = sum(layout)
  const scale = total > epsilon && !sameSize(total, 100) ? 100 / total : 1
  const next = layout.map((size, index) =>
    settle(panels[index], size * scale, size * scale)
  )
  let left = 100 - sum(next)
  for (
    let index = 0;
    index < next.length && Math.abs(left) > epsilon;
    index++
  ) {
    const panel = panels[index]
    if (isCollapsed(panel, next[index])) {
      continue
    }
    const change =
      left > 0
        ? Math.min(left, panel.max - next[index])
        : Math.max(left, panel.min - next[index])
    next[index] += change
    left -= change
  }
  // Constraints that can't all hold: the last panel takes the rest, so it still fills the group.
  if (Math.abs(left) > epsilon && next.length) {
    next[next.length - 1] += left
  }
  return next
}

/** Where panels start: their `defaultSize`, and what's left shared by the panels without one. */
function initialLayout(panels: readonly PanelConstraints[]) {
  const given = panels.filter((panel) => panel.initial !== undefined)
  const left = Math.max(0, 100 - sum(given.map((panel) => panel.initial!)))
  const share =
    panels.length > given.length ? left / (panels.length - given.length) : 0
  return fitLayout(
    panels.map((panel) => panel.initial ?? share),
    panels
  )
}

/**
 * The layout after panels came or went: panels that stay keep their sizes
 * relative to each other, new panels start at their `defaultSize` or an even
 * share, and the result fits.
 */
function carryLayout(
  previous: { ids: readonly string[]; layout: readonly number[] },
  ids: readonly string[],
  panels: readonly PanelConstraints[]
) {
  const kept = new Map(
    previous.ids.map((id, index) => [id, previous.layout[index]] as const)
  )
  if (!ids.some((id) => kept.has(id))) {
    return initialLayout(panels)
  }
  const fresh = ids.map((id, index) =>
    kept.has(id) ? undefined : (panels[index].initial ?? 100 / ids.length)
  )
  const keptTotal = sum(ids.map((id) => kept.get(id) ?? 0))
  const room = Math.max(0, 100 - sum(fresh.map((size) => size ?? 0)))
  return fitLayout(
    ids.map(
      (id, index) =>
        fresh[index] ?? ((kept.get(id) ?? 0) / (keptTotal || 1)) * room
    ),
    panels
  )
}

/**
 * The layout with one panel at `target`, through the handle after it, or the
 * one before it when that gets closer, like for the last panel.
 */
function resizePanel(
  layout: readonly number[],
  panels: readonly PanelConstraints[],
  index: number,
  target: number,
  threshold = 0.5,
  locked: readonly boolean[] = []
) {
  const delta = target - layout[index]
  const candidates: (readonly number[])[] = []
  if (index < layout.length - 1 && !locked[index]) {
    candidates.push(resizeAt(layout, panels, index, delta, threshold, locked))
  }
  if (index > 0 && !locked[index - 1]) {
    candidates.push(
      resizeAt(layout, panels, index - 1, -delta, threshold, locked)
    )
  }
  let best = layout
  for (const candidate of candidates) {
    if (
      Math.abs(candidate[index] - target) <
      Math.abs(best[index] - target) - epsilon
    ) {
      best = candidate
    }
  }
  return best
}

/**
 * Which panel Enter and a double-click on a handle collapse or expand: the
 * panel before it, as the APG's primary pane, or the one after when only that
 * one is collapsible.
 */
function toggleTarget(panels: readonly PanelConstraints[], handle: number) {
  if (panels[handle]?.collapsible) {
    return handle
  }
  if (panels[handle + 1]?.collapsible) {
    return handle + 1
  }
  return null
}

/**
 * Where a handle's arrow keys move it, in percent: one step, or the large
 * step with Shift, along the group's axis. In right-to-left layouts the start
 * of a horizontal group is on the right, so the arrows swap.
 */
function keyDelta(
  key: string,
  {
    vertical,
    rtl,
    step,
    largeStep,
    shiftKey,
  }: {
    vertical: boolean
    rtl: boolean
    step: number
    largeStep: number
    shiftKey: boolean
  }
) {
  const size = shiftKey ? largeStep : step
  const [back, forward] = vertical
    ? ["ArrowUp", "ArrowDown"]
    : rtl
      ? ["ArrowRight", "ArrowLeft"]
      : ["ArrowLeft", "ArrowRight"]
  if (key === forward) {
    return size
  }
  if (key === back) {
    return -size
  }
  return null
}

export {
  allHandleBounds,
  carryLayout,
  constraintsOf,
  endDelta,
  fitLayout,
  handleBounds,
  homeDelta,
  initialLayout,
  isAbsolute,
  isCollapsed,
  keyDelta,
  type PanelConstraints,
  type PanelSizes,
  type ResizableSize,
  resizeAt,
  resizePanel,
  sameLayout,
  sameSize,
  settle,
  toCSS,
  toggleTarget,
  toPercent,
}
