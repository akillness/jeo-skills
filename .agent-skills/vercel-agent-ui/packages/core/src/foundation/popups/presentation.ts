// How a popup presents: its own way, or as a sheet from the bottom of the
// screen with the Drawer's motion (`presentation="sheet"`, or `"auto"` on
// phones). The sheet code loads only once a popup is set to present as one,
// so an app that never does ships a few dozen bytes for it, not the sheet.
import type { SnapPoint } from "../motion/snap-points"
import type { Store } from "../kernel/store"
import { on } from "../kernel/events"
import { sourceOf } from "../kernel/modality"
import { isBrowser } from "../platform/env"
import type { AttachConfig, Popup } from "./popup"
import { registerPopupElement } from "./popup-elements"
import type { Sheet } from "./sheet"
import type { createDismissal } from "./dismissal"

/** How a popup can present. `"auto"` picks the sheet on small touch screens. */
type PresentationSetting<Default extends string> = "auto" | Default | "sheet"

/** What a popup tells the sheet it presents as, beside its popup config. */
type SheetConfig = AttachConfig & {
  /** Where the sheet can rest. Defaults to its own size. */
  snapPoints?: readonly SnapPoint[]
  /** Whether a swipe can dismiss it. Defaults to true. */
  dismissible?: () => boolean
  /** A swipe tried to dismiss it while `dismissible` is false. */
  onDismissAttempt?: (event?: Event) => void
  /** Hears the sheet once it's attached, and undefined once it's gone, for a popup that moves it. */
  onSheet?: (sheet: Sheet | undefined) => void
  /**
   * For a popup inside a sheet, like a submenu: shows it in place of the
   * popup it's in, which keeps only the way to it. Returns that popup's
   * content and the trigger that stays above this one.
   */
  drillIn?: () => (HTMLElement | undefined)[]
}

let loading: Promise<typeof import("./sheet-presentation")> | undefined
const load = () => (loading ??= import("./sheet-presentation"))
const matches = (query: string) => isBrowser && matchMedia(query).matches

/**
 * A popup's presentation, kept in its state as `presentation`. Call `open()`
 * as it opens, from `createPopupLayer`'s `onOpenChange`, and `bind()` from the
 * content's `bind` in place of `popup.bind`.
 */
function createPresentation<Default extends string>(
  store: Store<{ open: boolean; presentation: Default | "sheet" }>,
  // Read once the content binds, so the layer may come later.
  layer: () => Popup,
  setting: () => PresentationSetting<Default> | undefined,
  fallback: Default,
  // Whether a swipe can dismiss the sheet, unless `bind`'s config says.
  dismissal?: Pick<ReturnType<typeof createDismissal>, "sheet">
) {
  const resolve = () => {
    const value = setting()
    const phone =
      value === "auto" && matches("(max-width: 640px) and (pointer: coarse)")
    return value === "sheet" || phone ? "sheet" : fallback
  }
  const open = () => store.set({ presentation: resolve() })
  const value = setting()
  if (value === "sheet") {
    open()
  }
  if (
    isBrowser &&
    !loading &&
    (value === "sheet" || (value === "auto" && matches("(pointer: coarse)")))
  ) {
    ;(window.requestIdleCallback ?? setTimeout)(() =>
      load().then((sheet) => sheet.prepareVariables())
    )
  }
  return {
    open,
    /** How it would present if it opened now. */
    resolve,
    bind(el: HTMLElement, config: SheetConfig) {
      const popup = layer()
      // Open from the start, it rendered its default on the server and in the
      // first render, so hydration matches. Once the client binds it, `"auto"` decides.
      if (
        setting() === "auto" &&
        popup.opener() === "initial" &&
        store.get().open
      ) {
        queueMicrotask(open)
      }
      if (store.get().presentation !== "sheet") {
        return popup.bind(el, config)
      }
      let cleanup: (() => void) | undefined
      let cancelled = false
      // Content in the page before it opens loses `hidden` to the render that
      // opens it, and would sit in the page's flow until the sheet code loads.
      const hide = () => el.hidden || (el.hidden = true)
      const hidden = new MutationObserver(hide)
      const show = (present: () => (() => void) | undefined) => {
        hidden.disconnect()
        if (!cancelled) {
          cleanup = present()
        }
      }
      load().then(
        ({ presentSheet }) =>
          show(() =>
            presentSheet(el, popup, { ...dismissal?.sheet, ...config })
          ),
        () => show(() => popup.bind(el, config))
      )
      hide()
      hidden.observe(el, { attributeFilter: ["hidden"] })
      const unregister = registerPopupElement(el)
      return () => {
        cancelled = true
        hidden.disconnect()
        unregister()
        cleanup?.()
      }
    },
  }
}

/**
 * The `modal` setting a popup uses: the app's, else modal while it presents
 * as a sheet, like iOS's sheets, else the component's default.
 */
const sheetModal = <Setting>(
  presentation: string,
  setting: Setting | undefined,
  fallback: Setting
) => setting ?? (presentation === "sheet" ? true : fallback)

/** Where a list with an input rests as a sheet: at most half the screen, and its full size once someone types. */
const sheetSnapPoints: SnapPoint[] = [0.5, 1]

/**
 * A text input that opens a popup that may present as a sheet, like a
 * combobox's, which moves into the sheet's header while it's open. A tap on
 * it that opens a sheet doesn't focus it, so no keyboard opens and focus goes
 * to the sheet. Tapping it inside the sheet grows the sheet (see
 * `sheet-presentation.ts`). Call from the input's `bind`.
 */
function bindSheetInput(
  el: HTMLElement,
  link: {
    store: Store<{ open: boolean; presentation: string }>
    presentation: Pick<ReturnType<typeof createPresentation>, "resolve">
    open: (event: Event) => void
  }
) {
  const { store } = link
  // Moving into the header and back renders the input again, and a closing
  // sheet's inert content takes focus from it, which some engines don't
  // report. So the input remembers it held focus until focus went somewhere
  // else, and takes it back where it lands. A finger's keyboard stays closed.
  if (
    held.get(store) &&
    store.get().presentation === "sheet" &&
    sourceOf() !== "touch"
  ) {
    queueMicrotask(() => el.isConnected && el.focus({ preventScroll: true }))
  }
  held.delete(store)
  const offs = [
    on(
      el,
      "touchend",
      (event) => {
        if (
          store.get().open ||
          !event.cancelable ||
          link.presentation.resolve() !== "sheet"
        ) {
          return
        }
        event.preventDefault()
        link.open(event)
      },
      { passive: false }
    ),
    on(el, "focus", () => held.set(store, true)),
    on(el, "blur", (event) => event.relatedTarget && held.set(store, false)),
  ]
  return () => {
    offs.forEach((off) => off())
    if (el.ownerDocument.activeElement === el) {
      held.set(store, true)
    }
  }
}

const held = new WeakMap<object, boolean>()

export {
  bindSheetInput,
  createPresentation,
  type PresentationSetting,
  type SheetConfig,
  sheetModal,
  sheetSnapPoints,
}
