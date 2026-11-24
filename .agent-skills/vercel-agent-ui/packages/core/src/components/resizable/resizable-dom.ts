// The DOM side of a resizable group: finding its panels and handles in the
// document, measuring the space they share, pointer presses and the cursor.
import { isAfter } from "../../foundation/kernel/order"
import { bindDrag } from "../../foundation/drag-and-drop/pointer"
import { isRTL } from "../../foundation/platform/env"
import type {
  Part,
  PrimitiveContext,
} from "../../foundation/kernel/primitive-types"
import { onProps } from "../../foundation/kernel/part"
import type { ResizableHandleProps, ResizableOptions } from "./resizable"
import type { State } from "./resizable-api"
import {
  refreshCursor,
  registerHandle,
  releaseHandle,
  type HandleTarget,
} from "./resizable-handles"
import type { PanelSizes } from "./resizable-layout"
import { elements } from "../../foundation/kernel/elements"

// What the DOM side needs from the group, read lazily, since the group's api
// is built after this.
type Group = {
  setPanels: (ids: string[], sizes: PanelSizes[], space: number) => void
  setHandles: (handles: Record<string, number>) => void
  relock: () => void
  setSpace: (space: number) => void
  handleIndex: (key: string) => number | null
  handleDisabled: (key: string) => boolean
  vertical: () => boolean
  startDrag: (handle: number, key: string) => boolean
  dragBy: (delta: number, event?: PointerEvent) => void
  endDrag: (event?: PointerEvent, restore?: boolean) => void
  handleValue: (key: string) => { now: number; min: number; max: number } | null
}

const sizeProps = [
  "defaultSize",
  "minSize",
  "maxSize",
  "collapsible",
  "collapsedSize",
] as const

