// Trying an option before choosing it: a theme, a font, a layout, a
// generated variant. The preview is its own state beside the value, so the
// page renders `preview ?? value` and choosing is a separate step. A pointer
// can press an option and slide across the others, each previewing in turn
// like a scrub; letting go on one chooses it, and off them puts the page back.
// Arrows preview from the keyboard, Enter keeps, Escape puts back.
import { elements } from "../kernel/elements"
import type { PrimitiveContext } from "../kernel/primitive-types"
import { announce } from "../platform/announce"
import { createDragSession } from "../drag-and-drop/pointer"

/**
 * Why the preview changed.
 * @experimental
 */
type PreviewReason =
  | "item-hover"
  | "list-navigation"
  | "escape-key"
  | "focus-out"
  | "item-press"
  | "imperative"

/**
 * How `createPreview` keeps the preview and chooses.
 * @experimental
 */
type PreviewOptions<State extends object> = {
  /** The state key that holds the previewed option's key, or `null`. */
  key: keyof State & string
  /** The slot whose parts are the options. */
  slot: string
  /** Asks for a new preview. Defaults to setting the state key; pass the primitive's change to fire `onPreviewChange`. */
  set?: (
    value: string | null,
    details: { reason: PreviewReason; event?: Event }
  ) => boolean
  /** Chooses an option. Pass the primitive's change for its value. */
  choose: (
    key: string,
    details: { reason: "item-press"; event?: Event }
  ) => boolean
  /** The chosen option now, which previews as nothing. */
  value?: () => string | null
  /** Whether an option can't be previewed or chosen. */
  disabled?: (key: string) => boolean
  /** An option's name for screen readers. Defaults to its key. */
  label?: (key: string) => string
  /** What screen readers hear when the keyboard previews one. Defaults to English. */
  message?: (label: string) => string
}

/**
 * Lets users preview a slot's parts before choosing one. Call it once in
 * `api` and keep it on the api; wire the option slot:
 *
 * ```ts
 * option: slot<{ value: string }>({
 *   attrs: (state, { key }) => ({ "data-previewing": state.preview === key ? "" : undefined }),
 *   on: {
 *     pointerdown: (event, { el, api, key }) => api.preview.pointerdown(event, key, el!.parentElement!),
 *     keydown: (event, { el, api, key }) => api.preview.keydown(event, key) || api.roving.keydown(event, el!),
 *   },
 * }),
 * ```
 *
 * Call `show(key)` as roving focus moves for arrow previews, and
 * `clear({ reason: "focus-out" })` when focus leaves the group.
 * @experimental
 */
function createPreview<State extends object>(
  context: Pick<
    PrimitiveContext<any, State, any>,
    "store" | "onDestroy" | "parts"
  >,
  options: PreviewOptions<State>
) {
  const { store } = context
  const current = () => (store.get()[options.key] ?? null) as string | null
  const set = (
    value: string | null,
    details: { reason: PreviewReason; event?: Event }
  ) =>
    options.set
      ? options.set(value, details)
      : (store.set({ [options.key]: value } as Partial<State>), true)
  const label = (key: string) => options.label?.(key) ?? key
  let sliding = false
  const drags = createDragSession(context.onDestroy)

  const api = {
    /** Shows an option without choosing it. The chosen option and disabled ones show as nothing. */
    show(
      key: string | null,
      details: { reason: PreviewReason; event?: Event } = {
        reason: "imperative",
      }
    ) {
      const next =
        key && !options.disabled?.(key) && key !== options.value?.()
          ? key
          : null
      if (next === current()) {
        return false
      }
      const done = set(next, details)
      if (done && next && details.reason === "list-navigation") {
        announce(
          options.message?.(label(next)) ??
            `Previewing ${label(next)}. Enter to keep it.`
        )
      }
      return done
    },
    /** Puts the page back. */
    clear(
      details: { reason: PreviewReason; event?: Event } = {
        reason: "imperative",
      }
    ) {
      return current() !== null && set(null, details)
    },
    /** Chooses the previewed option, or `key`, and ends the preview. */
    choose(key?: string, details: { event?: Event } = {}) {
      const target = key ?? current()
      if (!target || options.disabled?.(target)) {
        return false
      }
      const done = options.choose(target, {
        reason: "item-press",
        event: details.event,
      })
      api.clear({ reason: "item-press", event: details.event })
      return done
    },
    /** Whether a pointer is pressed and sliding across the options. */
    dragging: () => sliding,
    /** Starts a press and slide from an option: each option the pointer slides over previews, letting go on one chooses it. */
    pointerdown(event: PointerEvent, key: string, surface: HTMLElement) {
      if (!drags.accepts(event)) {
        return
      }
      event.preventDefault()
      // Boxes are read once, on press, so sliding measures nothing.
      const boxes = elements(context, options.slot).map((item) => ({
        key: item.key,
        box: item.el.getBoundingClientRect(),
      }))
      const under = (x: number, y: number) =>
        boxes.find(
          ({ box }) =>
            x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
        )?.key ?? null
      sliding = true
      api.show(key, { reason: "item-hover", event })
      drags.start(surface, event, {
        cancelOnEscape: true,
        onMove: ({ x, y, event: move }) => {
          const next = under(x, y)
          if (next !== current()) {
            api.show(next, { reason: "item-hover", event: move })
          }
        },
        onEnd: (end, canceled) => {
          sliding = false
          const landed = canceled ? null : under(end.clientX, end.clientY)
          if (landed && landed !== options.value?.()) {
            api.choose(landed, { event: end })
          } else {
            api.clear({
              reason: landed ? "item-press" : "focus-out",
              event: end,
            })
          }
        },
      })
    },
    /** Enter or Space keeps the preview, or chooses `key`; Escape puts the page back. Returns whether it handled the key. */
    keydown(event: KeyboardEvent, key: string) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        api.choose(current() ?? key, { event })
        return true
      }
      if (event.key === "Escape" && current()) {
        event.preventDefault()
        api.clear({ reason: "escape-key", event })
        return true
      }
      return false
    },
  }
  return api
}

export { createPreview, type PreviewOptions, type PreviewReason }
