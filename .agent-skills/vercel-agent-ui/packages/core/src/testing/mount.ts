// A primitive rendered without a framework, for tests: every slot in the
// markup becomes a plain element, wired the way a renderer wires it, and the
// test drives it with a person's input and reads what changed and what was
// announced.
import { click, drag, hover, keys, settle, type } from "./input"
import { parseMarkup, type MarkupNode } from "./markup"
import { camel, fromOf, slotProps, tagOf } from "./schema"
import { setAnnouncer } from "../foundation/platform/announce"
import { applyAttrs } from "../foundation/kernel/live"
import { attrs, bind, present, subscribe } from "../foundation/kernel/part"
import { schemaOf } from "../foundation/kernel/primitive"
import type {
  OptionsOf,
  Part,
  Primitive,
  SlotName,
} from "../foundation/kernel/primitive-types"
import { listen, type ObservedChange } from "../page/observe/registry"

let mounted = 0

// What tests reach on a mount besides its public face: render it again with
// new options or new slot props, as a framework does after the first render.
// An empty key names a slot's first part.
type Rerender = {
  setOptions: (patch: Record<string, unknown>) => void
  setProps: (slot: string, key: string, patch: Record<string, unknown>) => void
}
const rerenders = new WeakMap<object, Rerender>()

// What each mount hears announced. `announce` names no instance, so every
// mount hears what's announced while it's mounted, and the last one to
// unmount gives announcements back to the page's live regions.
const announcers = new Set<(text: string) => void>()
const announceToMounts = (text: string) =>
  announcers.forEach((hear) => hear(text))

function listenToAnnouncements(hear: (text: string) => void) {
  announcers.add(hear)
  setAnnouncer(announceToMounts)
  return () => {
    announcers.delete(hear)
    if (!announcers.size) {
      setAnnouncer(undefined)
    }
  }
}

// Parts have no layout in a DOM made for tests. Each gets a box by its place
// among its siblings of the same slot, in a column, or a row when its list is
// horizontal, mirrored in right to left text, so a drag and spatial arrows
// move past real positions.
function layOut(el: HTMLElement) {
  el.getBoundingClientRect = () => {
    const siblings = el.parentElement
      ? [...el.parentElement.children].filter(
          (child) =>
            child.getAttribute("data-slot") === el.getAttribute("data-slot")
        )
      : [el]
    const index = Math.max(0, siblings.indexOf(el))
    const row = el.closest(
      '[aria-orientation="horizontal"], [data-orientation="horizontal"]'
    )
    // A row runs right to left in right to left text, as a browser lays it out.
    const rtl = el.closest("[dir]")?.getAttribute("dir") === "rtl"
    const [width, height] = row ? [100, 40] : [200, 40]
    const x = row ? (rtl ? siblings.length - 1 - index : index) * width : 0
    const y = row ? 0 : index * height
    return {
      x,
      y,
      left: x,
      top: y,
      width,
      height,
      right: x + width,
      bottom: y + height,
      toJSON: () => ({}),
    }
  }
  // Rendered while in the page, so what follows an element, like a popup its
  // trigger, finds it there after the first look.
  el.getClientRects = () =>
    (el.isConnected
      ? [el.getBoundingClientRect()]
      : []) as unknown as DOMRectList
}

// What a DOM made for tests leaves out that primitives call: animations, which
// it never runs, visibility, which it can't compute without layout, and hit
// testing, answered from the boxes parts are given.
function fillGaps(doc: Document) {
  const proto = Element.prototype as {
    getAnimations?: () => Animation[]
    checkVisibility?: (this: Element) => boolean
  }
  proto.getAnimations ??= () => []
  Element.prototype.scrollIntoView ??= () => {}
  // No top layer here, so popups render in place, and the DOM's own styles
  // would keep an open one hidden, where nothing inside can take focus.
  if (!doc.querySelector("style[data-ui-sdk-testing]")) {
    const style = doc.createElement("style")
    style.setAttribute("data-ui-sdk-testing", "")
    style.textContent = "[popover][data-open] { display: block !important }"
    doc.head.append(style)
  }
  // Shown unless it or an ancestor is hidden, not displayed or invisible.
  proto.checkVisibility ??= function (this: Element) {
    if (!this.isConnected) {
      return false
    }
    for (let node: Element | null = this; node; node = node.parentElement) {
      if ((node as HTMLElement).hidden) {
        return false
      }
      const style = getComputedStyle(node)
      if (style.display === "none" || style.visibility === "hidden") {
        return false
      }
    }
    return true
  }
  doc.elementsFromPoint ??= (x: number, y: number) =>
    [...doc.querySelectorAll("[data-slot]")]
      .filter((el) => {
        const box = el.getBoundingClientRect()
        return x >= box.left && x < box.right && y >= box.top && y < box.bottom
      })
      .reverse()
  doc.elementFromPoint ??= (x: number, y: number) =>
    doc.elementsFromPoint(x, y)[0] ?? null
}

