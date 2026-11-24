// A resizable group's state and what it does: panels joining, drags, keys,
// collapsing, saving and the controller. The parts and their attributes are in
// resizable.ts, the pure layout rules in resizable-layout.ts.
import { isRTL } from "../../foundation/platform/env"
import { deriveState } from "../../foundation/kernel/derive"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import type {
  ResizableChangeOptions,
  ResizableHandleProps,
  ResizableLayoutChangeReason,
  ResizableOptions,
} from "./resizable"
import { resizableDom } from "./resizable-dom"
import {
  allHandleBounds,
  carryLayout,
  constraintsOf,
  endDelta,
  fitLayout,
  homeDelta,
  initialLayout,
  isAbsolute,
  isCollapsed,
  keyDelta,
  resizeAt,
  resizePanel,
  sameLayout,
  sameSize,
  toggleTarget,
  toPercent,
  type PanelConstraints,
  type PanelSizes,
  type ResizableSize,
} from "./resizable-layout"
import { loadLayout, saveLayout } from "./resizable-storage"
import { orientationOf } from "../../foundation/focus/collection"
import {
  createChange,
  createCommit,
} from "../../foundation/kernel/input-source"

type State = {
  orientation: "horizontal" | "vertical"
  disabled: boolean
  // Disabled by a fieldset around it.
  formDisabled: boolean
  step: number
  largeStep: number
  // Each panel's size in percent, in panel order. Live: drags write it every
  // frame straight to the panels' styles, without a render.
  layout: number[]
  // The `layout` option, applied once it fits the panels there are.
  controlledLayout: number[] | undefined
  // The panels' ids, in order.
  ids: string[]
  constraints: PanelConstraints[]
  // Which panel each handle follows, by the handle's key.
  handles: Record<string, number>
  // The handle under the pointer, or within its hit area.
  hovering: string | null
  // The handle being dragged.
  dragging: string | null
  // Each panel's size by its id, and what each handle's separator says by
  // the handle's key. Worked out once per layout, so a part can select on its
  // own entry and a move reaches only the parts it changes.
  sizes: Record<string, number>
  handleValues: Record<string, HandleValue>
}

// What a handle's separator says: the panel before it, its size and how far
// it can go, and whether its own `disabled` prop stops it.
type HandleValue = {
  panel: string
  now: number
  min: number
  max: number
  disabled: boolean
}

function settings(options: ResizableOptions) {
  return {
    orientation: orientationOf(options.orientation, "horizontal"),
    disabled: !!options.disabled,
    step: options.step ?? 1,
    largeStep: options.largeStep ?? 10,
  }
}

const sameRecord = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  )
}

const sameConstraints = (
  a: readonly PanelConstraints[],
  b: readonly PanelConstraints[]
) =>
  a.length === b.length &&
  a.every((panel, index) => {
    const other = b[index]
    return (
      sameSize(panel.min, other.min) &&
      sameSize(panel.max, other.max) &&
      sameSize(panel.collapsed, other.collapsed) &&
      panel.collapsible === other.collapsible &&
      panel.initial === other.initial
    )
  })

// Rem sizes follow the root element's font size, never the body's.
const remSize = () =>
  typeof document === "undefined"
    ? 16
    : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

// Every panel's size and handle's value for a state, keeping the values that
// didn't move, so the store notifies only the handles whose value changed.
function shownValues(state: State, locked: readonly boolean[]) {
  const { layout, ids, constraints, handles } = state
  const sizes: Record<string, number> = {}
  const handleValues: Record<string, HandleValue> = {}
  ids.forEach((id, index) => (sizes[id] = layout[index]))
  const bounds =
    layout.length === constraints.length
      ? allHandleBounds(layout, constraints, locked)
      : []
  for (const [key, index] of Object.entries(handles)) {
    const range = bounds[index]
    if (!range) {
      continue
    }
    const before = state.handleValues[key]
    const value = {
      panel: ids[index],
      now: layout[index],
      ...range,
      disabled: !!locked[index],
    }
    handleValues[key] =
      before && sameHandleValue(before, value) ? before : value
  }
  return { sizes, handleValues }
}

