import { isAfter } from "../kernel/order"

const candidates = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "iframe",
  "summary",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
].join(",")

function isTabbable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.tabIndex < 0) {
    return false
  }
  if (el.matches(":disabled") || el.closest("[inert]")) {
    return false
  }
  // Only one radio button per group takes Tab: the checked one, or the first.
  // Without a form, a radio's group is the same-named radios outside a form in
  // its document or shadow root. A checked radio that can't take focus leaves the rest reachable.
  const group = (el as HTMLInputElement).checked ? [] : radioGroup(el)
  if (group.some((radio) => radio.checked && isTabbable(radio))) {
    return false
  }
  if (typeof el.checkVisibility === "function") {
    return el.checkVisibility({ visibilityProperty: true })
  }
  return (
    el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden"
  )
}

function radioGroup(el: Element) {
  if (!(el instanceof HTMLInputElement) || el.type !== "radio" || !el.name) {
    return []
  }
  const scope = el.form
    ? Array.from(el.form.elements)
    : Array.from(
        (el.getRootNode() as ParentNode).querySelectorAll(
          `input[name="${CSS.escape(el.name)}"]`
        )
      )
  return scope.filter(
    (radio): radio is HTMLInputElement =>
      radio instanceof HTMLInputElement &&
      radio.type === "radio" &&
      radio.name === el.name &&
      radio.form === el.form
  )
}

function tabbables(root: ParentNode) {
  return Array.from(root.querySelectorAll(candidates)).filter(isTabbable)
}

// Tab order through open shadow roots and slots, which `querySelectorAll`
// doesn't see into: each puts its own positive tabindex values first, and Tab
// skips a whole tree whose host is inert or has a negative tabindex.
function composedTabbables(root: ParentNode) {
  type Entry = { index: number; stops: HTMLElement[] }
  const ordered = (scope: Entry[]) =>
    [
      ...scope
        .filter((entry) => entry.index > 0)
        .sort((a, b) => a.index - b.index),
      ...scope.filter((entry) => entry.index <= 0),
    ].flatMap((entry) => entry.stops)
  const walk = (nodes: Iterable<Element>, scope: Entry[]) => {
    for (const el of nodes) {
      const index = el.hasAttribute("tabindex")
        ? (el as HTMLElement).tabIndex
        : 0
      if (el.hasAttribute("inert") || (el.shadowRoot && index < 0)) {
        continue
      }
      const stops =
        el.matches(candidates) &&
        !el.shadowRoot?.delegatesFocus &&
        isTabbable(el)
          ? [el]
          : []
      const slotted = el instanceof HTMLSlotElement ? el.assignedElements() : []
      if (el.shadowRoot || slotted.length) {
        const inner: Entry[] = []
        walk(el.shadowRoot?.children ?? slotted, inner)
        scope.push({ index, stops: [...stops, ...ordered(inner)] })
      } else {
        scope.push({ index, stops })
        walk(el.children, scope)
      }
    }
  }
  const top: Entry[] = []
  walk(root.children, top)
  return top.flatMap((entry) => entry.stops)
}

// The stops Tab visits before the rest: positive tabindex values, lowest
// first. One slotted into a custom element orders only within its slot, so it
// keeps its host's place.
function positiveTabStops(stops: HTMLElement[], root: Element) {
  const slotted = (el: Element) => {
    for (
      let node: Element | null = el;
      node && node !== root;
      node = node.parentElement
    ) {
      if (node.assignedSlot) {
        return true
      }
    }
    return false
  }
  return stops
    .filter((el) => el.tabIndex > 0 && !slotted(el))
    .sort((a, b) => a.tabIndex - b.tabIndex)
}

// The first tabbable element after `node` in the document, skipping anything
// inside `skip`, like the popup that is handing focus back.
function nextTabbable(node: Node, skip?: Element) {
  const doc = node.ownerDocument ?? document
  return tabbables(doc.body).find(
    (el) => !el.contains(node) && !skip?.contains(el) && isAfter(node, el)
  )
}

const focusables =
  'a[href],button,input:not([type="hidden"]),select,textarea,iframe,summary,[contenteditable]:not([contenteditable="false"]),[tabindex]'

const ownTabStops = new WeakSet<Element>()

// Only inert content inside `root` counts: the observer never sees `root` or
// its ancestors become inert or stop being.
function takesFocus(node: Element, root: Element) {
  const inert = node.closest("[inert]")
  return (
    (node as HTMLElement).tabIndex >= 0 &&
    !node.matches(":disabled") &&
    !(inert !== root && root.contains(inert))
  )
}

function holdsFocusableNode(node: Node, root: Element) {
  if (!(node instanceof Element)) {
    return false
  }
  return (
    (node.matches(focusables) && takesFocus(node, root)) ||
    holdsFocusable(node, root)
  )
}

// Whether Tab could stop inside `el` once it shows. Visibility is ignored,
// since a hidden panel checks before it shows.
function holdsFocusable(el: Element, root = el) {
  return Array.from(el.querySelectorAll(focusables)).some((node) =>
    takesFocus(node, root)
  )
}

/**
 * Makes `el` a tab stop while `wanted()` holds and nothing inside it can take
 * focus, so keyboard users can still reach and scroll content without
 * controls, as axe's scrollable-region-focusable asks. It checks again when
 * focusable content comes or goes, looking at the whole subtree only when
 * something may have stopped taking focus, so streaming text costs little.
 * Call `check` after anything else `wanted` reads changes. A `tabindex` the
 * author wrote is theirs and stays.
 */
function bindTabStop(
  el: HTMLElement,
  wanted: () => boolean,
  {
    skipWhenHolding = false,
  }: {
    // A scroller holding focusable content leaves the tab order with
    // `tabindex="-1"`, since Firefox makes every scroller a stop of its own.
    skipWhenHolding?: boolean
  } = {}
) {
  // Binding again, like React's StrictMode does, finds the stop written last time.
  const authored = el.hasAttribute("tabindex") && !ownTabStops.has(el)
  let holds = holdsFocusable(el)
  const check = () => {
    if (authored) {
      return
    }
    const stop = wanted() && !holds ? "0" : skipWhenHolding ? "-1" : null
    if (el.getAttribute("tabindex") === stop) {
      return
    }
    if (stop === null) {
      el.removeAttribute("tabindex")
      ownTabStops.delete(el)
    } else {
      el.setAttribute("tabindex", stop)
      ownTabStops.add(el)
    }
  }
  check()
  if (typeof MutationObserver === "undefined") {
    return { check, stop: () => {} }
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.target === el && record.type === "attributes") {
        continue
      }
      if (
        record.type === "attributes" ||
        (holds && record.removedNodes.length)
      ) {
        holds = holdsFocusable(el)
        break
      }
      if (!holds) {
        holds = Array.from(record.addedNodes).some((node) =>
          holdsFocusableNode(node, el)
        )
      }
    }
    check()
  })
  observer.observe(el, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "tabindex",
      "disabled",
      "href",
      "contenteditable",
      "inert",
    ],
  })
  return { check, stop: () => observer.disconnect() }
}

export {
  bindTabStop,
  composedTabbables,
  focusables,
  isTabbable,
  nextTabbable,
  positiveTabStops,
  radioGroup,
  tabbables,
}
