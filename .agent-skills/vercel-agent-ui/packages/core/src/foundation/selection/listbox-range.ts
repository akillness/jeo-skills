// The selection math of a listbox with `multiple`, on keys in list order:
// toggling one, replacing the selection with one, and Shift ranges. A range
// runs from the anchor, the option chosen last without Shift, to the option
// pressed, and adds to the base, the selection when the anchor was set. So
// extending a range again replaces the range, not the base, like a file
// manager. Pure, so it's unit tested without a DOM.

/**
 * Where Shift ranges start, and what they add to.
 */
type RangeAnchor = { key: string; base: readonly string[] }

/**
 * The keys from `from` to `to` in list order, both included, in either direction.
 */
function keysBetween(order: readonly string[], from: string, to: string) {
  const start = order.indexOf(from)
  const end = order.indexOf(to)
  if (start === -1 || end === -1) {
    return []
  }
  return order.slice(Math.min(start, end), Math.max(start, end) + 1)
}

/**
 * The selection a Shift range makes: the anchor's base, unless the range
 * replaces the selection, plus every key between the anchor and `to` that can
 * be chosen. Set the anchor (`{ key, base: selection }`) on every choice made
 * without Shift, so extending a range again replaces the range, not the base,
 * like a file manager.
 */
function rangeSelection(
  order: readonly string[],
  anchor: RangeAnchor,
  to: string,
  {
    additive,
    selectable,
  }: { additive: boolean; selectable: (key: string) => boolean }
) {
  const range = keysBetween(order, anchor.key, to).filter(selectable)
  const base = additive ? anchor.base : []
  const kept = new Set(base)
  return [...base, ...range.filter((key) => !kept.has(key))]
}

/**
 * The selection with `key` added, or removed when it's there, like Ctrl+Space.
 */
function toggledKeys(selected: readonly string[], key: string) {
  return selected.includes(key)
    ? selected.filter((item) => item !== key)
    : [...selected, key]
}

/**
 * Every key that can be chosen, or none once they all are, like Ctrl+A pressed
 * twice. Keys that can't be chosen keep whatever state they had.
 */
function allToggled(
  selected: readonly string[],
  selectable: readonly string[]
) {
  const current = new Set(selected)
  if (selectable.length && selectable.every((key) => current.has(key))) {
    const removed = new Set(selectable)
    return selected.filter((key) => !removed.has(key))
  }
  return [...selected, ...selectable.filter((key) => !current.has(key))]
}

/**
 * Whether two key lists hold the same keys in the same order, so an unchanged selection fires no change.
 */
function isSameKeys(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((key, index) => key === b[index])
}

export {
  allToggled,
  isSameKeys,
  keysBetween,
  type RangeAnchor,
  rangeSelection,
  toggledKeys,
}
