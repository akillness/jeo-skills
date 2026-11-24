import { activateControl, findControl } from "../../foundation/forms/control"
import { isDisabledElement } from "../../foundation/forms/form"
import { documentOrder } from "../../foundation/kernel/order"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * The options `label` takes. A component takes them as props.
 * @experimental
 */
type LabelOptions = PrimitiveOptions

function forTarget(el: HTMLElement, id: string) {
  const root = el.getRootNode() as Document | ShadowRoot
  return "getElementById" in root ? root.getElementById(id) : null
}

// A native <label> names only a labelable element, like an input or a button.
// The label names anything else itself, like a radio group or a slider.
function ownControl(el: HTMLElement) {
  const id = el.getAttribute("for")
  const native = el instanceof HTMLLabelElement
  const target = id ? forTarget(el, id) : native && el.control ? null : el
  if (!target || (native && el.control === target)) {
    return
  }
  return findControl(target)
}

const labelsByControl = new WeakMap<HTMLElement, HTMLElement[]>()
const written = new WeakMap<HTMLElement, string>()

function writeName(control: HTMLElement) {
  const current = control.getAttribute("aria-labelledby")
  const ours = written.get(control)
  if (current !== null && current !== ours) {
    return
  }
  const ids = control.hasAttribute("aria-label")
    ? ""
    : (labelsByControl.get(control) ?? [])
        .sort(documentOrder)
        .map((label) => label.id)
        .join(" ")
  if (ids) {
    written.set(control, ids)
    if (current !== ids) {
      control.setAttribute("aria-labelledby", ids)
    }
  } else if (ours !== undefined) {
    written.delete(control)
    control.removeAttribute("aria-labelledby")
  }
}

function nameControl(control: HTMLElement, label: HTMLElement) {
  labelsByControl.set(control, [...(labelsByControl.get(control) ?? []), label])
  writeName(control)
  return () => {
    labelsByControl.set(
      control,
      labelsByControl.get(control)!.filter((other) => other !== label)
    )
    writeName(control)
  }
}

// The control a label names can render after it, or be replaced, like a group
// behind a condition. One observer per document or shadow root hears it.
const trees = new Map<
  Node,
  { observer: MutationObserver; checks: Set<() => void> }
>()

function watchTree(root: Node, check: () => void) {
  let tree = trees.get(root)
  if (!tree) {
    const checks = new Set<() => void>()
    const observer = new MutationObserver(() =>
      checks.forEach((each) => each())
    )
    observer.observe(root, { childList: true, subtree: true })
    trees.set(root, (tree = { observer, checks }))
  }
  const { observer, checks } = tree
  checks.add(check)
  return () => {
    checks.delete(check)
    if (checks.size) {
      return
    }
    observer.disconnect()
    trees.delete(root)
  }
}

// Attributes on the label or its control that change which control it names, or whether it names one.
const naming = {
  attributeFilter: ["for", "id", "role", "type", "aria-hidden", "aria-label"],
}

function bindLabel(el: HTMLElement) {
  let control: HTMLElement | undefined
  let unname: (() => void) | undefined
  let unwatch: (() => void) | undefined
  let active = true
  const update = () => {
    if (!active) {
      return
    }
    const next = ownControl(el)
    if (next === control) {
      if (control) {
        writeName(control)
      }
    } else {
      unname?.()
      control = next
      unname = control && nameControl(control, el)
      // The last control stays watched until another takes its place, so it's
      // named again once its id or role comes back.
      if (control) {
        changes.disconnect()
        changes.observe(el, naming)
        changes.observe(control, naming)
      }
    }
    // A native label that wraps a labelable control never needs to look for it.
    const looks =
      el.hasAttribute("for") || !(el instanceof HTMLLabelElement) || !el.control
    if (looks && !unwatch) {
      unwatch = watchTree(el.getRootNode(), () => {
        if (!control?.isConnected) {
          update()
        }
      })
    } else if (!looks && unwatch) {
      unwatch()
      unwatch = undefined
    }
  }
  // Controls after the label bind after it.
  queueMicrotask(update)
  const changes = new MutationObserver(update)
  changes.observe(el, naming)
  return () => {
    active = false
    changes.disconnect()
    unwatch?.()
    unname?.()
  }
}

// A press on the control, or on a link or a control inside the label, is
// theirs, as on a native label.
function pressesInside(
  event: Event,
  el: HTMLElement,
  control: HTMLElement | undefined
) {
  const target = event.target as Element
  if (control?.contains(target)) {
    return true
  }
  const inner = target.closest?.("a[href], button, input, select, textarea")
  return !!inner && inner !== el && el.contains(inner)
}

const labelPrimitive = /* @__PURE__ */ definePrimitive({
  name: "label",
  state: (_options: LabelOptions) => ({}),
  api: (_context) => ({}),
  slots: (slot) => ({
    root: slot({
      attrs: (_, { id }) => ({ id }),
      on: {
        // A double click would select the label's text as it activates the control.
        mousedown: (event, { el }) => {
          if (event.detail > 1 && !pressesInside(event, el!, ownControl(el!))) {
            event.preventDefault()
          }
        },
      },
      press({ el }, event) {
        const control = el && ownControl(el)
        if (
          !control ||
          isDisabledElement(control) ||
          (event && pressesInside(event, el!, control))
        ) {
          return
        }
        activateControl(control, event)
      },
      bind: (el) => bindLabel(el),
    }),
  }),
  // Agents never list it: the control it names carries its text.
  agent: { shown: () => false },
})

/**
 * The type of `label`.
 * @experimental
 */
interface LabelPrimitive extends Named<typeof labelPrimitive> {}

/**
 * The label primitive, with the slot `root`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @experimental
 */
const label: LabelPrimitive = labelPrimitive

export { label, type LabelOptions, type LabelPrimitive }
