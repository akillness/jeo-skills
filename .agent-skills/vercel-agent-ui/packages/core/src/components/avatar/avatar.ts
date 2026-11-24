import { css } from "../../foundation/kernel/inline-style"
import {
  type ChangeDetails,
  resolveSource,
} from "../../foundation/kernel/details"
import { on } from "../../foundation/kernel/events"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { changeFrom } from "../../foundation/kernel/change"
import { imageStatus } from "./image-status"

// Avatar shows a person's image, and a fallback, like their initials, until
// the image loads or when it can't. The image is a real <img> on the page from
// the first render, server markup included, so the browser fetches it once,
// with your own `crossOrigin`, `referrerPolicy`, `srcSet` and `sizes`. It stays
// hidden until it has loaded. One already in the browser's memory cache is
// known to be loaded when it binds, before the first paint, so the fallback
// never flashes for it.

/**
 * Where the image is: no image, loading, loaded, or failed.
 * @stable
 */
type AvatarLoadingStatus = "idle" | "loading" | "loaded" | "error"

/**
 * Why the image's loading status changed.
 * @stable
 */
type AvatarLoadingStatusChangeReason =
  "image-load" | "image-error" | "src-change"

/**
 * The options `avatar` takes. A component takes them as props on its root.
 * @stable
 */
type AvatarOptions = {
  /**
   * Runs when the image's loading status changes: `"loading"` when it gets a
   * source, `"loaded"`, `"error"`, and `"idle"` when it leaves the page.
   * `details.reason` says why, and `details.event` is the image's `load` or
   * `error` event, or undefined when the status was known at once, like for a
   * cached image.
   */
  onLoadingStatusChange?: (
    status: AvatarLoadingStatus,
    details: ChangeDetails<AvatarLoadingStatusChangeReason>
  ) => void
} & PrimitiveOptions

// Options only adapters pass.
type AvatarInternalOptions = AvatarOptions & {
  // The fallback's delay, for adapters whose fallback may register after the
  // avatar binds, like web components upgrading in any order.
  fallbackDelay?: number
}

/**
 * The props the `fallback` slot of `avatar` takes.
 * @stable
 */
type AvatarFallbackProps = {
  /**
   * How long to wait, in milliseconds, before showing the fallback, so a fast
   * image appears without the fallback flashing first. Without one, the
   * fallback shows at once, server markup included.
   * @defaultValue 0
   */
  delay?: number
}

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type AvatarState = {
  /** Where the image is: `"idle"`, `"loading"`, `"loaded"` or `"error"`. */
  loadingStatus: AvatarLoadingStatus
}

type State = AvatarState & {
  // Whether the longest fallback delay has passed since the avatar bound.
  delayElapsed: boolean
}

// Until it loads, the image is in the page but out of sight, out of the
// accessibility tree and out of the layout. It keeps a box, unlike with
// `display: none` or `hidden`, so `loading="lazy"` still loads it.
const hiddenImageStyle = css({
  position: "absolute",
  width: "1px",
  height: "1px",
  opacity: 0,
  "pointer-events": "none",
})

function statusAttrs(state: State) {
  return { "data-loading-status": state.loadingStatus }
}

// An image with no source can never load.
function hasSource(img: HTMLImageElement) {
  return !!(img.getAttribute("src") || img.getAttribute("srcset"))
}

