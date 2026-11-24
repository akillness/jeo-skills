// Every change to a ui-sdk component on the page, from a person or an agent,
// with the component's name, the reason and the source, for logs, analytics,
// audit trails and replays, settled once per commit or step by step. Opt in:
// a page that never imports it, or the agent, pays only the kernel's empty
// hooks.
import { elementsOf, listen, type ObservedChange } from "./registry"

/**
 * Calls `listener` with every change to a component that goes through, made
 * by a person or an agent, until the returned function runs. Each names the
 * component the way the agent's `snapshot` does, says why it changed and who
 * changed it, and carries the value before it. A change an interaction makes
 * in steps and then commits, like a slider's drag, a number input's typing or
 * a resizable's drag, is reported once, when it commits, with the value from
 * before it began; pass `live: true` to hear every step instead, and no
 * commits. Password, card and one-time-code values read `"[redacted]"`. Pass
 * `within` to hear only components inside an element, like one panel of a
 * page. Call it before the page renders: it names components it heard being
 * made.
 *
 * @example
 * const stop = observe((change) => console.log(`${change.label}: ${change.key} ${change.previous} → ${change.value} (${change.reason}, ${change.source})`))
 * // Visibility: value private → public (item-press, mouse)
 * // Volume: value 20 → 65 (drag, mouse), once the drag ends
 * @stable
 */
function observe(
  listener: (change: ObservedChange) => void,
  options: {
    /** Hears only components with a part inside this element, or the element it returns. */
    within?: Element | (() => Element | null | undefined)
    /** Hears every step of an interaction, like each move of a drag, instead of one change when it commits. */
    live?: boolean
  } = {}
) {
  const { within, live } = options
  if (!within) {
    return listen((change) => listener(change), live)
  }
  return listen((change, parts) => {
    const root = typeof within === "function" ? within() : within
    if (root && parts.some((part) => root.contains(part.el))) {
      listener(change)
    }
  }, live)
}

/**
 * The element of a component, by the ref `observe` and the agent's `snapshot`
 * give it: its root, or its first part on the page. For pointing at a
 * component, like a highlight around what an agent just changed.
 * @stable
 */
function elementOf(ref: string) {
  const elements = elementsOf(ref)
  return (
    elements.find(
      (el) => !elements.some((other) => other !== el && other.contains(el))
    ) ?? elements[0]
  )
}

export { elementOf, observe, type ObservedChange }
export { withSource } from "../../foundation/kernel/details"
