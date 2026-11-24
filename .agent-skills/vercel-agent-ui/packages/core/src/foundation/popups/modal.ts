import { on } from "../kernel/events"
import { persistentLayers } from "../platform/layers"
import { isIOS } from "../platform/env"
import { setStyle, writeStyle } from "../platform/style"

// The page-wide side effects of modal layers: the scroll lock and making the
// rest of the page inert. Several modals, and other libraries, can hold them
// at once, so each holder is tracked and only what was changed is put back,
// one style property at a time.

const shared = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("ui-sdk.modal@2")
] ??= {
  holders: new WeakMap(),
  thaw: new WeakMap(),
  inert: new WeakMap(),
}) as {
  holders: WeakMap<Document, Set<object>>
  thaw: WeakMap<Document, () => void>
  inert: WeakMap<Element, number>
}

/**
 * Stops the page from scrolling while a modal is open. The first lock on a
 * document freezes its scroller and the last release unfreezes it. On iOS,
 * `modal` also gets touch scrolling of its own contained, so a drag never
 * scrolls the page behind it. Returns a release that is safe to call twice.
 */
function lockScroll(doc = document, modal?: HTMLElement) {
  const token = {}
  let tokens = shared.holders.get(doc)
  if (!tokens) {
    shared.holders.set(doc, (tokens = new Set()))
  }
  if (!tokens.size) {
    shared.thaw.set(doc, freezeScroller(doc))
  }
  tokens.add(token)
  const unguard = modal && isIOS() ? guardTouch(modal) : undefined
  return () => {
    if (!tokens.delete(token)) {
      return
    }
    unguard?.()
    if (tokens.size) {
      return
    }
    shared.thaw.get(doc)?.()
    shared.thaw.delete(doc)
  }
}

// The styles that lock a scroller. A classic scrollbar takes up room, so its
// gutter stays and the page doesn't shift. Overlay scrollbars take none, so
// nothing is reserved and a short page doesn't gain a gutter.
function scrollLockStyles({
  scrollbar,
  gutter,
  padding,
}: {
  scrollbar: number
  gutter: boolean
  padding: number
}) {
  const styles: Record<string, string> = {
    overflow: "hidden",
    // Smooth scrolling would animate when the lock lifts.
    "scroll-behavior": "auto",
  }
  if (scrollbar > 0) {
    if (gutter) {
      styles["scrollbar-gutter"] = "stable"
    } else {
      styles["padding-right"] = `${padding + scrollbar}px`
    }
  }
  return styles
}

function freezeScroller(doc: Document) {
  const { scroller, gutter, padding } = early.get(doc) ?? measureScroller(doc)
  const styles = scrollLockStyles({
    scrollbar: gutter,
    gutter:
      typeof CSS !== "undefined" && CSS.supports("scrollbar-gutter", "stable"),
    padding,
  })
  const restores = Object.entries(styles).map(([name, value]) =>
    setStyle(scroller, name, value)
  )
  // A styling hook: a fixed header can pad itself by `var(--scrollbar-width, 0px)`.
  // Without a gutter it stays unset, since changing it restyles the whole page.
  if (gutter > 0) {
    restores.push(
      setStyle(doc.documentElement, "--scrollbar-width", `${gutter}px`)
    )
  }
  return () => restores.forEach((restore) => restore())
}

const early = new WeakMap<Document, ReturnType<typeof measureScroller>>()

/**
 * Measures the document's scroller for a scroll lock later in the same task.
 * A dialog calls it as it starts to open, before the framework renders it.
 * Layout is still clean then, so the read is free. Read after the dialog was
 * inserted and the page made inert, it makes the browser lay out the whole
 * page in the middle of the task, on top of the layout the next frame does.
 */
function measureScrollerEarly(doc: Document) {
  if (early.has(doc)) {
    return
  }
  early.set(doc, measureScroller(doc))
  setTimeout(() => early.delete(doc))
}

function measureScroller(doc: Document) {
  const view = doc.defaultView ?? window
  const scroller = documentScroller(doc, view)
  const computed = view.getComputedStyle(scroller)
  return {
    scroller,
    gutter: gutterWidth(scroller, doc, view, computed),
    padding: parseFloat(computed.paddingRight) || 0,
  }
}

// The root scrolls most pages. A body with its own overflow, under a root
// that clips, scrolls the rest.
function documentScroller(doc: Document, view: Window) {
  const { body, documentElement: root } = doc
  if (!body || view.getComputedStyle(root).overflowY === "visible") {
    return root
  }
  return /auto|scroll/.test(view.getComputedStyle(body).overflowY) ? body : root
}

// The room a classic scrollbar takes beside the scroller's content. Overlay
// scrollbars take none.
function gutterWidth(
  scroller: HTMLElement,
  doc: Document,
  view: Window,
  computed: CSSStyleDeclaration
) {
  if (scroller === doc.documentElement) {
    return view.innerWidth - scroller.clientWidth
  }
  const borders =
    (parseFloat(computed.borderLeftWidth) || 0) +
    (parseFloat(computed.borderRightWidth) || 0)
  return scroller.offsetWidth - scroller.clientWidth - borders
}

function canScroll(el: Element, view: Window) {
  const style = view.getComputedStyle(el)
  const vertical =
    /auto|scroll/.test(style.overflowY) && el.scrollHeight > el.clientHeight
  const horizontal =
    /auto|scroll/.test(style.overflowX) && el.scrollWidth > el.clientWidth
  return vertical || horizontal
}

