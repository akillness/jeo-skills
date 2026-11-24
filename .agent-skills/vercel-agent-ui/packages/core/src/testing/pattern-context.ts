// What every pattern check shares: the problems found so far, keys pressed
// the way a person presses them and checked after each one, and the static
// rules several patterns hold, like names, orientation and owned roles.
import {
  accessibleName,
  byId,
  danglingReferences,
  describe,
  ids,
  isGone,
  isUndisplayed,
  isUnreachable,
  roleOf,
  withRole,
} from "./aria"
import { keys, settle } from "./input"

// Thrown to stop pressing keys once the rest would mean nothing, like after
// focus falls to the body, where every later key would go.
const stopped = new Error("checkPattern stopped pressing keys.")

// The orientation a role has when `aria-orientation` doesn't say.
const defaultOrientation: Record<string, "horizontal" | "vertical"> = {
  listbox: "vertical",
  menu: "vertical",
  menubar: "horizontal",
  scrollbar: "vertical",
  slider: "horizontal",
  tablist: "horizontal",
  toolbar: "horizontal",
  tree: "vertical",
}

// Widget roles a composite may not hold besides its own items, like a button in a listbox.
const widgetRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "gridcell",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "slider",
  "switch",
  "tab",
  "textbox",
  "treeitem",
])

function createContext(root: Element) {
  const doc = root.ownerDocument
  const problems = new Set<string>()
  // Where id references are checked after every key: the root, and popups that render elsewhere.
  const watched = new Set<Element>([root])

  /** Records a problem with an element, once. */
  const problem = (el: Element | null | undefined, rule: string) => {
    problems.add(`${describe(el)}: ${rule}`)
  }

  function checkReferences() {
    for (const scope of watched) {
      for (const { el, attribute, id } of danglingReferences(scope)) {
        problem(
          el,
          `${attribute} points at "${id}", which isn't in the page; every id reference names a real element (ARIA).`
        )
      }
    }
  }

  /** Presses a key on the focused element, then checks focus wasn't lost or hidden. */
  async function press(key: string) {
    const before = doc.activeElement
    await keys(doc, [key])
    const after = doc.activeElement
    if (!after || after === doc.body || after === doc.documentElement) {
      problem(
        before,
        `after ${key}, focus fell to the body; a key never loses focus (APG: keyboard interface).`
      )
      throw stopped
    }
    if (isUnreachable(after)) {
      problem(
        after,
        `after ${key}, focus is inside aria-hidden or inert content, where a screen reader can't follow it.`
      )
    }
    checkReferences()
  }

  /** Focuses an element, as Tab or a script would, and waits for what that schedules. */
  async function focus(el: Element) {
    ;(el as HTMLElement).focus()
    await settle()
    const active = doc.activeElement
    if (active && active !== doc.body) {
      return
    }
    problem(el, "can't take focus.")
    throw stopped
  }

  return {
    root,
    doc,
    problems,
    problem,
    press,
    focus,
    checkReferences,
    /** Checks id references in a popup that renders outside the root too. */
    watch: (el: Element) => watched.add(el),
  }
}

/** What every pattern check receives. */
type PatternContext = ReturnType<typeof createContext>

/** The pattern's element: the root, one inside it, or a popup its root or a part of it controls. */
function findWidget(context: PatternContext, roles: string[]) {
  const { root } = context
  if (roles.includes(roleOf(root))) {
    return root
  }
  const inside = withRole(root, roles)[0]
  if (inside) {
    return inside
  }
  for (const el of [root, ...root.querySelectorAll("[aria-controls]")]) {
    for (const id of ids(el, "aria-controls")) {
      const popup = byId(el, id)
      if (popup && roles.includes(roleOf(popup))) {
        return popup
      }
    }
  }
}

function requireName(context: PatternContext, el: Element, source: string) {
  if (!accessibleName(el)) {
    context.problem(
      el,
      `has no accessible name; give it aria-label or aria-labelledby (APG ${source}).`
    )
  }
}

/**
 * The orientation assistive technology reads, from `aria-orientation` or the
 * role's default. A `data-orientation` that says otherwise is a problem: the
 * arrows a person is told to use aren't the ones that work.
 */
function orientationOf(context: PatternContext, el: Element) {
  const fallback = defaultOrientation[roleOf(el)]
  const aria = el.getAttribute("aria-orientation")
  const laidOut = el.getAttribute("data-orientation")
  const read =
    aria === "horizontal" || aria === "vertical"
      ? aria
      : (fallback ?? "vertical")
  if (laidOut && fallback && laidOut !== read) {
    context.problem(
      el,
      `is ${laidOut} (data-orientation) but tells assistive technology it's ${read}; set aria-orientation="${laidOut}" (ARIA: aria-orientation).`
    )
  }
  return read
}

/** The arrows that move forward and back along an orientation. Horizontal ones swap right to left. */
function arrowsFor(orientation: "horizontal" | "vertical", rtl: boolean) {
  if (orientation === "vertical") {
    return { next: "ArrowDown", previous: "ArrowUp" }
  }
  return rtl
    ? { next: "ArrowLeft", previous: "ArrowRight" }
    : { next: "ArrowRight", previous: "ArrowLeft" }
}

/** Flags widgets inside a composite that it can't own, like a button in a listbox. */
function checkOwned(
  context: PatternContext,
  container: Element,
  allowed: string[],
  source: string
) {
  for (const el of container.querySelectorAll("*")) {
    const role = roleOf(el)
    if (
      !widgetRoles.has(role) ||
      allowed.includes(role) ||
      isGone(el) ||
      isUnreachable(el)
    ) {
      continue
    }
    context.problem(
      el,
      `is a ${role} inside a ${roleOf(container)}, which owns only ${allowed.join(" and ")} elements (APG ${source}).`
    )
  }
}

/** The element whose `aria-controls` names a popup, outside the popup itself. */
function triggerOf(popup: Element) {
  if (!popup.id) {
    return undefined
  }
  return [
    ...(popup.getRootNode() as ParentNode).querySelectorAll("[aria-controls]"),
  ].find(
    (el) => !popup.contains(el) && ids(el, "aria-controls").includes(popup.id)
  )
}

/** The popup with one of `roles` that an element's `aria-controls` names. */
function popupOf(el: Element, roles: string[]) {
  return ids(el, "aria-controls")
    .map((id) => byId(el, id))
    .find((popup) => !!popup && roles.includes(roleOf(popup)))
}

/** Whether a popup is open: rendered, and not hidden by `hidden` or `display: none`. */
function isShown(el: Element | null | undefined) {
  return !!el && !isGone(el) && !isUndisplayed(el)
}

export {
  arrowsFor,
  checkOwned,
  createContext,
  findWidget,
  isShown,
  orientationOf,
  popupOf,
  requireName,
  stopped,
  triggerOf,
  type PatternContext,
}
