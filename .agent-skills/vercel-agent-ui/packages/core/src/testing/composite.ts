// Moving through a composite widget's items with keys, as the APG patterns
// describe it: one tab stop, arrows to the next and previous item, Home and
// End, and typeahead, each checked after its key.
import { accessibleName, describe, roleOf, tabStops } from "./aria"
import { stopped, type PatternContext } from "./pattern-context"
import { isDisabledElement } from "../foundation/forms/form"

/** A composite widget: its container, its items as they are now, and how problems name them. */
type Composite = {
  container: Element
  items: () => Element[]
  /** What an item is called in a problem, like "option". */
  noun: string
  /** The APG pattern a problem cites, like "listbox". */
  source: string
}

/** The item that has focus: the focused one, or the one `aria-activedescendant` names. */
function currentItem(context: PatternContext, composite: Composite) {
  const active = context.doc.activeElement
  const items = composite.items()
  const descendant = active?.getAttribute("aria-activedescendant")
  if (descendant) {
    return items.find((item) => item.id === descendant)
  }
  if (!active) {
    return undefined
  }
  // The innermost item holding focus, since a tree's items hold their children.
  return (
    items.find((item) => item === active) ??
    items.filter((item) => item.contains(active)).at(-1)
  )
}

// The items from `start` one way up to the first enabled one. Disabled items
// on the way count too, since some patterns keep them focusable.
function scan(items: Element[], start: number, step: number) {
  const passed: Element[] = []
  for (let index = start; index >= 0 && index < items.length; index += step) {
    passed.push(items[index])
    if (!isDisabledElement(items[index])) {
      return { passed, reached: true }
    }
  }
  return { passed, reached: false }
}

/**
 * Where a key may move focus from `index`: the next item one way, and past
 * the end, the first item from the other end when it wraps, the same item
 * when it doesn't, or either when the pattern leaves it open.
 */
function stepTargets(
  items: Element[],
  index: number,
  forward: boolean,
  wraps: boolean | undefined
) {
  const step = forward ? 1 : -1
  const ahead = scan(items, index + step, step)
  if (ahead.reached) {
    return ahead.passed
  }
  const around = scan(items, forward ? 0 : items.length - 1, step).passed
  const stays = [items[index], ...ahead.passed]
  if (wraps === true) {
    return [...ahead.passed, ...around]
  }
  if (wraps === false) {
    return stays
  }
  return [...stays, ...around]
}

function checkTabStop(
  context: PatternContext,
  composite: Composite,
  required = true
) {
  const { container, noun, source } = composite
  const stops = tabStops(container)
  if (stops.length > 1) {
    context.problem(
      container,
      `has ${stops.length} tab stops (${stops.map(describe).join(", ")}); a composite has one, and arrows move within it (APG ${source}).`
    )
  } else if (!stops.length && required) {
    context.problem(
      container,
      `has no tab stop; one ${noun} takes Tab, or the ${roleOf(container)} itself with aria-activedescendant (APG ${source}).`
    )
  } else if (
    stops.length === 1 &&
    container.hasAttribute("aria-activedescendant") &&
    stops[0] !== container
  ) {
    context.problem(
      stops[0],
      `takes Tab, but with aria-activedescendant the ${roleOf(container)} itself is the tab stop (APG ${source}).`
    )
  }
}

/** Focuses the composite's tab stop, as Tab would, and returns the item that has focus. */
async function enter(context: PatternContext, composite: Composite) {
  const stop =
    tabStops(composite.container)[0] ??
    composite.items().find((item) => !isDisabledElement(item))
  if (!stop) {
    throw stopped
  }
  await context.focus(stop)
  return currentItem(context, composite)
}

/** Presses a key and checks focus moved to one of `allowed`, which `expected` describes. */
async function expectMove(
  context: PatternContext,
  composite: Composite,
  key: string,
  allowed: Element[],
  expected: string
) {
  const from = currentItem(context, composite)
  await context.press(key)
  const to = currentItem(context, composite)
  if (to && allowed.includes(to)) {
    return to
  }
  const outcome = !to
    ? `focus went to ${describe(context.doc.activeElement)}, outside the ${composite.noun}s`
    : to === from
      ? "focus stayed"
      : `focus went to ${describe(to)}`
  context.problem(
    from ?? composite.container,
    `${key} should move focus to ${expected}, ${describe(allowed[0])}, but ${outcome} (APG ${composite.source}).`
  )
  // Every later key would start from outside the composite.
  if (!to) {
    throw stopped
  }
  return to
}

