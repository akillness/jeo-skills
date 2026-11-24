import { dev, emit } from "#dev"
import { isComposing, on } from "../kernel/events"
import { composedContains, composedHops } from "./platform"
import { pressedScrollbar } from "./scrollbar"

// Every open popup is a layer. Layers nest: a submenu's layer has its menu's
// layer as parent. Outside presses, Escape and window blur go to the right layer.
type Layer = {
  // Elements that count as inside, such as the popup and its trigger. `event`
  // is the press being decided, when there is one.
  contains: (target: Node, event?: Event) => boolean
  parent?: Layer
  // False once the layer starts to close. Closed layers ignore dismissal.
  active: () => boolean
  // True while the layer animates out. It's inert then, so presses fall through
  // it to the page. A modal one swallows those on its backdrop, so a double
  // click that dismissed it can't land on the page, and shields the layers beneath it.
  exiting?: () => boolean
  // Whether a point is on the layer's backdrop, outside its popup.
  overBackdrop?: (x: number, y: number) => boolean
  // "pointer" and true consume the outside press, so it only closes the layer.
  modal: boolean | "pointer"
  // When an outside press dismisses: at "pointerdown", or at "click", once the
  // press has also been released outside, like native light dismiss. A text
  // selection dragged out of a field then never dismisses. Touch always waits for the click.
  outsidePress?: "pointerdown" | "click"
  // Stops an outside press here, so the layers beneath stay open, like a modal
  // dialog whose backdrop was pressed.
  shield?: boolean
  // Keeps an element usable while this layer makes the rest of the page
  // inert, like a child popup rendered into a container. Returns a release.
  keep?: (el: HTMLElement) => () => void
  // Where focus can go when a popup opened from inside this one closes: the
  // first candidate `take` accepts, like one that took focus when tried.
  // With `strict`, what took the place of a trigger that left isn't one.
  returnTarget?: (
    take?: (target: HTMLElement) => boolean,
    strict?: boolean
  ) => HTMLElement | undefined
  onEscape?: (event: KeyboardEvent) => void
  onOutsidePress?: (event: Event) => void
  onBlur?: (event: FocusEvent) => void
  // Pauses keyboard shortcuts registered outside it, like a modal dialog does
  // for the page's. Shortcuts scoped to it, or to layers above it, still run.
  blocking?: boolean
  // When the layer opened, relative to the others. Set by pushLayer.
  order?: number
  // The component and instance it belongs to, for the devtools, and its
  // element, whose document hears the presses and keys that reach it.
  component?: string
  id?: string
  el?: Element
}

const realm = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("ui-sdk.layers@2")
] ??= {
  stack: [] as Layer[],
  listening: new Map(),
}) as {
  stack: Layer[]
  // The documents with open layers, which listen for presses and keys, and how many layers each has.
  listening: Map<Document, { layers: number; stop: () => void }>
  pushed?: number
  persistent?: Set<Element>
  escapeAt?: number
  closed?: HTMLElement
}

function persistent() {
  return (realm.persistent ??= new Set())
}

/**
 * Keeps an element live over every layer, like a toast region over a modal
 * dialog: modal layers don't make it inert, whether they opened before or
 * after, and presses in it never dismiss a layer. A persistent element shown
 * in the top layer goes back above any popup that opens later. Returns a
 * function that undoes it.
 * @stable
 */
function bindPersistentLayer(el: Element) {
  persistent().add(el)
  const releases = active().flatMap((layer) =>
    layer.keep && el instanceof HTMLElement ? [layer.keep(el)] : []
  )
  const stopRaising = raiseAbovePopups(el.ownerDocument)
  return () => {
    persistent().delete(el)
    releases.forEach((release) => release())
    stopRaising()
  }
}

// Whether a node is inside a persistent layer, like a toast region.
function inPersistentLayer(target: Node) {
  for (const el of persistent()) {
    if (composedContains(el, target)) {
      return true
    }
  }
  return false
}

const raising = new WeakMap<Document, { count: number; off: () => void }>()

// The top layer stacks in the order things were shown, so a dialog opened
// after a toast region covers it. Whenever another popover opens, persistent
// ones are shown again, which moves them back to the top.
function raiseAbovePopups(doc: Document) {
  let entry = raising.get(doc)
  if (!entry) {
    const onToggle = (event: Event) => {
      const opened = event.target
      if (
        (event as ToggleEvent).newState !== "open" ||
        !(opened instanceof Element)
      ) {
        return
      }
      if (inPersistentLayer(opened)) {
        return
      }
      for (const el of persistentLayers()) {
        if (el instanceof HTMLElement) {
          showAgain(el)
        }
      }
    }
    // Toggle events don't bubble, so the document hears them while capturing.
    doc.addEventListener("toggle", onToggle, true)
    entry = {
      count: 0,
      off: () => doc.removeEventListener("toggle", onToggle, true),
    }
    raising.set(doc, entry)
  }
  const current = entry
  current.count++
  let done = false
  return () => {
    if (done) {
      return
    }
    done = true
    if (--current.count > 0) {
      return
    }
    current.off()
    raising.delete(doc)
  }
}

