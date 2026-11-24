import {
  createChange,
  createReorder,
  createRovingFocus,
  createSelection,
  css,
  definePrimitive,
  dragThreshold,
  matchesShortcut,
  selects,
  spatialMove,
  type ChangeDetails,
  type ReorderDraft,
  type ReorderOrientation,
  type ReorderReason,
} from "@ui-sdk/core"
import { createFlip } from "./flip"

type SortableSelectedChangeReason =
  "item-press" | "list-navigation" | "escape-key"

type SortableOptions = {
  value?: string[]
  defaultValue?: string[]
  onValueChange?: (
    value: string[],
    details: ChangeDetails<ReorderReason>
  ) => void
  selected?: string[]
  defaultSelected?: string[]
  onSelectedChange?: (
    selected: string[],
    details: ChangeDetails<SortableSelectedChangeReason>
  ) => void
  orientation?: ReorderOrientation
}

type SortableState = {
  value: string[]
  selected: string[]
  focused: string | null
  moving: ReorderDraft | null
  orientation: ReorderOrientation
  handled: string[]
}

type SortableRootState = {
  order: string[]
  moving: boolean
  selected: number
}
type SortableItemState = {
  selected: boolean
  moving: boolean
  dragging: boolean
}
type SortableHandleState = { dragging: boolean }

const sortable = /* @__PURE__ */ definePrimitive({
  name: "sortable",
  options: {
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    selected: "list",
    defaultSelected: "list",
    onSelectedChange: "callback",
    orientation: "string",
  },
  state: (options: SortableOptions): SortableState => ({
    value: options.value ?? options.defaultValue ?? [],
    selected: options.selected ?? options.defaultSelected ?? [],
    focused: null,
    moving: null,
    orientation: options.orientation ?? "vertical",
    handled: [],
  }),
  sync: (options) => ({
    orientation: options.orientation ?? "vertical",
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.selected === undefined ? {} : { selected: options.selected }),
  }),
  controlled: ["value", "selected"],
  api: (context) => {
    const { store } = context
    const change = createChange(context)
    const orientation = () => store.get().orientation
    const spatial = spatialMove()
    const roving = createRovingFocus<SortableState, { value: string }>(
      context,
      {
        slot: "item",
        key: "focused",
        orientation: () =>
          orientation() === "horizontal" ? "horizontal" : "vertical",
        move: spatial,
      }
    )
    const selection = createSelection(context, {
      key: "selected",
      set: (value, details) => change("selected", value, details),
      order: () => store.get().value,
      multiple: () => true,
    })
    const reorder = createReorder<SortableState>(context, {
      slot: "item",
      key: "value",
      draft: "moving",
      set: (value, details) => change("value", value, details),
      orientation,
      group: (key) =>
        store.get().selected.includes(key) ? store.get().selected : [key],
      preview: true,
    })
    const flip = createFlip<SortableState>(context, {
      watch: (state) => reorder.order(state),
    })
    let down: { key: string; x: number; y: number } | null = null

    const api = {
      roving,
      reorder,
      flip,
      move: (key: string, index: number) => reorder.move(key, index),
      bindHandle(key: string) {
        store.set({ handled: [...store.get().handled, key] })
        return () =>
          store.set({ handled: store.get().handled.filter((k) => k !== key) })
      },
      itemKeydown(event: KeyboardEvent, el: HTMLElement, key: string) {
        if (reorder.keydown(event, key)) {
          return
        }
        if (matchesShortcut(event, "mod+a")) {
          event.preventDefault()
          selection.toggleAll({ reason: "list-navigation", event })
        } else if (event.key === "Escape" && store.get().selected.length) {
          change("selected", [], { reason: "escape-key", event })
        } else {
          const moved = roving.keydown(event, el)
          if (moved?.shift) {
            selection.extend(moved.key, {
              reason: "list-navigation",
              event,
              from: moved.from,
            })
          }
        }
      },
      press(event: PointerEvent, key: string) {
        down = null
        if (event.button !== 0) {
          return
        }
        if (event.shiftKey) {
          selection.extend(key, {
            reason: "item-press",
            event,
            from: store.get().focused,
          })
        } else if (event.metaKey || event.ctrlKey) {
          selection.toggle(key, { reason: "item-press", event })
        } else if (!store.get().selected.includes(key)) {
          selection.choose(key, { reason: "item-press", event })
        } else {
          down = { key, x: event.clientX, y: event.clientY }
        }
        if (!store.get().handled.includes(key)) {
          reorder.pointerdown(event, key)
        }
      },
      click(event: MouseEvent, key: string) {
        const pressed = down
        down = null
        if (pressed?.key !== key) {
          return
        }
        if (
          Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) <
          dragThreshold
        ) {
          selection.choose(key, { reason: "item-press", event })
        }
      },
    }
    return api
  },
  slots: (slot) => ({
    root: slot<{}, SortableRootState>({
      state: (state, { api }) => ({
        order: api.reorder.order(state),
        moving: !!state.moving,
        selected: state.selected.length,
      }),
      attrs: (state, { id }) => ({
        role: "listbox",
        "aria-multiselectable": "true",
        "aria-orientation":
          state.orientation === "horizontal" ? "horizontal" : undefined,
        "aria-describedby": `${id}-instructions`,
        "data-orientation": state.orientation,
        "data-moving": state.moving ? "" : undefined,
      }),
    }),
    item: slot<{ value: string }, SortableItemState>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key, api }) => ({
        selected: state.selected.includes(key),
        moving: api.reorder.moving(state, key),
        dragging: api.reorder.dragging(state, key),
      }),
      attrs: (state, part) => ({
        role: "option",
        "aria-selected": state.selected.includes(part.key) ? "true" : "false",
        tabindex: part.api.roving.tabIndex(state, part),
        "data-selected": state.selected.includes(part.key) ? "" : undefined,
        "data-moving": part.api.reorder.moving(state, part.key)
          ? ""
          : undefined,
        "data-dragging": part.api.reorder.dragging(state, part.key)
          ? ""
          : undefined,
        style: state.handled.includes(part.key)
          ? undefined
          : css({ "touch-action": "none" }),
      }),
      on: {
        keydown: (event, { el, api, key }) =>
          el && api.itemKeydown(event, el, key),
        pointerdown: (event, { api, key }) => api.press(event, key),
        click: (event, { api, key }) => api.click(event, key),
      },
      bind: (el, part) => {
        const cleanups = [
          part.api.roving.bind(el, part),
          part.api.reorder.bind(el, part),
          part.api.flip.bind(el, part.key),
        ]
        return () => cleanups.forEach((cleanup) => cleanup?.())
      },
    }),
    handle: slot<{ value?: string }, SortableHandleState>({
      props: { value: { kind: "string", from: "item" } },
      state: (state, { key, api }) => ({
        dragging: api.reorder.dragging(state, key),
      }),
      attrs: () => ({
        "aria-hidden": "true",
        style: css({ "touch-action": "none" }),
      }),
      on: {
        pointerdown: (event, { api, key }) =>
          api.reorder.pointerdown(event, key),
      },
      bind: (_el, { api, key }) => api.bindHandle(key),
    }),
    instructions: slot({
      attrs: (_state, { id }) => ({ id: `${id}-instructions`, hidden: "" }),
    }),
  }),
})

export {
  sortable,
  type SortableHandleState,
  type SortableItemState,
  type SortableOptions,
  type SortableRootState,
  type SortableSelectedChangeReason,
}
