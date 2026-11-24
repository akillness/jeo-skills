import * as React from "react"
import {
  bindDrag,
  createChange,
  definePrimitive,
  dragThreshold,
  type ChangeDetails,
} from "@ui-sdk/core"
import { scrubTo } from "@ui-sdk/core/number"
import { createParts } from "@ui-sdk/react/primitive"

type SidebarState = {
  width: number
  opened: number
  draft: number | null
  landing: number | null
}

type SidebarOptions = {
  defaultWidth?: number
  onWidthChange?: (
    width: number,
    details: ChangeDetails<"drag" | "keyboard">
  ) => void
}

const minWidth = 160
const maxWidth = 280

const collapse = {
  min: 0,
  max: minWidth,
  step: 1,
  snap: { points: [0, minWidth], threshold: minWidth / 2 },
}

const widthAt = (pointer: number) =>
  pointer >= minWidth
    ? { value: Math.min(maxWidth, Math.round(pointer)), point: undefined }
    : scrubTo(pointer, collapse, { ease: true })

const sidebar = definePrimitive({
  name: "sidebar",
  options: { defaultWidth: "number", onWidthChange: "callback" },
  state: (options: SidebarOptions): SidebarState => ({
    width: options.defaultWidth ?? 200,
    opened: options.defaultWidth || 200,
    draft: null,
    landing: null,
  }),
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const resize = (
      width: number,
      reason: "drag" | "keyboard",
      event: Event
    ) => {
      if (width) {
        store.set({ opened: width })
      }
      change("width", width, { reason, event })
    }
    let stop: (() => void) | undefined
    context.onDestroy(() => stop?.())
    return {
      pointerdown(event: PointerEvent, el: HTMLElement) {
        const root = el.parentElement
        if (event.button !== 0 || !root) {
          return
        }
        stop?.()
        stop = bindDrag(el, event, {
          threshold: dragThreshold,
          cancelOnEscape: true,
          onMove: ({ x }) => {
            const { value, point } = widthAt(
              x - root.getBoundingClientRect().left
            )
            store.set({ draft: value, landing: point ?? null })
          },
          onEnd: (end, canceled) => {
            const { draft, landing } = store.get()
            stop = undefined
            store.set({ draft: null, landing: null })
            if (!canceled && draft !== null) {
              resize(landing ?? draft, "drag", end)
            }
          },
        })
      },
      keydown(event: KeyboardEvent) {
        const { width, opened } = store.get()
        const next =
          event.key === "Enter"
            ? width
              ? 0
              : opened
            : event.key === "ArrowLeft"
              ? width - 16 < minWidth
                ? 0
                : width - 16
              : event.key === "ArrowRight"
                ? width
                  ? Math.min(maxWidth, width + 16)
                  : minWidth
                : undefined
        if (next === undefined) {
          return
        }
        event.preventDefault()
        resize(next, "keyboard", event)
      },
    }
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => {
        const width = state.draft ?? state.width
        return {
          style: `--sidebar:${width}px`,
          "data-collapsed": width === 0 ? "" : undefined,
          "data-dragging": state.draft !== null ? "" : undefined,
          "data-landing":
            state.landing === null
              ? undefined
              : state.landing
                ? "open"
                : "collapsed",
        }
      },
    }),
    divider: slot({
      attrs: (state) => {
        const width = state.draft ?? state.width
        return {
          role: "separator",
          tabindex: "0",
          "aria-orientation": "vertical",
          "aria-valuenow": String(Math.round(width)),
          "aria-valuemin": "0",
          "aria-valuemax": String(maxWidth),
          "aria-valuetext": width ? `${Math.round(width)} pixels` : "Collapsed",
          style: "touch-action:none",
        }
      },
      on: {
        pointerdown: (event, { el, api }) => api.pointerdown(event, el!),
        keydown: (event, { api }) => api.keydown(event),
      },
    }),
  }),
})

const parts = createParts(sidebar, { root: "div", divider: "div" })

const Sidebar = parts.Root

const SidebarDivider = parts.Divider

function Example() {
  return (
    <Sidebar defaultWidth={160}>
      <nav aria-label="Files" data-slot="sidebar-nav">
        <ul>
          {["README.md", "package.json", "src", "tests"].map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      </nav>
      <SidebarDivider aria-label="Resize sidebar" />
      <div data-slot="sidebar-hint">
        <span data-show="open">Drag the divider left to collapse</span>
        <span data-show="collapsed">Drag right a bit to open</span>
        <span data-show="landing-collapsed">Release to collapse</span>
        <span data-show="landing-open">Release to open at {minWidth}px</span>
      </div>
    </Sidebar>
  )
}

export { Example }