// Shows a popover again, so it moves to the top of the top layer, and keeps focus where it was.
function showAgain(el: HTMLElement) {
  if (!el.isConnected || !el.matches(":popover-open")) {
    return
  }
  const focused = el.ownerDocument.activeElement as HTMLElement | null
  try {
    el.hidePopover()
    el.showPopover()
  } catch {}
  // Hiding sends focus back to where it was before the popover showed.
  if (focused && focused !== el.ownerDocument.activeElement) {
    focused.focus({ preventScroll: true })
  }
}

// The persistent layers, for modal side effects.
function persistentLayers() {
  return [...persistent()].filter((el) => el.isConnected)
}

// How many layers have opened so far. A layer opened after a moment has a higher order.
function layerCount() {
  return realm.pushed ?? 0
}

function openedSince(order: number) {
  return active().some((layer) => (layer.order ?? 0) > order)
}

function active() {
  return realm.stack.filter((layer) => layer.active())
}

// The open layers, oldest first.
function activeLayers() {
  return active()
}

// When Escape last reached the layers, so a close request the browser makes
// for the same key press, like a CloseWatcher's, can tell it was already handled.
function lastEscape() {
  return realm.escapeAt ?? -Infinity
}

// A press or focus in a shadow root inside a layer, like on a custom
// element's own button, is inside it, so each layer hears the node and the
// elements it shows through in outer trees.
function insideTree(layer: Layer, target: Node, event?: Event) {
  return insideTreeAt(layer, composedHops(target), event)
}

// check-code: allow return-type recursive, so TypeScript cannot infer it.
function insideTreeAt(layer: Layer, hops: Node[], event?: Event): boolean {
  if (hops.some((hop) => layer.contains(hop, event))) {
    return true
  }
  return active().some(
    (other) => other.parent === layer && insideTreeAt(other, hops, event)
  )
}

function listen(doc: Document, win: Window) {
  let swallowClick = false
  let touch: { x: number; y: number; target: Node } | undefined

  let pending:
    { layer: Layer; target: Node; point: { x: number; y: number } } | undefined

  function plan(event: Event, target: Node, point: { x: number; y: number }) {
    const dismissed: Layer[] = []
    let consume = false
    if (inPersistentLayer(target)) {
      return { dismissed, consume }
    }
    for (const layer of [...realm.stack].reverse()) {
      if (layer.active()) {
        if (insideTree(layer, target, event)) {
          break
        }
        if (layer.modal !== false) {
          consume = true
        }
        dismissed.push(layer)
        if (layer.shield) {
          break
        }
      } else if (layer.exiting?.()) {
        if (insideTree(layer, target, event)) {
          break
        }
        if (layer.modal === false) {
          continue
        }
        if (layer.overBackdrop?.(point.x, point.y)) {
          consume = true
        }
        break
      }
    }
    return { dismissed, consume }
  }

  function dismiss(
    event: Event,
    target: Node,
    point: { x: number; y: number }
  ) {
    const { dismissed, consume } = plan(event, target, point)
    for (const layer of dismissed) {
      layer.onOutsidePress?.(event)
    }
    return consume
  }

  const offPointerDown = on(
    win,
    "pointerdown",
    (event) => {
      swallowClick = false
      const target = event.composedPath()[0] as Node
      if (event.pointerType === "touch") {
        touch = { x: event.clientX, y: event.clientY, target }
        return
      }
      touch = undefined
      pending = undefined
      if (pressedScrollbar(event, target)) {
        return
      }
      const point = { x: event.clientX, y: event.clientY }
      const { dismissed, consume } = plan(event, target, point)
      if (dismissed[0]?.outsidePress === "click") {
        if (event.button !== 0) {
          return
        }
        pending = { layer: dismissed[0], target, point }
        if (consume) {
          event.preventDefault()
          swallowClick = true
        }
        return
      }
      // Before the layers hear it, since closing the last one stops this listening.
      if (consume) {
        // Prevents the mousedown that would move focus, and the click.
        event.preventDefault()
        swallowClick = true
      }
      for (const layer of dismissed) {
        layer.onOutsidePress?.(event)
      }
    },
    { capture: true }
  )

  const offPointerUp = on(
    win,
    "pointerup",
    (event) => {
      const press = pending
      pending = undefined
      if (!press || !press.layer.active()) {
        return
      }
      if (insideTree(press.layer, event.composedPath()[0] as Node, event)) {
        return
      }
      dismiss(event, press.target, press.point)
    },
    { capture: true }
  )

  const offClick = on(
    win,
    "click",
    (event) => {
      // A key's click, like Space on the trigger, isn't the press's: that one
      // never came once its target left before the release.
      if (swallowClick && event.detail) {
        swallowClick = false
        event.preventDefault()
        event.stopPropagation()
        return
      }
      swallowClick = false
      if (!touch) {
        return
      }
      const press = touch
      touch = undefined
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
        return
      }
      if (dismiss(event, press.target, { x: press.x, y: press.y })) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    { capture: true }
  )

  const offKey = on(doc, "keydown", (event) => escapeTop(doc, event))

  // A click into an iframe or another window never reaches the page. Each
  // layer decides what that means for it.
  const offBlur = on(win, "blur", (event) => {
    for (const layer of active().reverse()) {
      layer.onBlur?.(event)
    }
  })

  return () => {
    offPointerDown()
    offPointerUp()
    offKey()
    offBlur()
    if (!swallowClick) {
      return offClick()
    }
    // The press that closed the last layer still owes its click, which would
    // reach the page. It's swallowed when it comes, and forgotten at the next press.
    const off = () => (offClick(), offNext(), offSwallowed())
    const offNext = on(win, "pointerdown", off, { capture: true })
    const offSwallowed = on(win, "click", off, { capture: true })
  }
}

