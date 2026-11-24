// The Drawer's state and API: Dialog's api plus the sheet. It keeps the
// snap point, modality and drag state, tells the sheet where to go, and hears
// back through `events` from `attachSheet`.
import { dev, warn } from "#dev"
import { dialogApi, type DialogState } from "../dialog/dialog-api"
import type { DialogSharedOptions } from "../dialog/dialog"
import {
  attachSheet,
  isDragSurface,
  parentSheet,
  prepareSheet,
  sheetLayers,
  type Sheet,
  type SheetOutlet,
} from "../../foundation/popups/sheet"
import type { PhysicalSide } from "../../foundation/platform/sides"
import type {
  DrawerOptions,
  DrawerOutletProps,
  DrawerSnapPointChangeReason,
} from "./drawer"
import {
  findSnapIndex,
  isAtOrBelow,
  type ResolvedSnapPoint,
  type SnapPoint,
} from "../../foundation/motion/snap-points"
import type { ChangeOptions } from "../../foundation/kernel/details"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import { sameValue } from "../../foundation/kernel/store"
import { deriveFromOptions, deriveState } from "../../foundation/kernel/derive"
import { createChange } from "../../foundation/kernel/input-source"
import { drawerPreset } from "../../foundation/popups/popup-presets"
import { whenKept } from "../../foundation/kernel/keep"

type DrawerState = DialogState & {
  snapPoint: SnapPoint | null
  dragging: boolean
  interactive: boolean
  modalSetting: boolean | "trap-focus"
  side: PhysicalSide
  snapIndex: number
  snapCount: number
}

// The first snap point, which a drawer opens at unless told otherwise.
function defaultSnap(options: DrawerOptions) {
  return options.defaultSnapPoint ?? options.snapPoints?.[0] ?? "content"
}

// Before the sheet is measured, whether a snap point is at or below
// `modalAbove`, by their order in `snapPoints`, which is ascending in practice.
function interactiveByOrder(options: DrawerOptions, point: SnapPoint | null) {
  if (options.modalAbove === undefined || point === null) {
    return false
  }
  const points = options.snapPoints ?? ["content"]
  const above = points.findIndex((entry) =>
    sameValue(entry, options.modalAbove)
  )
  const index = points.findIndex((entry) => sameValue(entry, point))
  return above >= 0 && index >= 0 && index <= above
}

// A scroll-snap sheet moves by the browser's own scrolling, so a touch on the
// handle has to pan it. The pointer driver tracks the touch itself.
const handleTouchAction = (handle: Element) =>
  handle.closest("[data-driver]")?.getAttribute("data-driver") === "scroll-snap"
    ? "pan-y"
    : "none"

// What a sheet reads only as it attaches: `"auto"` picks its driver from the rest.
const shapeOf = (options: DrawerOptions) =>
  [
    options.side ?? "bottom",
    options.driver ?? "auto",
    !!options.preventEdgeSwipe,
    options.driver === undefined || options.driver === "auto"
      ? [options.modalAbove === undefined, options.expandOnScroll !== false]
      : [],
  ].join()

/**
 * The snap point a handle moves to. `"cycle"` goes to the next larger one and
 * wraps to the smallest, like iOS's grabber; `"expand"` and `"collapse"` step
 * once without wrapping; `"first"` and `"last"` jump to the ends.
 */
function stepSnapIndex(
  index: number,
  count: number,
  action: "cycle" | "expand" | "collapse" | "first" | "last"
) {
  if (count === 0) {
    return -1
  }
  if (action === "first") {
    return 0
  }
  if (action === "last") {
    return count - 1
  }
  if (action === "cycle") {
    return (index + 1) % count
  }
  if (action === "expand") {
    return Math.min(count - 1, index + 1)
  }
  return Math.max(0, index - 1)
}

