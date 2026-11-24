// The on-screen keyboard, measured from the visual viewport. iOS and Android
// browsers shrink only the visual viewport when the keyboard opens, so a
// centered dialog or a sheet would sit under it.

const keyboardless = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
])

// A field, the only thing a tap opens the on-screen keyboard for. A frame's
// field can't be seen from here, so a focused frame counts.
function isField(target: EventTarget | null) {
  let el = target as HTMLElement | null
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement as HTMLElement
  }
  if (!el?.tagName) {
    return false
  }
  if (
    el.isContentEditable ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "IFRAME"
  ) {
    return true
  }
  return (
    el.tagName === "INPUT" && !keyboardless.has((el as HTMLInputElement).type)
  )
}

// The keyboard's height in CSS pixels: how much less of the screen the page
// gets while a field has focus than before it. Compared on screen, so zoom, or
// a layout viewport that shrinks along with the keyboard, doesn't hide it.
function keyboardHeight(view: Window) {
  let before = { width: 0, height: 0 }
  return (size: ViewportSize, event?: Event) => {
    const now = {
      width: size.width * size.scale,
      height: size.height * size.scale,
    }
    // Focus going from one field to the next keeps the keyboard open.
    const moving =
      event?.type === "focusout" && isField((event as FocusEvent).relatedTarget)
    if (!isField(view.document.activeElement) && !moving) {
      // Focus leaves before the keyboard closes, so only a resize or a scroll measures the page without it.
      if (!event?.type.startsWith("focus")) {
        before = now
      }
      return 0
    }
    // Turned while typing, or opened with the keyboard up: the layout viewport is the page without it.
    if (Math.abs(now.width - before.width) > 1) {
      before = { width: now.width, height: size.layoutHeight * size.scale }
    }
    return Math.max(0, Math.round((before.height - now.height) / size.scale))
  }
}

const pageZoom = new WeakMap<Window, number>()

// How much of the layout viewport's bottom the keyboard covers: what lies
// below what's on screen, up to a measured keyboard. Unmeasured, a pinch-zoomed
// page covers none, while Safari's own page zoom, its scale at full height, does.
function keyboardInset(view: Window, size: ViewportSize, keyboard: number) {
  const covered = Math.max(0, size.layoutHeight - size.offsetTop - size.height)
  if (Math.abs(size.height - size.layoutHeight) <= 1) {
    pageZoom.set(view, size.scale)
  }
  if (keyboard > 0) {
    return Math.round(Math.min(keyboard, covered))
  }
  return size.scale > (pageZoom.get(view) ?? 1) + 0.01 ? 0 : Math.round(covered)
}

// Writes --keyboard-inset and --visual-viewport-height on `el`, and
// data-keyboard while the keyboard covers part of the page, until the cleanup
// runs. `onChange` hears an inset change around the write: `before` runs
// first, so it can read the layout the change is about to replace.
function trackKeyboard(
  el: HTMLElement,
  onChange?: { before: () => void; after: () => void }
) {
  const view = el.ownerDocument.defaultView
  const viewport = view?.visualViewport
  if (!view || !viewport) {
    return () => {}
  }
  let current: number | null = null
  // Only the covered part, which components need: the keyboard's height is `bindViewport`'s.
  const apply = (size: ViewportSize) => {
    const inset = keyboardInset(view, size, 0)
    const changed = current !== null && inset !== current
    current = inset
    if (changed) {
      onChange?.before()
    }
    el.style.setProperty("--keyboard-inset", `${inset}px`)
    el.style.setProperty(
      "--visual-viewport-height",
      `${Math.round(size.height)}px`
    )
    if (inset > 0) {
      el.setAttribute("data-keyboard", "")
    } else {
      el.removeAttribute("data-keyboard")
    }
    if (changed) {
      onChange?.after()
    }
  }
  // Read after a controlled open rendered, content still in the page's flow
  // can widen a phone's layout viewport and look like a keyboard.
  const measured = early.get(view)
  apply(
    measured &&
      measured.layoutHeight - measured.offsetTop - measured.height <= 1
      ? measured
      : measureViewport(view, viewport)
  )
  const stop = followViewport(view, viewport, apply)
  return () => {
    stop()
    el.style.removeProperty("--keyboard-inset")
    el.style.removeProperty("--visual-viewport-height")
    el.removeAttribute("data-keyboard")
  }
}

type ViewportSize = {
  width: number
  layoutHeight: number
  height: number
  offsetTop: number
  scale: number
}

function measureViewport(view: Window, viewport: VisualViewport) {
  return {
    width: viewport.width,
    layoutHeight: view.innerHeight,
    height: viewport.height,
    offsetTop: viewport.offsetTop,
    scale: viewport.scale,
  }
}

type ViewportFollower = (size: ViewportSize, event: Event) => void

const followersByViewport = new WeakMap<
  VisualViewport,
  { followers: Set<ViewportFollower>; stop: () => void }
>()

// Made in a function of its own: closures made in one call share its scope,
// so a `stop` made beside a follower would keep that follower and its element.
function shareViewport(view: Window, viewport: VisualViewport) {
  const followers = new Set<ViewportFollower>()
  const measure = (event: Event) => {
    const size = measureViewport(view, viewport)
    for (const follow of followers) {
      follow(size, event)
    }
  }
  viewport.addEventListener("resize", measure)
  viewport.addEventListener("scroll", measure)
  const stop = () => {
    viewport.removeEventListener("resize", measure)
    viewport.removeEventListener("scroll", measure)
    followersByViewport.delete(viewport)
  }
  const shared = { followers, stop }
  followersByViewport.set(viewport, shared)
  return shared
}

// A toast region, a dialog and a sheet follow the same visual viewport, so they
// share its listeners and one measurement per event instead of one each.
function followViewport(
  view: Window,
  viewport: VisualViewport,
  follower: ViewportFollower
) {
  const { followers, stop } =
    followersByViewport.get(viewport) ?? shareViewport(view, viewport)
  followers.add(follower)
  return () => {
    if (followers.delete(follower) && !followers.size) {
      stop()
    }
  }
}

const early = new WeakMap<Window, ViewportSize>()

/**
 * Measures the viewport for `trackKeyboard` later in the same task. Like
 * `measureScrollerEarly`: a dialog calls it as it starts to open, while
 * reading layout is free, instead of after it rendered and locked the page.
 */
function measureViewportEarly(view: Window | null | undefined) {
  const viewport = view?.visualViewport
  if (!view || !viewport || early.has(view)) {
    return
  }
  early.set(view, measureViewport(view, viewport))
  setTimeout(() => early.delete(view))
}

export {
  followViewport,
  keyboardHeight,
  keyboardInset,
  measureViewport,
  measureViewportEarly,
  trackKeyboard,
  type ViewportSize,
}
