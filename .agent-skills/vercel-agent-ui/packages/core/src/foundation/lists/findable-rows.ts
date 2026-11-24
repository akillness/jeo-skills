// Keeps a virtualized list's rows findable: a hidden stand-in per row that
// isn't rendered, in row order, and a match scrolled to before the browser
// shows it. Loaded only when a virtualizer connects with `findable`.
import { supportsHiddenUntilFound } from "../motion/panel"
import type { VirtualItem } from "./virtualizer"

// Stand-ins come in groups that are hidden until found too, so the browser
// skips style and layout for everything in a group.
const standInGroup = 100

const findableLayer = "data-findable-layer"

type FindableSlot = { el: HTMLElement; token: number }

type FindableHost = {
  count: () => number
  pieces: (index: number) => string[]
  horizontal: () => boolean
  scroller: () => HTMLElement | undefined
  items: () => readonly VirtualItem[]
  // The contiguous rows in view and the overscan, apart from `keep`.
  range: () => readonly [number, number]
  elements: Map<number, HTMLElement>
  slots: Map<number, (FindableSlot | undefined)[]>
  // Where a row starts in the scroller's view, in pixels along the list, and its size.
  place: (index: number) => { start: number; size: number }
  reveal: (index: number) => void
}

function attachFindable(host: FindableHost, parent: HTMLElement) {
  if (!supportsHiddenUntilFound()) {
    return undefined
  }
  const doc = parent.ownerDocument
  const group = () => {
    const el = doc.createElement("div")
    el.setAttribute("hidden", "until-found")
    return el
  }
  const layer = () => {
    const el = doc.createElement("div")
    el.setAttribute(findableLayer, "")
    Object.assign(el.style, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "0",
      height: "0",
    })
    el.addEventListener("beforematch", onMatch)
    return el
  }
  const layers = {
    before: layer(),
    after: layer(),
    beforeEdge: group(),
    afterEdge: group(),
  }
  // Each stand-in's row, so one listener per layer serves them all.
  let owners = new WeakMap<Element, number>()
  let standIns: HTMLElement[] = []
  let homes: HTMLElement[] = []
  let texts: Text[][] = []
  let spaces: Text[][] = []
  let split: { lo: number; hi: number; from: number; to: number } | undefined
  const touched = new Set<number>()
  let kept = new Set<number>()
  let parked = -1
  let holding = false
  let matching = -1
  const groupOf = (index: number) => Math.floor(index / standInGroup)

  function onMatch(event: Event) {
    const index = owners.get(event.target as Element)
    if (index !== undefined) {
      matched(index)
    }
  }

  function fill(el: HTMLElement, index: number, pieces: string[]) {
    const nodes = pieces.map((piece) => doc.createTextNode(piece))
    const between = nodes.slice(1).map(() => doc.createTextNode(" "))
    el.replaceChildren()
    nodes.forEach((node, part) =>
      el.append(node, ...(between[part] ? [between[part]] : []))
    )
    texts[index] = nodes
    spaces[index] = between
  }

  function build() {
    const count = host.count()
    releaseParked()
    owners = new WeakMap()
    standIns = []
    homes = []
    texts = []
    spaces = []
    split = undefined
    for (let start = 0; start < count; start += standInGroup) {
      homes.push(group())
      for (
        let index = start;
        index < Math.min(count, start + standInGroup);
        index++
      ) {
        const el = doc.createElement("div")
        el.setAttribute("hidden", "until-found")
        fill(el, index, host.pieces(index))
        owners.set(el, index)
        standIns.push(el)
      }
    }
    layers.before.replaceChildren(layers.beforeEdge)
    layers.after.replaceChildren(layers.afterEdge)
    for (const index of host.slots.keys()) {
      adopt(index)
    }
    sync()
  }

  // A rendered row's slots take its stand-in's own text nodes, so find in
  // page matches and highlights the row's text and counts it once.
  function adopt(index: number) {
    const own = host.slots.get(index)
    // A row past the end, like one just filtered out, is about to unmount.
    if (!own || index >= standIns.length || index === matching) {
      return
    }
    own.forEach((slot, part) => {
      const node = texts[index]?.[part]
      if (slot && node && node.parentNode !== slot.el) {
        slot.el.replaceChildren(node)
      }
    })
  }

  function restore(index: number, part: number) {
    const node = texts[index]?.[part]
    const standIn = standIns[index]
    if (!node || !standIn) {
      return
    }
    const space = spaces[index]?.[part]
    if (space) {
      standIn.insertBefore(node, space)
    } else {
      standIn.append(node)
    }
  }

  // Find in page steps in DOM order: stand-ins of rows above the window sit
  // before the rows and the rest after them, whole groups at a time, and
  // rendered rows have none in the page.
  function sync() {
    if (holding) {
      return
    }
    if (standIns.length !== host.count()) {
      return build()
    }
    const [from, to] = host.range()
    const lo = from < 0 ? homes.length : groupOf(from)
    const hi = from < 0 ? homes.length - 1 : groupOf(to)
    const items = host.items()
    // A window that overlaps the last one in the same groups only moves the
    // stand-ins at its edges; the find bar recounts after every change.
    if (
      split &&
      split.lo === lo &&
      split.hi === hi &&
      split.from >= 0 &&
      from >= 0 &&
      from <= split.to &&
      to >= split.from
    ) {
      shiftEdges(from, to)
    } else {
      regroup(from, to, lo, hi)
    }
    // Rows `keep` renders outside the window hide their stand-in.
    const next = new Set(
      items
        .map((item) => item.index)
        .filter((index) => index < from || index > to)
    )
    for (const index of kept) {
      if (!next.has(index)) {
        standIns[index]?.setAttribute("hidden", "until-found")
      }
    }
    for (const index of next) {
      if (index !== parked) {
        standIns[index]?.setAttribute("hidden", "")
      }
    }
    kept = next
    split = { lo, hi, from, to }
    // The matched row scrolled away: its stand-in goes back.
    if (parked !== -1 && !items.some((item) => item.index === parked)) {
      releaseParked()
    }
  }

  const between = (start: number, end: number) => {
    const list: HTMLElement[] = []
    for (let index = start; index < end; index++) {
      if (index !== parked && standIns[index]) {
        list.push(standIns[index])
      }
    }
    return list
  }

  function shiftEdges(from: number, to: number) {
    const old = split!
    if (from > old.from) {
      layers.beforeEdge.append(...between(old.from, from))
    } else {
      for (const el of between(from, old.from)) {
        el.remove()
      }
    }
    if (to < old.to) {
      layers.afterEdge.prepend(...between(to + 1, old.to + 1))
    } else {
      for (const el of between(old.to + 1, to + 1)) {
        el.remove()
      }
    }
  }

  function regroup(from: number, to: number, lo: number, hi: number) {
    const { beforeEdge, afterEdge } = layers
    const first = split ? Math.min(split.lo, lo) : 0
    const last = split ? Math.max(split.hi, hi) : homes.length - 1
    const rebuild = new Set(touched)
    touched.clear()
    for (let at = first; at <= last; at++) {
      rebuild.add(at)
    }
    for (const at of rebuild) {
      const home = homes[at]
      if (!home) {
        continue
      }
      home.replaceChildren(
        ...between(at * standInGroup, (at + 1) * standInGroup)
      )
      home.setAttribute("hidden", "until-found")
    }
    for (let at = first; at <= last; at++) {
      homes[at]?.remove()
    }
    beforeEdge.before(...homes.slice(first, Math.min(lo, last + 1)))
    afterEdge.after(...homes.slice(Math.max(hi + 1, first), last + 1))
    beforeEdge.replaceChildren(
      ...(from < 0 ? [] : between(lo * standInGroup, from))
    )
    afterEdge.replaceChildren(
      ...(from < 0
        ? []
        : between(to + 1, Math.min(standIns.length, (hi + 1) * standInGroup)))
    )
    beforeEdge.setAttribute("hidden", "until-found")
    afterEdge.setAttribute("hidden", "until-found")
  }

  function placeBack(index: number) {
    const el = standIns[index]
    if (!el) {
      return
    }
    const at = groupOf(index)
    const old = split
    if (!old) {
      el.remove()
      touched.add(at)
      return
    }
    const into =
      at < old.lo || at > old.hi
        ? homes[at]
        : index < old.from
          ? layers.beforeEdge
          : index > old.to
            ? layers.afterEdge
            : undefined
    if (!into) {
      return void el.remove()
    }
    let next: HTMLElement | undefined
    for (
      let after = index + 1;
      after < standIns.length && groupOf(after) <= at + 1;
      after++
    ) {
      if (standIns[after].parentElement === into) {
        next = standIns[after]
        break
      }
    }
    into.insertBefore(el, next ?? null)
  }

  function releaseParked() {
    if (parked === -1) {
      return
    }
    const index = parked
    const el = standIns[index]
    parked = -1
    if (!el) {
      return
    }
    el.removeAttribute("style")
    el.setAttribute("hidden", "until-found")
    placeBack(index)
  }

  // The browser matched a row that isn't rendered, and reveals and scrolls
  // after this, so the list goes there first and the stand-in lies, clear,
  // over the row. Nothing else moves until the next frame.
  function matched(index: number) {
    const el = standIns[index]
    const scroller = host.scroller()
    if (!scroller || !el) {
      return
    }
    if (parked !== -1 && parked !== index) {
      releaseParked()
    }
    holding = true
    matching = index
    host.reveal(index)
    const box = scroller.getBoundingClientRect()
    const origin = (
      el.closest(`[${findableLayer}]`) ?? layers.after
    ).getBoundingClientRect()
    const { start, size } = host.place(index)
    const horizontal = host.horizontal()
    Object.assign(el.style, {
      position: "absolute",
      left: `${box.left + scroller.clientLeft - origin.left + (horizontal ? start : 0)}px`,
      top: `${box.top + scroller.clientTop - origin.top + (horizontal ? 0 : start)}px`,
      width: `${horizontal ? size : scroller.clientWidth}px`,
      height: `${horizontal ? scroller.clientHeight : size}px`,
      overflow: "hidden",
      opacity: "0",
      pointerEvents: "none",
    })
    parked = index
    const settle = () => {
      holding = false
      matching = -1
      // The browser's own scroll misses the page around the list, so the row brings itself into view.
      const target =
        host.elements.get(index) ?? host.slots.get(index)?.find(Boolean)?.el
      target?.scrollIntoView({ block: "nearest", inline: "nearest" })
      // With slots, the row takes the matched text itself, highlight and all.
      if (host.slots.get(index)?.some(Boolean)) {
        adopt(index)
        if (parked === index) {
          releaseParked()
        }
        return sync()
      }
      // Inside its row, the match stays where find in page continues from: the next match is after this row.
      const row = host.elements.get(index)
      if (parked === index && row) {
        Object.assign(el.style, {
          left: "0",
          top: "0",
          width: "100%",
          height: "100%",
        })
        row.append(el)
      }
      sync()
    }
    if (typeof requestAnimationFrame === "undefined") {
      settle()
    } else {
      requestAnimationFrame(settle)
    }
  }

  // New text goes into the same nodes, so rendered rows that hold them show it too.
  function refresh() {
    if (standIns.length !== host.count()) {
      return build()
    }
    for (let index = 0; index < standIns.length; index++) {
      const pieces = host.pieces(index)
      const nodes = texts[index]
      if (pieces.length !== nodes.length) {
        for (const node of nodes) {
          node.remove()
        }
        fill(standIns[index], index, pieces)
        adopt(index)
        continue
      }
      for (let part = 0; part < pieces.length; part++) {
        if (nodes[part].data !== pieces[part]) {
          nodes[part].data = pieces[part]
        }
      }
    }
  }

  parent.prepend(layers.before)
  parent.append(layers.after)
  build()

  return {
    sync,
    refresh,
    adopt,
    // Also when another row's text pushed it out of `el`.
    restore(index: number, part: number, el: HTMLElement) {
      const node = texts[index]?.[part]
      if (node && (node.parentNode === el || !node.parentNode)) {
        restore(index, part)
      }
    },
    matching: () => matching,
    release: releaseParked,
    detach() {
      layers.before.remove()
      layers.after.remove()
      releaseParked()
    },
  }
}

type FindableRows = NonNullable<ReturnType<typeof attachFindable>>

export {
  attachFindable,
  type FindableHost,
  type FindableRows,
  type FindableSlot,
}