function drawerApiBody(
  context: PrimitiveContext<DrawerOptions, DrawerState, string>
) {
  const { store, options } = context
  const change = createChange(context)
  // The sheet this drawer opened from, which it pushes back while open.
  let stackedOn: (() => Sheet | undefined) | undefined
  // The snap points the sheet resolved, ascending, for the handle and Android's back.
  let resolved: readonly ResolvedSnapPoint[] = []
  // Outlets on the page, each reading its latest keyframes, so moving the
  // drawer allocates nothing.
  let outlets: SheetOutlet[] = []
  // What moves the sheet, while the content is bound.
  let sheet: Sheet | undefined
  whenKept(prepareSheet)

  // Drawer options are Dialog's, with a wider `onDismissAttempt` that accepts every dialog reason.
  const dialog = dialogApi(
    context as unknown as PrimitiveContext<
      DialogSharedOptions,
      DialogState,
      string
    >,
    false,
    {
      preset: drawerPreset,
      // The popup layer shows the content: the sheet rises, unless it's open from the start.
      onShow(layer) {
        sheetLayers.set(layer, () => sheet)
        stackedOn = parentSheet(layer)
        // Web components can show content again as it unmounts; a closed drawer stays closed.
        if (store.get().open) {
          sheet?.open(popup.opener() !== "initial")
        }
        return () => sheetLayers.delete(layer)
      },
      onOpenChange(open) {
        if (!open) {
          sheet?.close()
        }
      },
      // Android's back steps the drawer down a snap point before it closes it.
      intercept(reason, event) {
        if (reason !== "back") {
          return false
        }
        const index = findSnapIndex(resolved, store.get().snapPoint)
        if (index <= 0) {
          return false
        }
        snapTo(resolved[index - 1].value, "back", event)
        return true
      },
      onRefuse: () => sheet?.nudge(),
    }
  )
  const { popup, hide, dismissal } = dialog.internal

  function snapTo(
    point: SnapPoint,
    reason: DrawerSnapPointChangeReason,
    event?: Event
  ) {
    return change("snapPoint", point, { reason, event })
  }

  // What an open starts with: the default snap point, unless it's controlled
  // or was chosen while closed, and whether the page behind is usable there.
  function opened(state: DrawerState, given = options()) {
    const snapPoint =
      given.snapPoint === undefined && state.snapPoint === null
        ? defaultSnap(given)
        : state.snapPoint
    return { snapPoint, interactive: interactiveByOrder(given, snapPoint) }
  }

  // Uncontrolled drawers open at their default snap point again, from the
  // moment they unmount.
  const forgetsSnap = (state: DrawerState, given = options()) =>
    given.snapPoint === undefined && state.snapPoint !== null

  // A controlled open or close lands with what it changes, in the same pass:
  // an open starts where it starts, and a close that unmounts at once forgets
  // the snap point.
  deriveFromOptions(
    context,
    ["snapPoint", "interactive"],
    (synced, state, arriving) => {
      if (synced.open === undefined || synced.open === state.open) {
        return
      }
      const next = { ...state, ...synced }
      if (next.open) {
        return opened(next, arriving)
      }
      if (!next.mounted && forgetsSnap(next, arriving)) {
        return { snapPoint: null }
      }
    }
  )
  // An uncontrolled snap point the new snap points leave out moves to the
  // default, or to their first when they leave that out too.
  deriveFromOptions(
    context,
    ["snapPoint"],
    (synced, state, arriving: DrawerOptions) => {
      const point = synced.snapPoint ?? state.snapPoint
      if (arriving.snapPoint !== undefined || point === null) {
        return
      }
      const points = arriving.snapPoints ?? ["content"]
      const kept = (entry: SnapPoint) =>
        points.some((other) => sameValue(other, entry))
      if (kept(point)) {
        return
      }
      const fallback = defaultSnap(arriving)
      return {
        snapPoint: kept(fallback) || !points.length ? fallback : points[0],
      }
    }
  )
  // The modal setting in effect: none while the page behind is usable.
  deriveState(context, ["modal"], ({ interactive, modalSetting }) => ({
    modal: interactive ? false : modalSetting,
  }))

  let wasOpen = store.get().open
  let wasMounted = store.get().mounted
  let lastSnap = store.get().snapPoint
  // Whether the snap point was set while closed, like during the close
  // animation, so it's where the drawer opens next.
  let chosenWhileClosed = false
  store.subscribe(() => {
    const state = store.get()
    if (state.open !== wasOpen) {
      wasOpen = state.open
      if (state.open) {
        chosenWhileClosed = false
        store.set(opened(state))
      }
    }
    if (state.snapPoint !== lastSnap) {
      lastSnap = state.snapPoint
      if (!state.open) {
        chosenWhileClosed = state.snapPoint !== null
      } else if (state.snapPoint !== null) {
        sheet?.snapTo(state.snapPoint, "imperative")
      }
    }
    // A snap point set while closed, even during the close animation, is
    // where it opens next.
    const unmounted = wasMounted && !state.mounted
    wasMounted = state.mounted
    if (unmounted && !state.open && !chosenWhileClosed && forgetsSnap(state)) {
      store.set({ snapPoint: null })
    }
  })

  // What the sheet reports.
  const events = {
    /** The resting snap point changes, at release or when a move starts. */
    snap(point: SnapPoint, reason: DrawerSnapPointChangeReason, event?: Event) {
      if (sameValue(point, store.get().snapPoint)) {
        return
      }
      lastSnap = point
      if (change("snapPoint", point, { reason, event }) || !store.get().open) {
        return
      }
      // Refused: back to where it was.
      lastSnap = store.get().snapPoint
      if (lastSnap !== null) {
        sheet?.snapTo(lastSnap, "imperative")
      }
    },
    /** It came to rest. Modality follows the snap point it rests on. */
    rest(point: SnapPoint | null) {
      if (point === null) {
        return
      }
      store.set({
        interactive: isAtOrBelow(resolved, point, options().modalAbove),
        snapIndex: findSnapIndex(resolved, point),
        snapCount: resolved.length,
      })
    },
    /** A swipe dismissed it; it's already settling closed. */
    dismiss(event?: Event) {
      hide({ reason: "swipe", event })
      // A close the app refused, or a controlled one it hasn't confirmed by
      // the next frame, springs back.
      requestAnimationFrame(() => {
        const snap = store.get().snapPoint
        if (store.get().open && snap !== null) {
          sheet?.snapTo(snap, "imperative")
        }
      })
    },
    drag: (dragging: boolean) => store.set({ dragging }),
    /** The geometry changed: the resolved side and snap points. */
    layout(side: PhysicalSide, snapPoints: readonly ResolvedSnapPoint[]) {
      resolved = snapPoints
      store.set({
        side,
        snapCount: snapPoints.length,
        snapIndex: findSnapIndex(snapPoints, store.get().snapPoint),
      })
    },
  }

  // Called from the content's `bind`, between the sheet and the popup layer.
  let attached: Parameters<typeof attach> | undefined
  function attach(
    el: HTMLElement,
    host: HTMLElement,
    backdrop: () => HTMLElement | undefined
  ) {
    attached = [el, host, backdrop]
    // One sheet per drawer: a content bound again replaces the last one.
    sheet?.destroy()
    sheet = attachSheet(el, {
      host,
      side: () => options().side ?? "bottom",
      snapPoints: () => options().snapPoints ?? ["content"],
      snapPoint: () => store.get().snapPoint,
      // A swipe is refused like any dismissal.
      dismissible: dismissal.sheet.dismissible,
      modalAbove: () => options().modalAbove,
      driver: () => options().driver ?? "auto",
      expandOnScroll: () => options().expandOnScroll !== false,
      physics: () => options().physics,
      backdrop,
      outlets: () => outlets,
      parent: () => stackedOn?.(),
      themeColor: () => !!options().themeColor,
      preventEdgeSwipe: () => !!options().preventEdgeSwipe,
      // The handle is a button that drags.
      canMouseDrag: (target) =>
        !!target.closest('[data-slot="drawer-handle"]') ||
        isDragSurface(target),
      onSnap: events.snap,
      onRest: events.rest,
      onDismiss: events.dismiss,
      onDismissAttempt: dismissal.sheet.onDismissAttempt,
      onDragChange: events.drag,
      onLayout: ({ side, snapPoints }) => events.layout(side, snapPoints),
    })
    for (const handle of el.querySelectorAll<HTMLElement>(
      '[data-slot="drawer-handle"]'
    )) {
      handle.style.touchAction = handleTouchAction(handle)
    }
    if (dev && options().snapPoints?.length === 0) {
      warn("`snapPoints` is empty, so it rests at its own size.", {
        component: "drawer",
        id: context.id,
      })
    }
  }

  function detach() {
    sheet?.destroy()
    sheet = undefined
    attached = undefined
  }

  // A sheet picks its driver, side and touch guard as it attaches, so a change
  // to them attaches it again where it rests. New snap points it measures again.
  let shape = shapeOf(options())
  let points = String(options().snapPoints)
  context.onOptions((next) => {
    const nextShape = shapeOf(next)
    const nextPoints = String(next.snapPoints)
    const reshaped = nextShape !== shape
    const moved = nextPoints !== points
    shape = nextShape
    points = nextPoints
    if (!reshaped && !moved) {
      return
    }
    // Once the options are handed over, so the sheet's state isn't written beside them.
    queueMicrotask(() => {
      if (!sheet || !attached) {
        return
      }
      if (reshaped) {
        attach(...attached)
        if (store.get().open) {
          sheet?.open(false)
        }
      } else {
        sheet.refresh()
      }
    })
  })

  // The handle: a press goes to the next larger snap point, wrapping, like iOS's grabber.
  function stepHandle(
    action: Parameters<typeof stepSnapIndex>[2],
    reason: DrawerSnapPointChangeReason,
    event?: Event
  ) {
    const index = stepSnapIndex(
      findSnapIndex(resolved, store.get().snapPoint),
      resolved.length,
      action
    )
    if (index >= 0) {
      snapTo(resolved[index].value, reason, event)
    }
  }

  const api = {
    ...dialog,
    getSnapPoint: () => store.get().snapPoint,
    setSnapPoint: (
      point: SnapPoint,
      {
        reason = "imperative",
        event,
      }: ChangeOptions<DrawerSnapPointChangeReason> = {}
    ) => snapTo(point, reason, event),
    internal: {
      ...dialog.internal,
      attach,
      detach,
      stepHandle,
      registerOutlet(el: HTMLElement, key: string) {
        const outlet = {
          el,
          get keyframes() {
            return context.props<DrawerOutletProps>("outlet", key)?.keyframes
          },
        }
        outlets = [...outlets, outlet]
        return () => {
          outlets = outlets.filter((entry) => entry !== outlet)
        }
      },
    },
  }
  return api
}

const drawerApi: (...args: Parameters<typeof drawerApiBody>) => DrawerApi =
  drawerApiBody

/**
 * `drawer`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface DrawerApi extends ReturnType<typeof drawerApiBody> {}

export {
  defaultSnap,
  type DrawerApi,
  drawerApi,
  type DrawerState,
  handleTouchAction,
  interactiveByOrder,
}