// What the shown values are worked out from, and the interactions that read
// the handles' props again.
const shownKeys = [
  "layout",
  "ids",
  "constraints",
  "handles",
  "hovering",
  "dragging",
] as const

const sameHandleValue = (a: HandleValue, b: HandleValue) =>
  a.panel === b.panel &&
  sameSize(a.now, b.now) &&
  sameSize(a.min, b.min) &&
  sameSize(a.max, b.max) &&
  a.disabled === b.disabled

type Drag = {
  handle: number
  key: string
  // Where the drag started. Each move is measured from here, so the result
  // never drifts, and a panel that snapped closed reopens on the way back.
  base: number[]
}

function resizableApiBody(
  context: PrimitiveContext<ResizableOptions, State, string>
) {
  const { store, options } = context
  const change = createChange(context)
  const commit = createCommit(context)
  // The pixels panels share, as last measured.
  let space = 0
  let sizes: PanelSizes[] = []
  let drag: Drag | undefined
  // Keys commit when they come up, so holding one commits once.
  let keys: { start: number[]; event?: KeyboardEvent } | undefined
  // The size each panel had before it last collapsed, by id, for expanding.
  const expanded = new Map<string, number>()
  // The last layout a change asked for. A controlled group gets it back on its
  // next render, which can be after the interaction completes.
  let requested: number[] | undefined

  // Finding panels and handles, measuring and pressing.
  const dom = resizableDom(context, () => api.internal)
  const refresh = dom.refresh

  const current = () => requested ?? store.get().layout
  const isDisabled = () => store.get().disabled || store.get().formDisabled
  const handleDisabled = (key: string) =>
    isDisabled() ||
    !!context.props<ResizableHandleProps>("handle", key)?.disabled
  // Which handles are disabled on their own, by index. Moves from the others
  // stop at them, so the panels past one keep their sizes.
  function locked() {
    const result: boolean[] = []
    for (const [key, index] of Object.entries(store.get().handles)) {
      if (context.props<ResizableHandleProps>("handle", key)?.disabled) {
        result[index] = true
      }
    }
    return result
  }
  const vertical = () => store.get().orientation === "vertical"
  const indexOf = (panel: string | number) =>
    typeof panel === "number" ? panel : store.get().ids.indexOf(panel)

  // Remembers the size of every panel this change collapses.
  function remember(previous: readonly number[], next: readonly number[]) {
    const { ids, constraints } = store.get()
    next.forEach((size, index) => {
      const panel = constraints[index]
      if (
        !panel ||
        !isCollapsed(panel, size) ||
        isCollapsed(panel, previous[index])
      ) {
        return
      }
      const before =
        drag && !isCollapsed(panel, drag.base[index])
          ? drag.base[index]
          : previous[index]
      expanded.set(ids[index], before)
    })
  }

  // Layout functions return a new array whenever anything moved, so a
  // different layout is ours to hand over.
  function request(
    next: readonly number[],
    reason: ResizableLayoutChangeReason,
    event?: Event
  ) {
    const previous = current()
    if (sameLayout(next, previous)) {
      return false
    }
    // A new change drops a completion still waiting for its owner.
    stopWaiting?.()
    // Set first: a handler that passes the layout straight back, like a web
    // component's `layout` attribute, then finds it already applied.
    const before = requested
    requested = next as number[]
    if (!change("layout", next as number[], { reason, event })) {
      requested = before
      return false
    }
    remember(previous, next)
    return true
  }

  function complete(
    start: readonly number[],
    reason: ResizableLayoutChangeReason,
    event?: Event
  ) {
    const layout = current()
    const asked = requested
    // The interaction is over. A controlled group has the layout back by its next one.
    requested = undefined
    if (options().layout === undefined) {
      return finish(start, layout, reason, event)
    }
    // A controlled group completes with what its owner passed back. React can
    // render the last move after the interaction ends, so until the owner has
    // passed back the last layout asked for, it waits for the owner's next
    // one. One that ignored the change completes and saves nothing.
    const applied = store.get().layout
    if (!asked || sameLayout(applied, asked)) {
      return finish(start, applied, reason, event)
    }
    waitForOwner(() => finish(start, store.get().layout, reason, event))
  }

  // Calls back once the owner applies its next layout, or 100 ms without one,
  // so a change it ignored never completes with a later layout of its own.
  let stopWaiting: (() => void) | undefined
  function waitForOwner(done: () => void) {
    stopWaiting?.()
    const before = store.get().layout
    const answer = () => {
      stopWaiting?.()
      done()
    }
    const unsubscribe = store.subscribe(() => {
      if (store.get().layout !== before) {
        answer()
      }
    })
    const timer = setTimeout(answer, 100)
    stopWaiting = () => {
      unsubscribe()
      clearTimeout(timer)
      stopWaiting = undefined
    }
  }

  function finish(
    start: readonly number[],
    layout: readonly number[],
    reason: ResizableLayoutChangeReason,
    event?: Event
  ) {
    if (sameLayout(start, layout)) {
      return
    }
    const { autoSaveId, storage } = options()
    if (autoSaveId !== undefined) {
      saveLayout(autoSaveId, store.get().ids, layout, storage)
    }
    commit("layout", layout.slice(), { reason, event })
  }

  function commitNow(
    next: readonly number[],
    reason: ResizableLayoutChangeReason,
    event?: Event
  ) {
    const start = current()
    if (!request(next, reason, event)) {
      return false
    }
    complete(start, reason, event)
    return true
  }

  // Where a new set of panels starts: the controlled layout, the saved one,
  // the sizes panels that stay had, `defaultLayout`, or each panel's default.
  function startLayout(ids: string[], constraints: PanelConstraints[]) {
    const { layout, defaultLayout, autoSaveId, storage } = options()
    const previous = store.get()
    if (layout?.length === ids.length) {
      return layout
    }
    const saved =
      autoSaveId === undefined
        ? undefined
        : loadLayout(autoSaveId, ids, storage)
    if (saved) {
      return fitLayout(saved, constraints)
    }
    if (previous.ids.length) {
      return carryLayout(previous, ids, constraints)
    }
    if (defaultLayout?.length === ids.length) {
      return fitLayout(defaultLayout, constraints)
    }
    return initialLayout(constraints)
  }

  // Panels joined, left or changed their sizes. Not a change: nobody moved anything.
  function setPanels(
    ids: string[],
    panelSizes: PanelSizes[],
    measured = space
  ) {
    sizes = panelSizes
    if (measured > 0) {
      space = measured
    }
    const rem = remSize()
    const constraints = panelSizes.map((panel) =>
      constraintsOf(panel, space, rem)
    )
    const state = store.get()
    const idsChanged =
      ids.length !== state.ids.length ||
      ids.some((id, index) => id !== state.ids[index])
    if (!idsChanged && sameConstraints(constraints, state.constraints)) {
      return
    }
    // New bounds on the same panels move them like new space does, with the
    // `resize` reason. During a drag the drag's own moves fit them.
    if (!idsChanged) {
      store.set({ constraints })
      if (drag) {
        return
      }
      request(fitLayout(current(), constraints), "resize")
      // No interaction completes this one, so a controlled owner that ignores it leaves nothing asked.
      requested = undefined
      return
    }
    const layout = idsChanged
      ? startLayout(ids, constraints)
      : fitLayout(state.layout, constraints)
    requested = undefined
    store.set({ ids, constraints, layout })
  }

  // The pixels panels share changed. Panels sized in pixels keep their bounds,
  // which moves them, with the `resize` reason.
  function setSpace(next: number) {
    if (sameSize(next, space) || next <= 0) {
      return
    }
    space = next
    if (
      !sizes.some(
        (panel) =>
          isAbsolute(panel.minSize) ||
          isAbsolute(panel.maxSize) ||
          isAbsolute(panel.collapsedSize)
      )
    ) {
      return
    }
    const rem = remSize()
    const constraints = sizes.map((panel) => constraintsOf(panel, space, rem))
    store.set({ constraints })
    if (!drag) {
      request(fitLayout(current(), constraints), "resize")
    }
  }

  const handleIndex = (key: string) => {
    const index = store.get().handles[key]
    return index === undefined ||
      index < 0 ||
      index >= store.get().ids.length - 1
      ? null
      : index
  }

  // `handles` marks the disabled handles a move from a handle stops at. The
  // controller passes none.
  function collapsePanel(
    index: number,
    reason: ResizableLayoutChangeReason,
    event?: Event,
    handles: readonly boolean[] = []
  ) {
    const { constraints } = store.get()
    const layout = current()
    const panel = constraints[index]
    if (!panel?.collapsible || isCollapsed(panel, layout[index])) {
      return false
    }
    const next = resizePanel(
      layout,
      constraints,
      index,
      panel.collapsed,
      1,
      handles
    )
    return isCollapsed(panel, next[index]) && commitNow(next, reason, event)
  }

  function expandPanel(
    index: number,
    reason: ResizableLayoutChangeReason,
    event?: Event,
    handles: readonly boolean[] = []
  ) {
    const { constraints, ids } = store.get()
    const layout = current()
    const panel = constraints[index]
    if (!panel || !isCollapsed(panel, layout[index])) {
      return false
    }
    const target = Math.max(
      panel.min,
      expanded.get(ids[index]) ?? panel.initial ?? panel.min
    )
    const next = resizePanel(layout, constraints, index, target, 1, handles)
    return !isCollapsed(panel, next[index]) && commitNow(next, reason, event)
  }

  function toggle(handle: number, event?: KeyboardEvent | MouseEvent) {
    const target = toggleTarget(store.get().constraints, handle)
    if (target === null) {
      return
    }
    const panel = store.get().constraints[target]
    if (isCollapsed(panel, current()[target])) {
      expandPanel(target, "collapse", event, locked())
    } else {
      collapsePanel(target, "collapse", event, locked())
    }
  }

  // A controlled layout applies once it fits the panels there are, in the
  // same pass as the options that bring it.
  deriveState(context, ["layout"], ({ controlledLayout, layout, ids }) =>
    controlledLayout &&
    controlledLayout.length === ids.length &&
    !sameLayout(controlledLayout, layout)
      ? { layout: controlledLayout }
      : undefined
  )
  // Once it applies, the layout a change asked for is the owner's to keep.
  let applied: number[] | undefined
  store.subscribe(() => {
    const { controlledLayout, layout } = store.get()
    if (
      !controlledLayout ||
      layout !== controlledLayout ||
      applied === controlledLayout
    ) {
      return
    }
    applied = controlledLayout
    requested = undefined
  })
  // What panels and handles show, once per change to what it's worked out
  // from. A handle's `disabled` prop changes without a change here, so a
  // hover or a drag starting reads the locked handles again, as `refresh()`
  // reads the panels' props. This runs before any part hears the change, so
  // parts read it current.
  let shown:
    { from: State; values: Pick<State, "sizes" | "handleValues"> } | undefined
  deriveState(context, ["sizes", "handleValues"], (state) => {
    const from = shown?.from
    if (!from || !shownKeys.every((key) => state[key] === from[key])) {
      shown = { from: state, values: shownValues(state, locked()) }
    }
    return shown!.values
  })

  const api = {
    getLayout: () => current().slice(),
    setLayout(
      layout: number[],
      { reason = "imperative", event }: ResizableChangeOptions = {}
    ) {
      refresh()
      const { constraints } = store.get()
      if (layout.length !== constraints.length) {
        return false
      }
      return commitNow(fitLayout(layout, constraints), reason, event)
    },
    collapse: (
      panel: string | number,
      { reason = "imperative", event }: ResizableChangeOptions = {}
    ) => collapsePanel(indexOf(panel), reason, event),
    expand: (
      panel: string | number,
      { reason = "imperative", event }: ResizableChangeOptions = {}
    ) => expandPanel(indexOf(panel), reason, event),
    resize(
      panel: string | number,
      size: ResizableSize,
      { reason = "imperative", event }: ResizableChangeOptions = {}
    ) {
      refresh()
      const index = indexOf(panel)
      const target = toPercent(size, space, remSize())
      if (index < 0 || index >= current().length || target === undefined) {
        return false
      }
      return commitNow(
        resizePanel(current(), store.get().constraints, index, target),
        reason,
        event
      )
    },
    isCollapsed(panel: string | number) {
      const index = indexOf(panel)
      const constraints = store.get().constraints[index]
      return !!constraints && isCollapsed(constraints, current()[index])
    },
    internal: {
      setPanels,
      setSpace,
      // Which panel each handle follows, by handle key, read from the document.
      setHandles(handles: Record<string, number>) {
        if (!sameRecord(handles, store.get().handles)) {
          store.set({ handles })
        }
      },
      // A handle's `disabled` prop changed, so what the handles show is
      // worked out again.
      relock: () => store.set({ handles: { ...store.get().handles } }),
      handleIndex,
      handleDisabled,
      vertical,
      // A drag from a pointer. Deltas are percent of the space panels share,
      // from where the drag started.
      startDrag(handle: number, key: string) {
        if (isDisabled() || drag) {
          return false
        }
        refresh()
        const base = current().slice()
        drag = { handle, key, base }
        store.set({ dragging: key })
        return true
      },
      dragBy(delta: number, event?: PointerEvent) {
        if (!drag) {
          return
        }
        request(
          resizeAt(
            drag.base,
            store.get().constraints,
            drag.handle,
            delta,
            0.5,
            locked()
          ),
          "drag",
          event
        )
      },
      // `restore` puts back the layout from before the drag, like on Escape.
      endDrag(event?: PointerEvent, restore = false) {
        const ended = drag
        if (!ended) {
          return
        }
        drag = undefined
        store.set({ dragging: null })
        // Bounds or space that changed since the last move fit as part of the
        // drag, once it's over, so this write can't end it a second time.
        request(
          fitLayout(restore ? ended.base : current(), store.get().constraints),
          "drag",
          event
        )
        complete(ended.base, "drag", event)
      },
      keydown(event: KeyboardEvent, key: string, el: HTMLElement) {
        const handle = handleIndex(key)
        if (handle === null || handleDisabled(key)) {
          return
        }
        // Alt, Control and Meta with an arrow belong to the browser and the
        // system, like Alt+ArrowLeft going back. Only Shift changes the step.
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return
        }
        if (event.key === "Enter") {
          event.preventDefault()
          refresh()
          return toggle(handle, event)
        }
        const { constraints, step, largeStep } = store.get()
        const layout = current()
        const delta =
          event.key === "Home"
            ? homeDelta(layout, constraints, handle)
            : event.key === "End"
              ? endDelta(layout, constraints, handle)
              : keyDelta(event.key, {
                  vertical: vertical(),
                  rtl: isRTL(el),
                  step,
                  largeStep,
                  shiftKey: event.shiftKey,
                })
        if (delta === null) {
          return
        }
        event.preventDefault()
        if (!keys) {
          refresh()
        }
        keys ??= { start: current().slice() }
        keys.event = event
        request(
          resizeAt(
            current(),
            store.get().constraints,
            handle,
            delta,
            1,
            locked()
          ),
          "step-key",
          event
        )
      },
      // The key came up, or focus left while it was down, so its keyup goes
      // elsewhere and the last keydown stands for it.
      commitKeys(event?: KeyboardEvent) {
        if (!keys) {
          return
        }
        const { start, event: last } = keys
        keys = undefined
        complete(start, "step-key", event ?? last)
      },
      // A double-click.
      toggle(key: string, event?: KeyboardEvent | MouseEvent) {
        const handle = handleIndex(key)
        if (handle === null || handleDisabled(key)) {
          return
        }
        refresh()
        toggle(handle, event)
      },
      // What a handle's separator says. The same object until it changes.
      handleValue: (key: string) => store.get().handleValues[key] ?? null,
      ...dom.bindings,
    },
  }
  // Disabling mid-drag ends the drag.
  store.subscribe(() => {
    if (!drag || !isDisabled()) {
      return
    }
    dom.stopAll()
    api.internal.endDrag()
  })
  context.onDestroy(() => {
    dom.stopAll()
    stopWaiting?.()
  })

  return api
}

const resizableApi: (
  ...args: Parameters<typeof resizableApiBody>
) => ResizableApi = resizableApiBody

/**
 * `resizable`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface ResizableApi extends ReturnType<typeof resizableApiBody> {}

export { type ResizableApi, resizableApi, settings, type State }
