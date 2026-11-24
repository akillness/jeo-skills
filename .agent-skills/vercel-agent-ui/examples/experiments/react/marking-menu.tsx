import * as React from "react"
import {
  announce,
  bindDrag,
  bindLayer,
  createChange,
  createRovingFocus,
  createTypeahead,
  css,
  definePrimitive,
  dispatch,
  isTypeaheadKey,
  labelOf,
  live,
  selects,
  spatialMove,
  type ChangeDetails,
} from "@ui-sdk/core"
import { createVelocityTracker, sectorOf } from "@ui-sdk/core/gesture"
import { createParts } from "@ui-sdk/react/primitive"

function sectorPoint(index: number, count: number, radius: number, start = 0) {
  const angle = (index / Math.max(count, 1) + start) * 2 * Math.PI
  return {
    x: Math.round(Math.sin(angle) * radius),
    y: Math.round(-Math.cos(angle) * radius),
  }
}

type MarkingMenuItemData = { value: string; label: string; disabled?: boolean }

type MarkingMenuMode = "idle" | "holding" | "marking" | "menu"

type MarkingMenuState = {
  open: boolean
  items: MarkingMenuItemData[]
  radius: number
  origin: { x: number; y: number }
  mode: MarkingMenuMode
  highlighted: string | null
  stroke: { dx: number; dy: number }
  focused: string | null
}

type MarkingMenuOpenChangeReason =
  | "trigger-press"
  | "item-press"
  | "mark"
  | "escape-key"
  | "outside-press"
  | "window-blur"
  | "imperative"
type MarkingMenuActionReason = "item-press" | "mark"

type MarkingMenuOptions = {
  items: MarkingMenuItemData[]
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (
    open: boolean,
    details: ChangeDetails<MarkingMenuOpenChangeReason>
  ) => void
  onAction?: (
    value: string,
    details: ChangeDetails<MarkingMenuActionReason>
  ) => void
  radius?: number
  delay?: number
}

type MarkingMenuSurfaceState = { mode: MarkingMenuMode; open: boolean }
type MarkingMenuStrokeState = { mode: MarkingMenuMode }
type MarkingMenuItemState = { disabled: boolean }

const deadZone = 18
const markLength = 40
const markSpeed = 0.6

function wedgeOf(
  items: readonly MarkingMenuItemData[],
  dx: number,
  dy: number
) {
  const item = items[sectorOf(dx, dy, items.length, { deadZone })]
  return item && !item.disabled ? item.value : null
}