// Whether a node is inside a layer or any open layer nested under it, such as
// a popup opened from inside another popup and portaled elsewhere.
function layerContains(layer: Layer, target: Node) {
  return insideTree(layer, target)
}

// The topmost open layer that contains a node. A popup whose trigger sits
// inside another popup nests under it, so pressing inside the child never
// dismisses the parent.
function findLayer(target: Node) {
  const hops = composedHops(target)
  return active()
    .reverse()
    .find((layer) => hops.some((hop) => layer.contains(hop)))
}

// Where focus would have gone from the popup that closed last, until the
// task ends. A popup that opens as another closes, like a dialog whose `open`
// state a menu item set, returns focus there once the item is gone. Only the
// element is kept, so the closed popup's content can go.
function markClosed(target: HTMLElement | undefined) {
  realm.closed = target
  setTimeout(() => {
    if (realm.closed === target) {
      realm.closed = undefined
    }
  })
}

function lastClosed() {
  return realm.closed
}

function report() {
  if (!dev) {
    return
  }
  emit({
    type: "layers",
    stack: realm.stack.map((layer) => ({
      component: layer.component ?? "popup",
      id: layer.id ?? "",
      modal: layer.modal,
      blocking: !!layer.blocking,
      el: layer.el,
    })),
  })
}

// The layer's own document listens while it has a layer open, so a popup
// moved into an iframe hears presses and Escape there.
function listenIn(doc: Document) {
  const win = doc.defaultView
  if (!win) {
    return () => {}
  }
  let entry = realm.listening.get(doc)
  if (!entry) {
    realm.listening.set(doc, (entry = { layers: 0, stop: listen(doc, win) }))
  }
  const current = entry
  current.layers++
  return () => {
    if (--current.layers > 0) {
      return
    }
    realm.listening.delete(doc)
    current.stop()
  }
}

function documentOf(layer: Layer) {
  return layer.el?.ownerDocument ?? document
}

// Escape goes to the topmost layer of the document it was pressed in: one
// open in another, like an iframe's, didn't hear the key. With `from`, only
// when that layer is the topmost, as its own content hears the key first.
function escapeTop(doc: Document, event: KeyboardEvent, from?: Layer) {
  // Escape ends an input method's composition first, like a Japanese candidate list.
  if (event.key !== "Escape" || event.defaultPrevented || isComposing(event)) {
    return
  }
  const top = active()
    .filter((layer) => documentOf(layer) === doc)
    .at(-1)
  if (!top?.onEscape || (from && top !== from)) {
    return
  }
  realm.escapeAt = performance.now()
  top.onEscape(event)
}

// Escape on a layer's own content, before it bubbles to ancestors that may
// act on it too. The document still hears what never reached a layer.
function escapeLayer(layer: Layer, event: KeyboardEvent) {
  escapeTop(documentOf(layer), event, layer)
}

function pushLayer(layer: Layer) {
  realm.pushed = (realm.pushed ?? 0) + 1
  layer.order = realm.pushed
  realm.stack.push(layer)
  const stopListening = listenIn(documentOf(layer))
  report()
  let popped = false
  return () => {
    if (popped) {
      return
    }
    popped = true
    const index = realm.stack.indexOf(layer)
    if (index !== -1) {
      realm.stack.splice(index, 1)
    }
    stopListening()
    report()
  }
}

export {
  activeLayers,
  bindPersistentLayer,
  escapeLayer,
  findLayer,
  inPersistentLayer,
  lastClosed,
  lastEscape,
  type Layer,
  layerContains,
  layerCount,
  markClosed,
  openedSince,
  persistentLayers,
  pushLayer,
}
