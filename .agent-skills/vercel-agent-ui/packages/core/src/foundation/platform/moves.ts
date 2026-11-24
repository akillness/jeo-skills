// What can move a positioned popup or its anchor once both sit still:
// scrolling, resizing, the page changing, input, things loading, and
// animations starting. Positioning sleeps while none of these happen, so an
// open popup on a page nobody touches does next to no work, and wakes on the
// first of them. Once awake, it stays awake for as long as something moves,
// like an anchor in a sliding sidebar. What nothing here reports, like an
// animation that holds still and then moves again, is the slow check's job.
//
// A popup sits outside the page's flow, so nothing that happens inside it can
// move it or its anchor. It can only change the popup's size, which the
// popup's own ResizeObserver reports. So a change inside a popup wakes the
// others, like a submenu anchored to the item that changed, and not the popup
// itself: moving the highlight through a menu runs no positioning frames.

const wakers = new Map<() => void, Element | undefined>()
// What `unlisten` goes back to once the last popup closes. The old one keeps
// its aborted signal, whose reason is an error whose stack keeps the closed
// popup, its anchor and the page around them alive. It's made out here, since
// a function made in the cleanup would share its scope and keep them too.
const idle = () => {}
let unlisten = idle

const wakeOutside = (event: Event) =>
  wakers.forEach(
    (popup, wake) =>
      (event.target instanceof Node && popup?.contains(event.target)) || wake()
  )

const wakeOnChanges = (records: MutationRecord[]) =>
  wakers.forEach(
    (popup, wake) =>
      records.some(
        (record) =>
          record.attributeName != "aria-activedescendant" &&
          !popup?.contains(record.target)
      ) && wake()
  )

function listen() {
  const listening = new AbortController()
  // The capture phase, so events that don't bubble count too: element
  // scrolls, and images loading, which never reach the window.
  const options = { capture: true, passive: true, signal: listening.signal }
  const targets = [
    // Pointer moves and focus can change layout through `:hover` and `:focus`
    // styles, and typing through fields that grow with their text. A
    // transition starts after its delay.
    [
      document,
      [
        "scroll",
        "load",
        "input",
        "pointermove",
        "focusin",
        "transitionstart",
        "animationstart",
      ],
    ],
    [window, ["resize"]],
    // Pinch zoom moves the visual viewport without resizing the window.
    [window.visualViewport, ["resize", "scroll"]],
    [document.fonts, ["loadingdone"]],
  ] as const
  for (const [target, types] of targets) {
    for (const type of types) {
      target?.addEventListener(type, wakeOutside, options)
    }
  }
  const changes = new MutationObserver(wakeOnChanges)
  changes.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  return () => {
    listening.abort()
    changes.disconnect()
  }
}

// Scrolls, loads, animations and changes inside a shadow root never reach the
// document's listeners, so each root an anchor renders in gets its own.
const roots = new Map<Node, { count: number; stop: () => void }>()

function listenIn(root: Node) {
  const listening = new AbortController()
  const options = { capture: true, passive: true, signal: listening.signal }
  for (const type of ["scroll", "load", "transitionstart", "animationstart"]) {
    root.addEventListener(type, wakeOutside, options)
  }
  const changes = new MutationObserver(wakeOnChanges)
  changes.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  })
  return () => {
    listening.abort()
    changes.disconnect()
  }
}

/**
 * The shadow roots `node` renders in, walking up through the slots it's
 * assigned to: a light DOM node slotted into a scroller inside a shadow root
 * moves with that scroller, though its own root is the document.
 */
function shadowRootsAround(node: Node) {
  const found: Node[] = []
  for (let at: Node | null = node; at;) {
    // A shadow root is the only fragment with a host. Checked by shape, since
    // `instanceof ShadowRoot` fails for nodes from another window.
    if (at.nodeType === 11 && "host" in at) {
      found.push(at)
      at = (at as ShadowRoot).host
    } else {
      at = (at as Element).assignedSlot ?? at.parentNode
    }
  }
  return found
}

/**
 * Wakes every open popup on what moves inside `shadowRoots`, until the
 * returned cleanup runs.
 */
function watchShadowRoots(shadowRoots: Node[]) {
  const watched = [...shadowRoots]
  for (const root of watched) {
    const entry = roots.get(root) ?? { count: 0, stop: listenIn(root) }
    entry.count++
    roots.set(root, entry)
  }
  return () => {
    for (const root of watched.splice(0)) {
      const entry = roots.get(root)!
      if (--entry.count) {
        continue
      }
      entry.stop()
      roots.delete(root)
    }
  }
}

/**
 * Calls `wake` whenever the page might have moved something, until the
 * returned cleanup runs: changes outside `popup`, and `popup` resizing. Every
 * open popup shares one set of listeners.
 */
function watchMoves(wake: () => void, popup?: Element) {
  if (!wakers.size) {
    unlisten = listen()
  }
  const sizes =
    typeof ResizeObserver == "function" ? new ResizeObserver(wake) : undefined
  if (popup) {
    sizes?.observe(popup)
  }
  wakers.set(wake, sizes && popup)
  return () => {
    sizes?.disconnect()
    wakers.delete(wake)
    if (wakers.size) {
      return
    }
    unlisten()
    unlisten = idle
  }
}

export { shadowRootsAround, watchMoves, watchShadowRoots }