const markingMenu = /* @__PURE__ */ definePrimitive({
  name: "marking-menu",
  options: {
    items: "value",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onAction: "callback",
    radius: "number",
    delay: "number",
  },
  state: (options: MarkingMenuOptions): MarkingMenuState => ({
    open: options.open ?? options.defaultOpen ?? false,
    items: options.items,
    radius: options.radius ?? 84,
    origin: { x: 0, y: 0 },
    mode: "idle",
    highlighted: null,
    stroke: { dx: 0, dy: 0 },
    focused: null,
  }),
  sync: (options) => ({
    items: options.items,
    radius: options.radius ?? 84,
    ...(options.open === undefined ? {} : { open: options.open }),
  }),
  live: ["highlighted", "stroke"],
  api: (context) => {
    const { store, options, onDestroy } = context
    const change = createChange(context)
    const typeahead = createTypeahead()
    const roving = createRovingFocus<MarkingMenuState, { value: string }>(
      context,
      {
        slot: "item",
        key: "focused",
        remember: false,
        move: spatialMove(),
        disabled: (item) =>
          !!store.get().items.find((entry) => entry.value === item.key)
            ?.disabled,
      }
    )
    const vx = createVelocityTracker()
    const vy = createVelocityTracker()
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopDrag: (() => void) | undefined
    let opener: HTMLElement | null = null
    onDestroy(() => {
      clearTimeout(timer)
      stopDrag?.()
    })
    const labelFor = (value: string) =>
      store.get().items.find((item) => item.value === value)?.label ?? value
    const reset = () =>
      store.set({ mode: "idle", highlighted: null, stroke: { dx: 0, dy: 0 } })

    const api = {
      roving,
      openAt(
        x: number,
        y: number,
        details: { reason: "trigger-press" | "imperative"; event?: Event } = {
          reason: "imperative",
        }
      ) {
        store.set({
          origin: { x, y },
          mode: "menu",
          highlighted: null,
          stroke: { dx: 0, dy: 0 },
        })
        if (!change("open", true, details)) {
          reset()
        }
      },
      close(
        details: { reason: MarkingMenuOpenChangeReason; event?: Event } = {
          reason: "imperative",
        }
      ) {
        clearTimeout(timer)
        reset()
        if (store.get().open) {
          change("open", false, details)
        }
        if (
          details.reason !== "outside-press" &&
          details.reason !== "window-blur"
        ) {
          opener?.focus({ preventScroll: true })
        }
      },
      select(
        value: string,
        details: { reason: MarkingMenuActionReason; event?: Event } = {
          reason: "item-press",
        }
      ) {
        if (store.get().items.find((item) => item.value === value)?.disabled) {
          return
        }
        if (dispatch(context, "onAction", value, details)) {
          return
        }
        if (details.reason === "mark") {
          announce(labelFor(value))
        }
        api.close(details)
      },
      surfacePointerdown(event: PointerEvent, el: HTMLElement) {
        if (event.button !== 0 || store.get().open) {
          return
        }
        event.preventDefault()
        opener = el
        vx.reset()
        vy.reset()
        store.set({
          origin: { x: event.clientX, y: event.clientY },
          mode: "holding",
          highlighted: null,
          stroke: { dx: 0, dy: 0 },
        })
        timer = setTimeout(() => {
          if (store.get().mode !== "holding") {
            return
          }
          store.set({ mode: "menu" })
          change("open", true, { reason: "trigger-press", event })
        }, options().delay ?? 250)
        stopDrag = bindDrag(el, event, {
          onMove: ({ x, y, event: move }) => {
            const { origin, mode, items } = store.get()
            const dx = x - origin.x
            const dy = y - origin.y
            vx.add(move.timeStamp, x)
            vy.add(move.timeStamp, y)
            const speed = Math.hypot(
              vx.velocity(move.timeStamp),
              vy.velocity(move.timeStamp)
            )
            if (
              mode === "holding" &&
              Math.hypot(dx, dy) > deadZone &&
              (Math.hypot(dx, dy) > markLength || speed > markSpeed)
            ) {
              clearTimeout(timer)
              store.set({ mode: "marking" })
            }
            store.set({
              stroke: { dx, dy },
              highlighted: wedgeOf(items, dx, dy),
            })
          },
          onEnd: (end, canceled) => {
            clearTimeout(timer)
            const { mode, highlighted } = store.get()
            if (canceled || !highlighted) {
              if (mode === "menu") {
                store.set({ stroke: { dx: 0, dy: 0 } })
              } else {
                reset()
              }
              return
            }
            api.select(highlighted, {
              reason: mode === "marking" ? "mark" : "item-press",
              event: end,
            })
          },
        })
      },
      surfaceKeydown(event: KeyboardEvent, el: HTMLElement) {
        if (
          event.key !== "ContextMenu" &&
          !(event.key === "F10" && event.shiftKey) &&
          event.key !== "Enter"
        ) {
          return
        }
        event.preventDefault()
        opener = el
        const box = el.getBoundingClientRect()
        api.openAt(box.left + box.width / 2, box.top + box.height / 2, {
          reason: "trigger-press",
          event,
        })
      },
      itemKeydown(event: KeyboardEvent, el: HTMLElement, value: string) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          api.select(value, { reason: "item-press", event })
        } else if (event.key === "Tab") {
          event.preventDefault()
        } else if (isTypeaheadKey(event)) {
          const items = roving.items()
          const index = typeahead(
            event.key,
            items.map((item) => labelOf(item.el)),
            items.findIndex((item) => item.el === el)
          )
          if (index !== -1) {
            items[index].el.focus()
          }
        } else {
          roving.keydown(event, el)
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    surface: slot<{}, MarkingMenuSurfaceState>({
      state: (state) => ({ mode: state.mode, open: state.open }),
      attrs: (state) => ({
        tabindex: "0",
        "aria-haspopup": "menu",
        "aria-expanded": String(state.open),
        "data-mode": state.mode,
        style: css({
          "touch-action": "none",
          "user-select": "none",
          "-webkit-user-select": "none",
        }),
      }),
      on: {
        pointerdown: (event, { el, api }) =>
          el && api.surfacePointerdown(event, el),
        keydown: (event, { el, api }) => el && api.surfaceKeydown(event, el),
        contextmenu: (event) => event.preventDefault(),
      },
    }),
    stroke: slot<{}, MarkingMenuStrokeState>({
      present: (state) => state.mode !== "idle",
      state: (state) => ({ mode: state.mode }),
      attrs: (state) => ({
        "aria-hidden": "true",
        "data-mode": state.mode,
        style: css({
          position: "fixed",
          left: `${state.origin.x}px`,
          top: `${state.origin.y}px`,
          "pointer-events": "none",
        }),
      }),
      live: live<MarkingMenuState, any, {}>((state) => ({
        style: css({
          "--stroke-length": `${Math.round(Math.hypot(state.stroke.dx, state.stroke.dy))}px`,
          "--stroke-angle": `${Math.atan2(state.stroke.dy, state.stroke.dx)}rad`,
        }),
      })),
    }),
    ring: slot({
      present: (state) => state.open && state.mode === "menu",
      attrs: (state) => ({
        role: "menu",
        "aria-label": "Actions",
        style: css({
          position: "fixed",
          inset: "auto",
          left: `${state.origin.x}px`,
          top: `${state.origin.y}px`,
          margin: 0,
          padding: 0,
          border: 0,
          background: "transparent",
          overflow: "visible",
          "--ring-radius": `${state.radius}px`,
        }),
      }),
      bind: (el, { api }) => {
        requestAnimationFrame(() => api.roving.focus())
        return bindLayer(el, {
          topLayer: true,
          onDismiss: (reason, event) => api.close({ reason, event }),
        })
      },
    }),
    item: slot<{ value: string }, MarkingMenuItemState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key }) => ({
        disabled: !!state.items.find((item) => item.value === key)?.disabled,
      }),
      attrs: (state, part) => {
        const at = sectorPoint(
          state.items.findIndex((item) => item.value === part.key),
          state.items.length,
          state.radius
        )
        const disabled = !!state.items.find((item) => item.value === part.key)
          ?.disabled
        return {
          role: "menuitem",
          tabindex: part.api.roving.tabIndex(state, part),
          "aria-disabled": disabled ? "true" : undefined,
          "data-disabled": disabled ? "" : undefined,
          style: css({
            position: "absolute",
            left: `${at.x}px`,
            top: `${at.y}px`,
            "--item-x": `${at.x}px`,
            "--item-y": `${at.y}px`,
          }),
        }
      },
      live: live<MarkingMenuState, any, { value: string }>(
        (state, { key }) => ({
          "data-highlighted": state.highlighted === key ? "" : undefined,
        })
      ),
      on: {
        keydown: (event, { el, api, key }) =>
          el && api.itemKeydown(event, el, key),
        click: (event, { api, key }) =>
          api.select(key, { reason: "item-press", event }),
      },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
  }),
})