/**
 * Renders a primitive's slots from markup, without a framework, wired the way
 * a renderer wires them: attributes, handlers, presence and `bind`, kept
 * current on every change. Each tag in `markup` is a slot, and its attributes
 * are the slot's props, parsed by the slot's schema; other attributes and
 * text stay on the element. Needs a DOM, like jsdom or happy-dom; it fills in
 * the animations and hit testing those leave out.
 *
 * @example
 * const list = mount(sortable, { defaultValue: ["a", "b"] }, `<root><item value="a">A</item><item value="b">B</item></root>`)
 * await list.keys("Tab", "Space", "ArrowDown", "Space")
 * expect(list.state.value).toEqual(["b", "a"])
 *
 * @experimental
 */
function mount<P extends Primitive>(
  primitive: P,
  options: OptionsOf<P>,
  markup: string
) {
  const schema = schemaOf(primitive)
  const doc = document
  fillGaps(doc)
  const id = `mount-${++mounted}`
  const changes: ObservedChange[] = []
  const settled: ObservedChange[] = []
  const announced: string[] = []
  const cleanups: (() => void)[] = [
    listen((change) => change.id === id && changes.push(change), true),
    listen((change) => change.id === id && settled.push(change)),
  ]
  const teardown = [listenToAnnouncements((text) => announced.push(text))]
  // A cleanup that throws doesn't stop the rest, so nothing a mount made outlives it.
  function unmount() {
    const errors: unknown[] = []
    for (const step of [...cleanups.splice(0), ...teardown.splice(0)]) {
      try {
        step()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length) {
      throw errors[0]
    }
  }
  function unmountingOnError<T>(run: () => T) {
    try {
      return run()
    } catch (error) {
      unmount()
      throw error
    }
  }
  const container = doc.createElement("div")
  doc.body.append(container)
  teardown.unshift(() => container.remove())
  let current: Record<string, unknown> = { ...options, id }
  const instance = unmountingOnError(() => primitive(current as never))
  teardown.unshift(() => instance.destroy())
  const parts: {
    slot: string
    key: string
    el: HTMLElement
    props: Record<string, unknown>
    inherited: { key: string; slot: string; prop: string }[]
    sync: () => void
    rerender: (props: Record<string, unknown>) => void
    shows: () => boolean
  }[] = []
  const syncs: (() => void)[] = []

  // Renders a markup node into `parent`, with the props of the parts around it
  // for props a nested part takes from its parent, like an item's `value`.
  function render(
    node: MarkupNode | string,
    parent: Node,
    around: Record<string, Record<string, unknown>>
  ) {
    if (typeof node === "string") {
      return parent.appendChild(doc.createTextNode(node))
    }
    const own = schema.slots[node.tag]
    if (!own) {
      const el = doc.createElement(node.tag)
      for (const [name, value] of node.attributes) {
        el.setAttribute(name, value)
      }
      parent.appendChild(el)
      for (const child of node.children) {
        render(child, el, around)
      }
      return
    }
    const slot = node.tag
    const { props, extra, as } = slotProps(
      own,
      node.attributes,
      around,
      () => `${id}-${slot}-${parts.length}`
    )
    let part = instance.part(slot as SlotName<P>, props as never) as Part
    const el = doc.createElement(as ?? tagOf(attrs(part)))
    for (const [name, value] of extra) {
      el.setAttribute(name, value)
    }
    layOut(el)
    const placeholder = doc.createComment(slot)
    parent.appendChild(placeholder)
    // A part that isn't present waits as a comment, unbound, and takes its
    // place and binds when it is, as a renderer binds only what it renders.
    let unbind: (() => void) | undefined
    let ready = false
    const sync = () => {
      applyAttrs(el, attrs(part))
      const shows = present(part)
      const swaps = shows ? placeholder.parentNode : el.parentNode
      if (shows && swaps) {
        placeholder.replaceWith(el)
      } else if (!shows && swaps) {
        el.replaceWith(placeholder)
      }
      if (!ready) {
        return
      }
      // Nor is a part rendered inside one that isn't.
      const rendered =
        shows &&
        !parts.some(
          (outer) => outer.el !== el && !outer.shows() && outer.el.contains(el)
        )
      if (rendered && !unbind) {
        // Binding can change state, which calls this again before it returns.
        let cleanup: (() => void) | undefined
        unbind = () => cleanup?.()
        cleanup = bind(part, el)
      } else if (!rendered && unbind) {
        unbind()
        unbind = undefined
      }
      if (swaps) {
        for (const inner of parts) {
          if (inner.el !== el && el.contains(inner.el)) {
            inner.sync()
          }
        }
      }
    }
    sync()
    syncs.push(sync)
    const inherited = Object.keys(own).flatMap((key) => {
      const from = fromOf(own[key], key)
      return from && !node.attributes.some(([name]) => camel(name) === key)
        ? [{ key, ...from }]
        : []
    })
    let unsubscribe: (() => void) | undefined
    // Props with a new key, like a new `id`, make another part, which a
    // renderer binds the element to in place of the first.
    const rerender = (next: Record<string, unknown>) => {
      const found = instance.part(slot as SlotName<P>, next as never) as Part
      if (found === part) {
        return
      }
      unbind?.()
      unbind = undefined
      unsubscribe?.()
      part = found
      entry.key = part.key
      if (ready) {
        unsubscribe = subscribe(part, sync)
      }
    }
    const entry = {
      slot,
      key: part.key,
      el,
      props,
      inherited,
      sync,
      rerender,
      shows: () => present(part),
    }
    parts.push(entry)
    binds.push(() => {
      ready = true
      unsubscribe = subscribe(part, sync)
      cleanups.push(
        () => unsubscribe?.(),
        () => unbind?.()
      )
      sync()
    })
    for (const child of node.children) {
      render(child, el, { ...around, [slot]: props })
    }
  }

  // Parts bind once every element is in the page, parents first, as custom elements do.
  const binds: (() => void)[] = []
  unmountingOnError(() => {
    for (const node of parseMarkup(markup)) {
      render(node, container, {})
    }
    binds.forEach((bindPart) => bindPart())
  })
  const root = (container.firstElementChild as HTMLElement | null) ?? container

  const view = {
    /** The first element of the markup, usually the root part. */
    root,
    /** The element of a part, by slot and, for a slot with several parts, its key, like an item's value. */
    part: (slot: SlotName<P>, key?: string) =>
      parts.find(
        (entry) =>
          entry.slot === slot && (key === undefined || entry.key === key)
      )?.el,
    /** The instance's state now. */
    get state() {
      return instance.get() as ReturnType<P>["types"]["state"]
    },
    /** The instance's api, the methods a controller calls. */
    api: instance.api as ReturnType<P>["types"]["api"],
    /** Every change that went through, step by step, with its reason and source. */
    changes,
    /** Changes as `observe` reports them: one per interaction a commit settles. */
    settled,
    /** What screen readers would read, in order. */
    announced,
    /** Presses keys one after another on the focused element, like `"Tab"`, `"Shift+Tab"` or `"Space"`. Tab from elsewhere in the page goes into the markup. */
    keys: (...names: string[]) => keys(doc, names, container),
    /** Types text into the focused element, a key per character. */
    type: (text: string) => type(doc, text),
    /** Clicks an element with a mouse. */
    click,
    /** Drags an element with a mouse onto another, or by a distance. */
    drag,
    /** Moves a mouse onto an element. */
    hover,
    /** Waits for what the primitive scheduled: microtasks, a timer and two frames. */
    settle,
    /** Unbinds every part, destroys the instance and removes the markup. */
    unmount,
  }
  rerenders.set(view, {
    setOptions(patch) {
      current = { ...current, ...patch, id }
      instance.setOptions(current as never)
      syncs.forEach((sync) => sync())
    },
    setProps(slot, key, patch) {
      const entry = parts.find(
        (found) => found.slot === slot && (key === "" || found.key === key)
      )
      if (!entry) {
        throw new Error(`No ${slot} part keyed "${key}" in the markup.`)
      }
      entry.props = { ...entry.props, ...patch }
      entry.rerender(entry.props)
      for (const inner of parts) {
        const taken = inner.inherited.filter(
          (from) => from.slot === slot && from.prop in patch
        )
        if (inner === entry || !taken.length || !entry.el.contains(inner.el)) {
          continue
        }
        for (const from of taken) {
          inner.props = { ...inner.props, [from.key]: patch[from.prop] }
        }
        inner.rerender(inner.props)
      }
      syncs.forEach((sync) => sync())
    },
  })
  return view
}

/** Renders a mount again with new options or slot props, as a framework does after its first render. For this repo's tests. */
const rerenderOf = (mounted: object) => rerenders.get(mounted)!

export { mount, rerenderOf }
