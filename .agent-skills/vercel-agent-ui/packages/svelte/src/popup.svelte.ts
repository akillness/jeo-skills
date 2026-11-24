import { portalTarget } from "@ui-sdk/core/renderer"
import { getContext, setContext } from "svelte"
import type { PopupContainer, Portal } from "./use-primitive.svelte"

// The container the nearest popup above renders into. Popups inside it render
// there too, like a menu inside a portaled popover, unless they name their own.
const InheritedContainer = Symbol("popup-container")

/** A getter for a popup's container: its own, else the one the popup around it renders into. */
function usePopupContainer(own: () => PopupContainer) {
  const inherited = getContext<(() => PopupContainer) | undefined>(
    InheritedContainer
  )
  return () => own() ?? inherited?.()
}

/** Hands the container a popup renders into to the popups inside it. Call in the content's script. */
function providePopupContainer(container: () => PopupContainer) {
  setContext(InheritedContainer, container)
}

// The core hides a closed popup once its CSS animations end, before Svelte
// starts a `transition:` or `out:` on it or inside it. Shown again, it plays
// the outro in the top layer and leaves it when Svelte removes it.
function keepShown(event: Event) {
  const host = (event.target as Element).closest<HTMLElement>("[popover]")
  if (!host || host.matches(":popover-open")) {
    return
  }
  try {
    host.showPopover()
  } catch {}
}

/**
 * A popup's `portal` for `usePart`: its element moves into the container
 * `container` names, and stays in place without one or with `false`, like
 * content inside a viewport that moved. Svelte removes a block's nodes by
 * walking from its first to its last, so an element elsewhere would stay
 * behind: a comment holds its place, the element goes back before the part
 * stops being present, and leaves with the comment if the block goes first.
 * Only popups pay for it.
 */
function portalTo(container: () => PopupContainer | false) {
  const portal: Portal = (el) => {
    // Added once, however often the part binds: the same listener again does nothing.
    el.addEventListener("outrostart", keepShown, true)
    const current = container()
    const target = current === false ? null : portalTarget(current)
    if (!target || el.parentNode === target) {
      return
    }
    const home = el.ownerDocument.createComment("")
    el.before(home)
    target.append(el)
    return () => {
      if (home.isConnected) {
        home.before(el)
      } else {
        el.remove()
      }
      home.remove()
    }
  }
  return portal
}

export {
  useControllerEntry,
  useControllerTarget,
} from "./controller-target.svelte"

export {
  type PopupContainer,
  portalTo,
  providePopupContainer,
  usePopupContainer,
}
