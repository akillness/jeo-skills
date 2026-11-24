// An element's accessible name, close to how browsers compute it
// (https://www.w3.org/TR/accname-1.2/#computation-steps) without layout, so
// the testing kit, the agent, Dialog and development warnings agree on it.

// The roles elements have without a `role` attribute, for the ones patterns use.
const implicitRoles: [selector: string, role: string][] = [
  ["button", "button"],
  ["a[href]", "link"],
  ["input[type=checkbox][switch]", "switch"],
  ["input[type=checkbox]", "checkbox"],
  ["input[type=radio]", "radio"],
  ["input[type=range]", "slider"],
  ["dialog", "dialog"],
  ["h1, h2, h3, h4, h5, h6", "heading"],
]

// Roles a name can come from the element's text for. The others need
// `aria-label`, `aria-labelledby`, a label element or `title`.
const namedByContent = new Set([
  "button",
  "cell",
  "checkbox",
  "columnheader",
  "gridcell",
  "heading",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "row",
  "rowheader",
  "switch",
  "tab",
  "treeitem",
])

function roleOf(el: Element) {
  const explicit = el.getAttribute("role")?.trim().split(/\s+/)[0]
  if (explicit) {
    return explicit
  }
  return implicitRoles.find(([selector]) => el.matches(selector))?.[1] ?? ""
}

// Hidden from everyone, by attribute or, where there's a window to compute
// them, by styles.
function isHidden(el: Element) {
  if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") {
    return true
  }
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  return style?.display === "none" || style?.visibility === "hidden"
}

// The element an id names in the tree `el` is in, so a label inside a shadow root is found.
function byId(el: Element, id: string) {
  const root = el.getRootNode() as Node & {
    getElementById?: (id: string) => Element | null
  }
  return root.getElementById?.(id) ?? null
}

// The text of the elements aria-labelledby names, each by its aria-label or its content.
function labelledByOf(el: Element) {
  return (el.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => id && byId(el, id))
    .filter((label) => !!label)
    .map((label) => label.getAttribute("aria-label") ?? contentOf(label, true))
    .join(" ")
}

// What an image or an icon is called by its own markup: an `<img>`'s alt or an `<svg>`'s `<title>`.
function embeddedName(el: Element) {
  if (el.localName === "img") {
    return el.getAttribute("alt") ?? ""
  }
  if (el.localName !== "svg") {
    return ""
  }
  return (
    [...el.children].find((child) => child.localName === "title")
      ?.textContent ?? ""
  )
}

// What an element inside another's content adds to its name
// (https://www.w3.org/TR/accname-1.2/#step2): its aria-labelledby, unless
// this is already one's text, its aria-label, its image's alt, its content,
// then its title. A field inside a label adds nothing, so a label doesn't
// repeat the name of the field it names.
function nameWithin(el: Element, labelling: boolean, hidden: boolean) {
  if (el.matches("input, select, textarea")) {
    return ""
  }
  const own =
    (!labelling && labelledByOf(el)) ||
    el.getAttribute("aria-label")?.trim() ||
    embeddedName(el)
  if (own) {
    return ` ${own} `
  }
  // An icon's drawing isn't text.
  if (el.localName === "svg") {
    return ""
  }
  const content = contentOf(el, labelling, hidden)
  const title = el.getAttribute("title")
  return content || (title ? ` ${title} ` : "")
}

// The text an element's content names it with, without its hidden descendants.
// A hidden element can still name another through aria-labelledby, and then
// gives all its text, as browsers do.
function contentOf(el: Element, labelling = false, hidden = isHidden(el)) {
  let text = ""
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.nodeValue
    } else if (
      node.nodeType === Node.ELEMENT_NODE &&
      (hidden || !isHidden(node as Element))
    ) {
      const name = nameWithin(node as Element, labelling, hidden)
      text += apart(node as Element, name) ? ` ${name} ` : name
    }
  }
  return text
}

// Anything but plain inline content, like a flex item or an inline-block,
// stands apart from its neighbors, as Chromium names it. An empty inline-block
// doesn't, so an icon between two words leaves them joined.
function apart(el: Element, name: string) {
  const display = el.ownerDocument.defaultView?.getComputedStyle(el).display
  return (
    !!display &&
    display !== "inline" &&
    (!display.startsWith("inline") || !!name.trim())
  )
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim()

// Only labelable elements have `labels`. Read only when needed: Chromium walks the page for them.
const labelsOf = (el: Element) =>
  [...((el as HTMLInputElement).labels ?? [])]
    .map((label) => contentOf(label))
    .join(" ")

// Where a name comes from, in the order browsers take them.
const nameSources = [
  labelledByOf,
  (el: Element) => el.getAttribute("aria-label") ?? "",
  labelsOf,
  embeddedName,
  (el: Element) => (namedByContent.has(roleOf(el)) ? contentOf(el) : ""),
  (el: Element) => el.getAttribute("title") ?? "",
]

// The same sources with labels last, for asking only whether there's a name.
const labelsLast = [
  ...nameSources.filter((source) => source !== labelsOf),
  labelsOf,
]

function firstName(el: Element, sources: typeof nameSources) {
  for (const source of sources) {
    const name = collapse(source(el))
    if (name) {
      return name
    }
  }
  return ""
}

/**
 * An approximate accessible name: what `aria-labelledby`, `aria-label`,
 * labels, an image's alt, content for roles named by it, or `title` give,
 * with whitespace collapsed. Content counts its images' alt, its icons' names
 * and its elements' own labels.
 */
function accessibleName(el: Element) {
  return firstName(el, nameSources)
}

/** Whether `el` has an accessible name, reading its labels only when nothing else names it. */
function hasAccessibleName(el: Element) {
  return firstName(el, labelsLast) !== ""
}

export { accessibleName, hasAccessibleName, namedByContent, roleOf }