const parts = createParts(markingMenu, {
  surface: "div",
  stroke: "div",
  ring: "div",
  item: "div",
})

const MarkingMenu = parts.Root

const MarkingMenuSurface = parts.Surface

const MarkingMenuStroke = parts.Stroke

const MarkingMenuRing = parts.Ring

const MarkingMenuItem = parts.Item

const items = [
  { value: "reply", label: "Reply" },
  { value: "archive", label: "Archive" },
  { value: "snooze", label: "Snooze" },
  { value: "label", label: "Label" },
  { value: "delete", label: "Delete" },
  { value: "flag", label: "Flag" },
]

function Example() {
  const [last, setLast] = React.useState<string | null>(null)
  return (
    <MarkingMenu
      items={items}
      onAction={(value, details) =>
        setLast(
          `${items.find((item) => item.value === value)?.label} (${details.reason === "mark" ? "flick" : "ring"})`
        )
      }
    >
      <div data-slot="stack">
        <MarkingMenuSurface aria-label="Message, press and hold for actions">
          <span>Design review moved to Thursday</span>
          <span data-slot="hint">
            Press and hold here, then move toward an action. Or flick: a quick
            stroke runs it without the ring.
          </span>
        </MarkingMenuSurface>
        <p data-slot="hint" aria-live="polite">
          {last
            ? `Ran ${last}`
            : "Enter or Shift+F10 opens the ring from the keyboard."}
        </p>
        <MarkingMenuStroke>
          <span />
        </MarkingMenuStroke>
        <MarkingMenuRing>
          <span aria-hidden="true" />
          {items.map((item) => (
            <MarkingMenuItem key={item.value} value={item.value}>
              {item.label}
            </MarkingMenuItem>
          ))}
        </MarkingMenuRing>
      </div>
    </MarkingMenu>
  )
}

export {
  Example,
  markingMenu,
  MarkingMenu,
  type MarkingMenuActionReason,
  MarkingMenuItem,
  type MarkingMenuItemState,
  type MarkingMenuItemData,
  type MarkingMenuMode,
  type MarkingMenuOpenChangeReason,
  type MarkingMenuOptions,
  MarkingMenuRing,
  MarkingMenuStroke,
  type MarkingMenuStrokeState,
  MarkingMenuSurface,
  type MarkingMenuSurfaceState,
}
