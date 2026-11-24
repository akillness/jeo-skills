// A panel that shows and hides with its own enter and exit animations, size
// variables, find in page and focus handling: Collapsible's and Accordion's
// panels, and any panel a custom primitive shows, like a tree's group.
import { onProps } from "../kernel/part"
import type { Part } from "../kernel/primitive-types"
import { animateIn, animateOut } from "./presence"

/**
 * A panel's `hidden` attribute: absent when shown, `"until-found"` when find in page may open it, else `""`.
 * @stable
 */
function hiddenAttrs(shown: boolean, findable: boolean) {
  return { hidden: shown ? undefined : findable ? "until-found" : "" }
}

/**
 * Whether find in page can reveal `hidden="until-found"` content in this browser.
 * @stable
 */
function supportsHiddenUntilFound() {
  return typeof document !== "undefined" && "onbeforematch" in document.body
}

/**
 * Keeps a closed panel findable with `hidden="until-found"`, and calls
 * `reveal` when find in page matches text in it. Frameworks render `hidden` as
 * a boolean, and find in page removes it even when the opening is canceled;
 * either way, the value goes back, and back to plain `hidden` once it isn't findable. Returns a cleanup with a `check()` to call
 * when the panel's state changes. `bindPanel` calls it for you.
 * @stable
 */
function bindFindable(
  el: HTMLElement,
  panel: {
    shown: () => boolean
    findable: () => boolean
    reveal: (event: Event) => void
  }
) {
  const keep = () => {
    if (panel.shown()) {
      return
    }
    const hidden = el.getAttribute("hidden")
    if (panel.findable()) {
      if (hidden !== "until-found") {
        el.setAttribute("hidden", "until-found")
      }
    } else if (hidden === "until-found") {
      el.setAttribute("hidden", "")
    }
  }
  keep()
  const observer =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(keep)
  observer?.observe(el, { attributes: true, attributeFilter: ["hidden"] })
  el.addEventListener("beforematch", panel.reveal)
  return Object.assign(
    () => {
      observer?.disconnect()
      el.removeEventListener("beforematch", panel.reveal)
    },
    // Call when the panel's state changes.
    { check: keep }
  )
}

/**
 * What `bindPanel` asks of the primitive that owns a panel.
 * @stable
 */
type PanelBinding = {
  /**
   * Writes the panel's size variables, like `--accordion-panel-height`: the
   * measured size while animating, `auto` once open and `0px` while closed.
   */
  size: (el: HTMLElement, height: string, width: string) => void
  /** Whether the panel is open now. */
  isOpen: () => boolean
  /** Whether a closed panel is still shown while it animates out. Keep the panel `present` while it is. */
  isExiting: () => boolean
  /** Whether a closed panel stays in the page, findable with `hidden="until-found"`. */
  isFindable: () => boolean
  /** How the panel opens: as it mounts with the page, at once, or animated. */
  opening: () => "mount" | "instant" | "animate"
  /** Find in page matched text in the closed panel. Open it here. */
  reveal: (event: Event) => void
  /** Where focus goes when the panel closes with focus inside it, like its trigger. */
  trigger: () => HTMLElement | undefined
  /** Runs `listener` when the panel's state may have changed, like `store.subscribe`. Returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
  /** The open or close animation finished, or there was none. Never on mount. */
  settled: (open: boolean) => void
  /** The exit animation finished, so the panel can leave the page: stop counting it as exiting here. */
  exited: () => void
}

/**
 * Binds a panel element that opens and closes: `data-starting-style` and
 * `data-ending-style` for enter and exit animations, which it waits for
 * before `exited`, size variables to animate height, `hidden="until-found"`
 * and focus out of a panel closing around it. Call it from the panel slot's
 * `bind` and return its cleanup. Returns the cleanup.
 * @stable
 */
function bindPanel(el: HTMLElement, panel: PanelBinding) {
  const cleanups: (() => void)[] = []
  const size = (height: string, width = height) => panel.size(el, height, width)
  const shown = () => panel.isOpen() || panel.isExiting()

  const findable = bindFindable(el, {
    shown,
    findable: panel.isFindable,
    reveal: panel.reveal,
  })
  cleanups.push(findable)

  let stop: (() => void) | undefined
  const halt = () => {
    stop?.()
    stop = undefined
  }

  const opening = () => {
    halt()
    const how = panel.opening()
    if (how !== "animate") {
      // Nothing animates on the first paint or for a find in page match, keyframes
      // included. On mount, the frame before that paint reads the animations, so
      // the commit never computes style for them.
      const finish = () => {
        for (const animation of el.getAnimations()) {
          animation.finish()
        }
      }
      if (how === "mount") {
        const frame = requestAnimationFrame(finish)
        stop = () => cancelAnimationFrame(frame)
      } else {
        finish()
      }
      size("auto")
      if (how === "instant") {
        panel.settled(true)
      }
      return
    }
    // The render that shows the panel comes after this change. Measuring needs
    // it shown now, and keyframes keyed on the state need the state too.
    el.removeAttribute("hidden")
    el.removeAttribute("data-closed")
    el.setAttribute("data-open", "")
    // Starting style first, so measuring computes the closed size and nothing
    // transitions from a size the panel never showed.
    stop = animateIn(el, () => {
      stop = undefined
      size("auto")
      panel.settled(true)
    })
    size(`${el.scrollHeight}px`, `${el.scrollWidth}px`)
  }

  const closing = () => {
    halt()
    // Focus inside a closing panel would drop to the page. Its trigger is the closest place.
    if (el.contains(document.activeElement)) {
      panel.trigger()?.focus({ preventScroll: true })
    }
    if (!panel.isExiting()) {
      size("0px")
      panel.settled(false)
      return
    }
    // Exit animations keyed on the state must be running when animateOut looks for them.
    el.removeAttribute("data-open")
    el.setAttribute("data-closed", "")
    // From the size it has now, so an interrupted opening animates back from
    // where it is. Keyframes read the variable, so it holds until the end.
    const style = getComputedStyle(el)
    size(style.height, style.width)
    // Commits that size, so the change to zero animates from it.
    void el.offsetHeight
    // `stop` stays set, so reopening before the exit resets clears it at once.
    stop = animateOut(el, () => {
      size("0px")
      panel.exited()
      panel.settled(false)
    })
  }

  let open = panel.isOpen()
  if (open) {
    opening()
  } else {
    size("0px")
  }
  cleanups.push(
    panel.subscribe(() => {
      findable.check()
      if (panel.isOpen() === open) {
        return
      }
      open = !open
      if (open) {
        opening()
      } else {
        closing()
      }
    })
  )
  cleanups.push(halt)
  return () => cleanups.forEach((cleanup) => cleanup())
}

// A panel's `subscribe`: its state, and each render of its part, which can
// change a prop like `hiddenUntilFound` with no state change.
function stateAndRenders(
  store: { subscribe: (listener: () => void) => () => void },
  part: Part
) {
  return (listener: () => void) => {
    const offState = store.subscribe(listener)
    const offProps = onProps(part, listener)
    return () => {
      offState()
      offProps()
    }
  }
}

export {
  bindFindable,
  bindPanel,
  hiddenAttrs,
  type PanelBinding,
  stateAndRenders,
  supportsHiddenUntilFound,
}
