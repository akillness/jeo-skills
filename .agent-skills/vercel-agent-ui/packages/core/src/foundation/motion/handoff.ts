// Who owns a vertical move over a scroll area inside the sheet: the sheet or
// the scroll area. It is iOS's `prefersScrollingExpandsWhenScrolledToEdge` and
// Material's pre-scroll and post-scroll rules in one function. The machine evaluates it when the slop
// is passed and again whenever the scroll area reaches its start. "Start"
// is the scroll area's edge in the direction that shrinks the sheet.
function handoff(input: {
  /** The finger moves toward a larger extent. */
  towardMore: boolean
  /** The scroll area is at its start (scrollTop 0 for a bottom sheet). */
  scrollAtStart: boolean
  /** The sheet rests at its largest snap point. */
  atLargest: boolean
  /** Dragging up on scrollable content first expands the sheet. */
  expandOnScroll: boolean
}) {
  if (!input.towardMore) {
    return input.scrollAtStart ? "sheet" : "scroll"
  }
  return !input.atLargest && input.expandOnScroll ? "sheet" : "scroll"
}

export { handoff }