const avatarPrimitive = /* @__PURE__ */ definePrimitive({
  name: "avatar",
  options: {
    onLoadingStatusChange: "callback",
    // Internal: passed by renderers.
    fallbackDelay: "number",
  },
  state: (_options: AvatarInternalOptions): State => ({
    loadingStatus: "idle",
    delayElapsed: false,
  }),
  controlled: [],
  api: (context) => {
    const { store, props, element, options } = context
    // A load or an error is never the user's doing, so no change reads input.
    const change = changeFrom(context, (reason: string) =>
      resolveSource(reason)
    )
    const report = (
      status: AvatarLoadingStatus,
      reason: AvatarLoadingStatusChangeReason,
      event?: Event
    ) => change("loadingStatus", status, { reason, event })
    // A loaded image keeps showing while its next source loads, as browsers
    // draw it, so a new source never flashes the fallback.
    const startLoading = () => {
      if (store.get().loadingStatus !== "loaded") {
        report("loading", "src-change")
      }
    }

    return {
      internal: {
        // Follows an <img>: its status now, then its load and error events,
        // and a new source starting over.
        watchImage(img: HTMLImageElement) {
          const check = () => {
            const status = imageStatus(img, hasSource(img))
            if (status === "loading") {
              startLoading()
            } else {
              report(status, status === "loaded" ? "image-load" : "image-error")
            }
          }
          check()
          const observer = new MutationObserver(check)
          observer.observe(img, {
            attributeFilter: ["src", "srcset", "sizes", "crossorigin"],
          })
          const cleanups = [
            on(img, "load", (event) => report("loaded", "image-load", event)),
            on(img, "error", (event) => report("error", "image-error", event)),
            () => observer.disconnect(),
          ]
          return () => {
            cleanups.forEach((cleanup) => cleanup())
            // React's StrictMode and moved elements bind again in the same task.
            queueMicrotask(() => {
              if (!element("image")) {
                report("idle", "src-change")
              }
            })
          }
        },
        // An image removed from the page, like a web component's <img>,
        // which nothing unbinds, takes its status with it.
        watchImageRemoval(root: HTMLElement) {
          const observer = new MutationObserver(() => {
            if (store.get().loadingStatus !== "idle" && !element("image")) {
              report("idle", "src-change")
            }
          })
          observer.observe(root, { childList: true, subtree: true })
          return () => observer.disconnect()
        },
        // Starts the fallback's delay once the avatar is on the page. The
        // fallback may not be rendered yet, so its props are read a microtask later.
        startDelay() {
          let timer: ReturnType<typeof setTimeout> | undefined
          let active = true
          queueMicrotask(() => {
            if (!active) {
              return
            }
            const delay =
              (props("fallback") as AvatarFallbackProps | undefined)?.delay ??
              options().fallbackDelay ??
              0
            if (delay > 0) {
              timer = setTimeout(() => store.set({ delayElapsed: true }), delay)
            }
          })
          return () => {
            active = false
            clearTimeout(timer)
          }
        },
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, AvatarState>({
      state: (state) => ({ loadingStatus: state.loadingStatus }),
      attrs: statusAttrs,
      bind: (el, { api }) => {
        const cleanups = [
          api.internal.startDelay(),
          api.internal.watchImageRemoval(el),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),

    // A real <img>, out of sight until it loads. Its alt text names the avatar then.
    image: slot<{}, AvatarState>({
      state: (state) => ({ loadingStatus: state.loadingStatus }),
      attrs: (state) => ({
        ...statusAttrs(state),
        "aria-hidden": state.loadingStatus === "loaded" ? undefined : "true",
        style: state.loadingStatus === "loaded" ? undefined : hiddenImageStyle,
      }),
      bind: (el, { api }) => api.internal.watchImage(el as HTMLImageElement),
    }),

    // Shown while there's no loaded image, after its delay.
    fallback: slot<AvatarFallbackProps, AvatarState>({
      props: { delay: "number" },
      present: (state, { props }) =>
        state.loadingStatus !== "loaded" &&
        (!(props.delay && props.delay > 0) || state.delayElapsed),
      state: (state) => ({ loadingStatus: state.loadingStatus }),
      attrs: statusAttrs,
    }),
  }),
})

/**
 * The type of `avatar`.
 * @stable
 */
interface AvatarPrimitive extends Named<typeof avatarPrimitive> {}

/**
 * The avatar primitive, with the slots `root`, `image`, `fallback`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const avatar: AvatarPrimitive = avatarPrimitive

export {
  avatar,
  type AvatarFallbackProps,
  type AvatarLoadingStatus,
  type AvatarLoadingStatusChangeReason,
  type AvatarOptions,
  type AvatarPrimitive,
  type AvatarState,
}