function resizableDom(
  context: PrimitiveContext<ResizableOptions, State, string>,
  group: () => Group
) {
  const { store, element } = context
  // The pixels panels share, as last measured.
  let space = 0

  // The sum of the panels' sizes along the axis, whatever handles and gaps take.
  function spaceOf() {
    const axis = group().vertical() ? "height" : "width"
    let total = 0
    for (const { el } of elements(context, "panel")) {
      total += el.getBoundingClientRect()[axis]
    }
    return total
  }

  function measure() {
    space = spaceOf()
    group().setSpace(space)
  }

  // New bounds and new space are fitted together, so a pixel bound the same
  // render changed never moves a panel by its old value.
  function readPanels() {
    const panels = elements(context, "panel")
    space = spaceOf()
    group().setPanels(
      panels.map((panel) => panel.key),
      panels.map((panel) => (panel.props ?? {}) as PanelSizes),
      space
    )
    return panels
  }

  // Panels' current props, like a new `minSize`, read again before every
  // interaction. The panels are in the order the last reconcile found, so
  // nothing is sorted.
  function refresh() {
    if (!element("panel")) {
      return
    }
    const { ids } = store.get()
    group().setPanels(
      ids,
      ids.map((id) => context.props<PanelSizes>("panel", id) ?? {}),
      space
    )
  }

  // Panels and handles in document order, a microtask after any of them
  // binds, so one commit reconciles once.
  function reconcile() {
    const panels = readPanels()
    // Both lists are in document order, so one pass pairs each handle with
    // the last panel before it.
    const handles: Record<string, number> = {}
    let before = -1
    for (const { el, key } of elements(context, "handle")) {
      while (before + 1 < panels.length && isAfter(panels[before + 1].el, el)) {
        before++
      }
      handles[key] = before
    }
    group().setHandles(handles)
  }

  let scheduled = false
  function schedule() {
    if (scheduled) {
      return
    }
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      reconcile()
    })
  }

  // A press from the page's handle hit areas. The space is measured once, so
  // moves never read layout.
  function press(
    event: PointerEvent,
    key: string,
    el: HTMLElement,
    release: () => void
  ) {
    const handle = group().handleIndex(key)
    if (handle === null) {
      return
    }
    measure()
    if (!space || !group().startDrag(handle, key)) {
      return release()
    }
    const rtl = isRTL(element("root") ?? el)
    const vertical = group().vertical()
    const origin = vertical ? event.clientY : event.clientX
    const stop = bindDrag(el, event, {
      cancelOnEscape: true,
      onMove: (sample) => {
        const moved = (vertical ? sample.y : sample.x) - origin
        group().dragBy(
          ((rtl && !vertical ? -moved : moved) / space) * 100,
          sample.event
        )
        refreshCursor(el.ownerDocument)
      },
      onEnd: (end, canceled) => {
        drags.delete(key)
        // Escape cancels with the last move. The browser taking the pointer keeps the layout.
        group().endDrag(end, canceled && end.type !== "pointercancel")
        release()
      },
    })
    drags.set(key, () => {
      stop()
      release()
    })
  }
  // Each handle's running drag, so a handle leaving the page ends its own.
  const drags = new Map<string, () => void>()

  // The axis, or at a limit the one way the handle can go.
  function cursor(key: string, el: HTMLElement) {
    const value = group().handleValue(key)
    const vertical = group().vertical()
    const both = vertical ? "ns-resize" : "ew-resize"
    if (!value) {
      return both
    }
    const atMin = value.now <= value.min + 1e-6
    const atMax = value.now >= value.max - 1e-6
    if (atMin === atMax) {
      return both
    }
    if (vertical) {
      return atMin ? "s-resize" : "n-resize"
    }
    return atMin !== isRTL(el) ? "e-resize" : "w-resize"
  }

  const bindings = {
    bindRoot(el: HTMLElement) {
      schedule()
      if (typeof ResizeObserver === "undefined") {
        return
      }
      // Resizing panels inside the observer's callback would resize nested
      // groups in the same frame, which browsers report as a loop error.
      const view = el.ownerDocument.defaultView ?? window
      let frame = 0
      const observer = new ResizeObserver(() => {
        frame ||= view.requestAnimationFrame(() => {
          frame = 0
          measure()
        })
      })
      observer.observe(el)
      return () => {
        observer.disconnect()
        view.cancelAnimationFrame(frame)
      }
    },
    bindPanel(part: Part) {
      schedule()
      // New size props, like a larger `minSize`, apply as the panel renders them.
      let sizes = part.props as PanelSizes
      const unwatch = onProps(part, () => {
        const next = part.props as PanelSizes
        if (sizeProps.every((name) => next[name] === sizes[name])) {
          return
        }
        sizes = next
        schedule()
      })
      return () => {
        unwatch()
        schedule()
      }
    },
    bindHandle(el: HTMLElement, part: Part) {
      const key = part.key
      schedule()
      const target: HandleTarget = {
        el,
        root: () => element("root"),
        axis: () =>
          group().handleDisabled(key) || group().handleIndex(key) === null
            ? null
            : group().vertical()
              ? "y"
              : "x",
        cursor: () => cursor(key, el),
        start: (event) => press(event, key, el, () => releaseHandle(target)),
        hover: (hovered) => {
          if (hovered) {
            store.set({ hovering: key })
          } else if (store.get().hovering === key) {
            store.set({ hovering: null })
          }
        },
      }
      const unregister = registerHandle(target)
      let disabled = !!(part.props as ResizableHandleProps).disabled
      const unwatch = onProps(part, () => {
        const next = !!(part.props as ResizableHandleProps).disabled
        if (next !== disabled) {
          disabled = next
          group().relock()
        }
        const stop = drags.get(key)
        if (!stop || !disabled) {
          return
        }
        drags.delete(key)
        stop()
        group().endDrag()
      })
      return () => {
        unwatch()
        unregister()
        const stop = drags.get(key)
        drags.delete(key)
        if (stop && store.get().dragging === key) {
          stop()
          group().endDrag()
        }
        schedule()
      }
    },
  }

  // Stops the pointer tracking of a drag that ends some other way, like the
  // group being disabled or leaving the page.
  const stopAll = () => {
    for (const stop of drags.values()) {
      stop()
    }
    drags.clear()
  }

  return { refresh, bindings, stopAll }
}

export { resizableDom }
