// The overlay host: a registry of overlays opened imperatively from anywhere,
// like `toast()` and `confirm()`, and later sheets. Each framework has one host
// component (`<OverlayHost />`, `<ui-overlay-host>`) that the app mounts once.
// It renders every entry by its type. Core never renders anything itself.
import { dev, warn } from "#dev"

/**
 * One overlay a host renders.
 * @stable
 */
type OverlayEntry = {
  /** Unique within its registry. */
  id: string
  /** What kind of overlay it is, which picks the component that renders it: `"toaster"` or `"confirm"`. */
  type: string
  /** What the renderer needs, like the toaster whose region it shows. */
  data: unknown
}

let count = 0

/**
 * Creates a registry of overlays. Most apps use the shared `overlays`, which
 * `toast()` and `confirm()` open into; a separate one is for a separate host,
 * like one inside an iframe.
 * @stable
 */
function createOverlays() {
  // Replaced on every change, so a framework can compare snapshots by identity.
  let entries: readonly OverlayEntry[] = []
  const listeners = new Set<() => void>()
  let hosts = 0

  const notify = () => listeners.forEach((listener) => listener())

  function unmount(id: string) {
    const next = entries.filter((entry) => entry.id !== id)
    if (next.length === entries.length) {
      return
    }
    entries = next
    notify()
  }

  return {
    /**
     * Adds an overlay for the hosts to render. Returns its id; pass it to
     * `unmount()` once the overlay has finished closing. `rendered` says
     * whether something else already shows it, like a region the app placed,
     * so development builds don't warn about a missing host.
     */
    mount(type: string, data: unknown, rendered?: () => boolean) {
      const id = `${type}-${++count}`
      entries = [...entries, { id, type, data }]
      notify()
      // A host that mounts in the same task, like during hydration, still counts.
      if (dev && typeof window !== "undefined") {
        setTimeout(() => {
          if (
            !hosts &&
            !rendered?.() &&
            entries.some((entry) => entry.id === id)
          ) {
            warn(
              `A ${type} opened, but no host renders it. Mount <OverlayHost /> (or <ui-overlay-host>) once in your app.`
            )
          }
        }, 1000)
      }
      return id
    },
    /** Removes an overlay. */
    unmount,
    /** The overlays to render, oldest first. The same array until something changes. */
    entries: () => entries,
    /** Calls `listener` whenever an overlay is added or removed. Returns a function that stops it. */
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Counts a host that renders this registry. Hosts call it while mounted. Returns a release. */
    attachHost() {
      hosts++
      let attached = true
      return () => {
        if (attached) {
          hosts--
        }
        attached = false
      }
    },
    /** Whether a host is mounted to render the overlays. */
    hasHost: () => hosts > 0,
  }
}

/**
 * A registry of overlays, from `createOverlays()`.
 * @stable
 */
type Overlays = ReturnType<typeof createOverlays>

/**
 * The shared registry that `toast()` and `confirm()` open into, and that
 * `<OverlayHost />` renders by default. One per realm, even when two copies of
 * the package load on one page.
 * @stable
 */
const overlays = ((globalThis as Record<symbol, unknown>)[
  Symbol.for("ui-sdk.overlays@1")
] ??= createOverlays()) as Overlays

export { createOverlays, type OverlayEntry, overlays, type Overlays }
