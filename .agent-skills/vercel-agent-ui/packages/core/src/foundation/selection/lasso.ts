// Rectangle selection: drag on empty space and every item the rectangle
// touches is selected, like on a desktop or a design canvas. Shift adds to
// what was selected. The rectangle lives in state, so it renders like any
// part, and the selection commits once, when the pointer lifts. Escape lets go
// without selecting.
import { elements } from "../kernel/elements"
import type { PrimitiveContext } from "../kernel/primitive-types"
import { announce } from "../platform/announce"
import { createDragSession, dragThreshold } from "../drag-and-drop/pointer"

/**
 * The rectangle being drawn, relative to the surface, and what it selects so far.
 * @experimental
 */
type LassoDraft = {
  left: number
  top: number
  right: number
  bottom: number
  keys: string[]
}

/**
 * How `createLasso` finds items and changes the selection.
 * @experimental
 */
type LassoOptions<State extends object> = {
  /** The slot whose parts the rectangle selects. */
  slot: string
  /** The state key that holds the `LassoDraft` while one is drawn. Start it at `null`, and list it in `live`. */
  draft: keyof State & string
  /** The selection now, which Shift adds to. */
  selected: () => string[]
  /** Asks for a new selection. Pass the primitive's change. */
  set: (keys: string[], details: { reason: "lasso"; event?: Event }) => boolean
  /** Whether an item can be selected. Defaults to every item. */
  selectable?: (key: string) => boolean
  /** What screen readers hear when the rectangle lifts. Defaults to English. */
  message?: (count: number) => string
}

const touches = (
  a: LassoDraft,
  b: { left: number; top: number; right: number; bottom: number }
) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * Lets users select a slot's parts by drawing a rectangle on the surface
 * around them. Call it once in `api`, and start it from the surface's
 * `pointerdown` when the press lands on the surface itself:
 *
 * ```ts
 * root: slot({
 *   on: { pointerdown: (event, { el, api }) => event.target === el && api.lasso.pointerdown(event, el!) },
 * }),
 * // Render it always: its style hides it until a rectangle is drawn.
 * lasso: slot({
 *   live: live((state, { api }) => ({ style: api.lasso.style(state) })),
 * }),
 * ```
 *
 * Item boxes are read once, when the drag starts, so drawing measures nothing.
 * @experimental
 */
function createLasso<State extends object>(
  context: Pick<
    PrimitiveContext<any, State, any>,
    "store" | "onDestroy" | "parts"
  >,
  options: LassoOptions<State>
) {
  const { store } = context
  const setDraft = (draft: LassoDraft | null) =>
    store.set({ [options.draft]: draft } as Partial<State>)
  const drags = createDragSession(context.onDestroy)

  return {
    /** Starts a rectangle on `surface` once the pointer moves past `dragThreshold`. Escape lets go without selecting. */
    pointerdown(event: PointerEvent, surface: HTMLElement) {
      if (!drags.accepts(event)) {
        return
      }
      const box = surface.getBoundingClientRect()
      const x0 = event.clientX - box.left
      const y0 = event.clientY - box.top
      const base = event.shiftKey ? options.selected() : []
      const items = elements(context, options.slot)
        .filter((item) => options.selectable?.(item.key) ?? true)
        .map((item) => {
          const r = item.el.getBoundingClientRect()
          return {
            key: item.key,
            rect: {
              left: r.left - box.left,
              top: r.top - box.top,
              right: r.right - box.left,
              bottom: r.bottom - box.top,
            },
          }
        })
      drags.start(surface, event, {
        threshold: dragThreshold,
        cancelOnEscape: true,
        onMove: ({ x, y }) => {
          const x1 = x - box.left
          const y1 = y - box.top
          const rect = {
            left: Math.min(x0, x1),
            top: Math.min(y0, y1),
            right: Math.max(x0, x1),
            bottom: Math.max(y0, y1),
            keys: [],
          }
          const hit = items
            .filter((item) => touches(rect, item.rect))
            .map((item) => item.key)
          setDraft({ ...rect, keys: [...new Set([...base, ...hit])] })
        },
        onEnd: (end, canceled) => {
          const draft = store.get()[options.draft] as LassoDraft | null
          setDraft(null)
          if (!draft || canceled) {
            return
          }
          if (options.set(draft.keys, { reason: "lasso", event: end })) {
            announce(
              options.message?.(draft.keys.length) ??
                `${draft.keys.length} ${draft.keys.length === 1 ? "item" : "items"} selected.`
            )
          }
        },
      })
    },
    /** Whether the rectangle touches an item now. */
    touches(state: State, key: string) {
      return !!(state[options.draft] as LassoDraft | null)?.keys.includes(key)
    },
    /** The rectangle as a `style` attribute for its part, hidden while none is drawn. */
    style(state: State) {
      const draft = state[options.draft] as LassoDraft | null
      if (!draft) {
        return "display:none"
      }
      return `position:absolute;pointer-events:none;left:${draft.left}px;top:${draft.top}px;width:${draft.right - draft.left}px;height:${draft.bottom - draft.top}px`
    },
  }
}

export { createLasso, type LassoDraft, type LassoOptions }