function insideScroller(el: Element, view: Window) {
  const { body, documentElement } = el.ownerDocument
  for (
    let node: Element | null = el;
    node && node !== body && node !== documentElement;
    node = node.parentElement
  ) {
    if (canScroll(node, view)) {
      return true
    }
  }
  return false
}

/**
 * Who a touch gesture belongs to, decided once, when a finger lands.
 * `"browser"`: a pinch, or panning a zoomed page. `"element"`: something under
 * the finger moves on its own, like a scrolling list, a slider or a text
 * selection. `"page"`: nothing does, so the drag would scroll the page behind
 * the modal, and it's stopped.
 */
function touchOwner(start: {
  fingers: number
  zoomed: boolean
  scroller: boolean
  slider: boolean
  selecting: boolean
}) {
  if (start.fingers > 1 || start.zoomed) {
    return "browser"
  }
  if (start.scroller || start.slider || start.selecting) {
    return "element"
  }
  return "page"
}

// Contains overscroll inside a guarded modal, so reaching the end of a list
// in it never scrolls the page. In the lowest cascade layer, so any style wins.
const guardRule =
  "@layer ui-sdk { [data-scroll-guard], [data-scroll-guard] * { overscroll-behavior: contain } }"

// iOS ignores `overflow: hidden` while its toolbar is collapsed, and scrolls
// the page behind a modal. Overscroll inside the modal is contained, and a
// drag that would move the page is stopped. Never `position: fixed` on the
// body, which jumps and breaks sticky elements.
function guardTouch(modal: HTMLElement) {
  const doc = modal.ownerDocument
  const view = doc.defaultView ?? window
  writeStyle(doc, "ui-sdk-scroll-guard", guardRule)
  const marked = !modal.hasAttribute("data-scroll-guard")
  if (marked) {
    modal.setAttribute("data-scroll-guard", "")
  }

  let owner: ReturnType<typeof touchOwner> = "browser"
  const offStart = on(
    doc,
    "touchstart",
    (event) => {
      const target = event.target instanceof Element ? event.target : null
      owner = touchOwner({
        fingers: event.touches.length,
        zoomed: (view.visualViewport?.scale ?? 1) !== 1,
        scroller: !!target && insideScroller(target, view),
        slider: !!target?.closest('input[type="range"]'),
        selecting: doc.getSelection()?.type === "Range",
      })
    },
    { capture: true, passive: true }
  )
  const offMove = on(
    doc,
    "touchmove",
    (event) => {
      if (owner === "page" && event.cancelable) {
        event.preventDefault()
      }
    },
    { passive: false }
  )
  return () => {
    offStart()
    offMove()
    if (marked) {
      modal.removeAttribute("data-scroll-guard")
    }
  }
}

// A carousel's slides are live, but they are page content, so they go inert with the page.
const liveRegions =
  '[aria-live]:not([aria-live="off"]):not([data-slot="carousel-content"]),[role="status"],[role="alert"],[role="log"],output'

function parentOf(node: Node) {
  const parent = node.parentNode
  return parent instanceof ShadowRoot ? parent.host : parent
}

function applyInert(keep: Element[]) {
  const doc = keep[0]?.ownerDocument ?? document
  const all = [
    ...keep,
    ...Array.from(doc.querySelectorAll(liveRegions)),
    ...persistentLayers(),
  ]
  const targets = all.filter(
    (el) => !all.some((other) => other !== el && other.contains(el))
  )
  const keepSet = new Set<Node>()
  for (const el of targets) {
    for (let node: Node | null = el; node; node = parentOf(node)) {
      keepSet.add(node)
    }
  }
  const changed: HTMLElement[] = []
  for (const el of targets) {
    for (
      let node: Node | null = el;
      node && node !== doc.body;
      node = parentOf(node)
    ) {
      // Siblings live in the parent, or in the shadow root the node sits in.
      for (const sibling of Array.from(
        (node.parentNode as ParentNode | null)?.children ?? []
      )) {
        if (keepSet.has(sibling) || !(sibling instanceof HTMLElement)) {
          continue
        }
        const count =
          shared.inert.get(sibling) ?? (sibling.inert ? Infinity : 0)
        if (count === 0) {
          sibling.inert = true
        }
        if (count !== Infinity) {
          shared.inert.set(sibling, count + 1)
        }
        changed.push(sibling)
      }
    }
  }
  return () => {
    for (const el of changed) {
      const count = shared.inert.get(el)
      if (count === undefined) {
        continue
      }
      if (count <= 1) {
        el.inert = false
        shared.inert.delete(el)
      } else {
        shared.inert.set(el, count - 1)
      }
    }
  }
}

// Makes everything inert except the given elements, their ancestors and live
// regions. Works without portals: siblings along each ancestor path become
// inert, across shadow roots. `keep` exempts another element later, like a
// child popup that renders into a container.
function inertOutside(keep: HTMLElement[]) {
  let current: Element[] = keep
  let release = applyInert(current)
  let done = false
  const swap = (next: Element[]) => {
    const previous = release
    current = next
    release = applyInert(next)
    previous()
  }
  return Object.assign(
    () => {
      if (done) {
        return
      }
      done = true
      release()
    },
    {
      keep(el: HTMLElement) {
        if (done) {
          return () => {}
        }
        swap([...current, el])
        return () => {
          if (!done) {
            swap(current.filter((node) => node !== el))
          }
        }
      },
    }
  )
}

export {
  inertOutside,
  lockScroll,
  measureScrollerEarly,
  scrollLockStyles,
  touchOwner,
}
