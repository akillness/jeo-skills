// Sets one style property, and puts back what was there on release, unless
// something else changed it since.
function setStyle(el: HTMLElement, name: string, value: string) {
  const previous = el.style.getPropertyValue(name)
  const priority = el.style.getPropertyPriority(name)
  el.style.setProperty(name, value)
  const ours = el.style.getPropertyValue(name)
  return () => {
    if (el.style.getPropertyValue(name) !== ours) {
      return
    }
    if (previous) {
      el.style.setProperty(name, previous, priority)
    } else {
      el.style.removeProperty(name)
    }
  }
}

const registered = new Set<string>()

// Registers custom properties that don't inherit, so one written on every
// frame restyles only the element it's on, not everything inside it. The
// registration covers the whole page and can't be undone, so a page that
// needs a name to inherit registers it first, and its registration stands
// (an `@property` rule doesn't: a registration in script wins).
function registerUninherited(names: readonly string[]) {
  if (typeof CSS === "undefined" || !CSS.registerProperty) {
    return
  }
  for (const name of names) {
    if (registered.has(name)) {
      continue
    }
    registered.add(name)
    try {
      CSS.registerProperty({ name, syntax: "*", inherits: false })
    } catch {
      // The page registered it first, and its registration stands.
    }
  }
}

// Each document's constructed sheets by name, shared by every copy of ui-sdk
// on the page, like the `<style>` elements they stand in for. Made on first
// use, so a bundle that never writes a style drops this module.
const adopted = () =>
  ((globalThis as Record<symbol, unknown>)[Symbol.for("ui-sdk.styles@1")] ??=
    new WeakMap()) as WeakMap<
    Document,
    Map<string, { sheet: CSSStyleSheet; css: string }>
  >

// What a document's `<meta property="csp-nonce">` says, read once: its nonce,
// "" when the tag has none, or null without the tag. A same-origin frame,
// like an about:blank one, has its page's policy but not its tag, so a
// document without one reads its parents'. Browsers hide a nonce
// attribute's value once it's parsed, so it's read from the property.
const nonces = new WeakMap<Document, string | null>()

function pageNonce(doc: Document) {
  if (nonces.has(doc)) {
    return nonces.get(doc)!
  }
  let meta: HTMLMetaElement | null | undefined
  for (
    let at: Document | undefined = doc;
    at && !meta;
    at = at.defaultView?.frameElement?.ownerDocument
  ) {
    meta = at.head?.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')
  }
  const nonce = meta ? meta.nonce || meta.getAttribute("nonce") || "" : null
  nonces.set(doc, nonce)
  return nonce
}

/**
 * Writes `css` as the document's style named `id`, or replaces its text.
 * Every ui-sdk style goes first in the page, so `@layer ui-sdk` is declared
 * before the page's own layers and loses to them. A Content Security Policy
 * without 'unsafe-inline' blocks a `<style>` element without its nonce, so
 * it takes the one the page's `<meta property="csp-nonce">` gives. When the
 * tag has no nonce, the style is a constructed sheet instead, which no policy
 * blocks. Adopted sheets come after the page's own styles, adopted ones
 * included, so there `@layer ui-sdk` is declared after the page's layers,
 * unless its CSS declares it first.
 */
function writeStyle(doc: Document, id: string, css: string) {
  if (!doc.head) {
    return
  }
  const view = doc.defaultView
  if (pageNonce(doc) === "" && view && "adoptedStyleSheets" in doc) {
    adoptStyle(doc, view, id, css)
  } else {
    appendStyle(doc, id, css)
  }
}

// The text each `<style>` was last given, so a call with the same text, like
// every popup's bind, doesn't read it back.
const styleText = new WeakMap<Element, string>()

function appendStyle(doc: Document, id: string, css: string) {
  const existing = doc.getElementById(id)
  if (existing) {
    if (styleText.get(existing) === css) {
      return
    }
    if (existing.textContent !== css) {
      existing.textContent = css
    }
    styleText.set(existing, css)
    return
  }
  const style = doc.createElement("style")
  style.id = id
  const nonce = pageNonce(doc)
  if (nonce) {
    style.nonce = nonce
  }
  style.textContent = css
  styleText.set(style, css)
  const ours = doc.head.querySelectorAll(':scope > style[id^="ui-sdk-"]')
  if (ours.length) {
    ours[ours.length - 1].after(style)
  } else {
    doc.head.prepend(style)
  }
}

// A constructed sheet can only be adopted by its own window's documents.
function adoptStyle(
  doc: Document,
  view: Window & typeof globalThis,
  id: string,
  css: string
) {
  let sheets = adopted().get(doc)
  if (!sheets) {
    adopted().set(doc, (sheets = new Map()))
  }
  let entry = sheets.get(id)
  if (!entry) {
    sheets.set(id, (entry = { sheet: new view.CSSStyleSheet(), css: "" }))
  }
  if (entry.css !== css) {
    entry.sheet.replaceSync(css)
    entry.css = css
  }
  if (!doc.adoptedStyleSheets.includes(entry.sheet)) {
    // Appended, since Chrome restyles and relayouts the whole page when a sheet
    // goes in mid-list. ui-sdk's rules are in `@layer ui-sdk`, whose order is set
    // where it's first declared, so where the sheet sits doesn't matter.
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, entry.sheet]
  }
}

// A hidden element shows again when a class sets `display`, like a utility
// some CSS frameworks emit without a `[hidden]` guard. One rule per document,
// in the lowest cascade layer but important, so it wins over author classes
// the way the attribute means, and `hidden="until-found"` keeps the browser's
// searchable hiding.
function enforceHidden(doc: Document) {
  writeStyle(
    doc,
    "ui-sdk-hidden",
    '@layer ui-sdk { :where([data-slot][hidden]:not([hidden="until-found"])) { display: none !important } }'
  )
}

let queued: (() => void)[] | undefined

/**
 * Runs work that restyles the whole page, like writing a stylesheet or
 * registering a property, ahead of the interaction that needs it. Done on
 * open, it delays a popup's first frame on a large page. Before the first
 * paint nothing is styled yet, so it runs at once: a page of 200 web
 * component dialogs went idle only after a key press could come. After it,
 * it runs once the page is idle, with the other work queued by then, so they
 * cost one restyle.
 */
function ahead(work: () => void) {
  if (typeof window === "undefined") {
    return
  }
  if (!performance.getEntriesByType("paint").length) {
    work()
  } else if (queued) {
    queued.push(work)
  } else {
    queued = [work]
    ;(window.requestIdleCallback ?? setTimeout)(() => {
      const jobs = queued!
      queued = undefined
      jobs.forEach((job) => job())
    })
  }
}

/**
 * Runs work that restyles the whole page once the current frame has painted,
 * so what the interaction shows comes first. Returns a cancel.
 */
function afterPaint(work: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const frame = requestAnimationFrame(() => {
    timer = setTimeout(work)
  })
  return () => {
    cancelAnimationFrame(frame)
    clearTimeout(timer)
  }
}

export {
  afterPaint,
  ahead,
  enforceHidden,
  registerUninherited,
  setStyle,
  writeStyle,
}