/** Presses a key that moves one item forward or back, and checks it did. */
async function expectStep(
  context: PatternContext,
  composite: Composite,
  key: string,
  forward: boolean,
  wraps: boolean | undefined
) {
  const items = composite.items()
  const from = currentItem(context, composite)
  const index = from ? items.indexOf(from) : -1
  const allowed =
    index < 0
      ? scan(items, 0, 1).passed
      : stepTargets(items, index, forward, wraps)
  const atEnd =
    index >= 0 &&
    !scan(items, index + (forward ? 1 : -1), forward ? 1 : -1).reached
  const expected =
    index < 0
      ? `the first ${composite.noun}`
      : `the ${forward ? "next" : "previous"} ${composite.noun}`
  return expectMove(
    context,
    composite,
    key,
    allowed,
    atEnd && wraps ? `${expected}, wrapping around` : expected
  )
}

/**
 * Checks the arrows, and Home and End where the pattern has them: from the
 * item that has focus, forward and back, then past both ends. Returns the
 * item focus started on, for `returnTo`.
 */
async function checkNavigation(
  context: PatternContext,
  composite: Composite,
  moves: {
    next: string[]
    previous: string[]
    /** Whether arrows wrap past the ends: required, forbidden, or left open. */
    wraps?: boolean
    homeEnd: boolean
    /** Runs after every move, for what a move also changes, like checking a radio. */
    onMove?: (key: string, item: Element) => void
  }
) {
  const start = currentItem(context, composite)
  const items = composite.items()
  if (items.length < 2) {
    return start
  }
  const step = async (key: string, forward: boolean) => {
    const to = await expectStep(context, composite, key, forward, moves.wraps)
    moves.onMove?.(key, to)
  }
  const jump = async (key: "Home" | "End") => {
    const all = composite.items()
    const allowed =
      key === "Home"
        ? scan(all, 0, 1).passed
        : scan(all, all.length - 1, -1).passed
    const to = await expectMove(
      context,
      composite,
      key,
      allowed,
      `the ${key === "Home" ? "first" : "last"} ${composite.noun}`
    )
    moves.onMove?.(key, to)
  }
  if (moves.homeEnd) {
    await jump("Home")
  }
  for (const key of moves.next) {
    await step(key, true)
  }
  for (const key of moves.previous) {
    await step(key, false)
  }
  if (moves.homeEnd) {
    await jump("End")
  } else {
    // Walks to the last item, a step at a time.
    for (let guard = items.length; guard > 0; guard--) {
      const all = composite.items()
      const index = all.indexOf(currentItem(context, composite)!)
      if (!scan(all, index + 1, 1).reached) {
        break
      }
      await step(moves.next[0], true)
    }
  }
  // Past the end, then back.
  await step(moves.next[0], true)
  await step(moves.previous[0], false)
  return start
}

/** Moves focus back to `target` with the arrows, which also restores a selection that follows focus. */
async function returnTo(
  context: PatternContext,
  composite: Composite,
  target: Element | undefined,
  arrows: { next: string; previous: string }
) {
  if (!target) {
    return
  }
  for (let guard = composite.items().length * 2; guard > 0; guard--) {
    const items = composite.items()
    const current = currentItem(context, composite)
    if (!current || current === target || !items.includes(target)) {
      return
    }
    await context.press(
      items.indexOf(target) > items.indexOf(current)
        ? arrows.next
        : arrows.previous
    )
  }
}

const initialOf = (el: Element) => accessibleName(el).charAt(0).toLowerCase()

/**
 * Types the first letter of an item's name, which only that item starts
 * with, and checks focus moved to it. When the focused item is the only one,
 * an arrow moves off it first.
 */
async function checkTypeahead(
  context: PatternContext,
  composite: Composite,
  arrows: { next: string; previous: string }
) {
  const items = composite.items()
  const unique = items.filter(
    (item) =>
      !isDisabledElement(item) &&
      /^[a-z0-9]$/.test(initialOf(item)) &&
      items.filter((other) => initialOf(other) === initialOf(item)).length === 1
  )
  const index = items.indexOf(currentItem(context, composite)!)
  if (unique.length === 1 && unique[0] === items[index]) {
    await context.press(
      index < items.length - 1 ? arrows.next : arrows.previous
    )
  }
  const from = currentItem(context, composite)
  const target = unique.find((item) => item !== from)
  if (!target) {
    return
  }
  const letter = initialOf(target)
  await context.press(letter)
  if (currentItem(context, composite) === target) {
    return
  }
  context.problem(
    from ?? composite.container,
    `typing "${letter}" should move focus to ${describe(target)}, the ${composite.noun} whose name starts with it (APG ${composite.source}: type-ahead).`
  )
}

export {
  checkNavigation,
  checkTabStop,
  checkTypeahead,
  currentItem,
  enter,
  expectStep,
  returnTo,
  type Composite,
}
