// A popup presented as a sheet: `attachSheet` on the content, inside the
// full-screen viewport the adapter renders around it, which goes into the top
// layer instead of the content. The popup keeps its role, keyboard model,
// focus and dismissal; the sheet adds the motion, a swipe to dismiss and the
// dim, which is the viewport's own `::backdrop` unless the popup has a
// backdrop part. `createPresentation` loads this module when it's needed.
import type { SnapPoint } from "../motion/snap-points"
import { on } from "../kernel/events"
import { setStyle, writeStyle } from "../platform/style"
import type { Layer } from "../platform/layers"
import type { Popup } from "./popup"
import type { SheetConfig } from "./presentation"
import { attachSheet, parentSheet, sheetLayers, type Sheet } from "./sheet"
import { prepareVariables } from "./sheet-effects"

// The dim is the viewport's `::backdrop`: black at 0.2, like iOS, unless the
// content sets `--sheet-backdrop`. It takes presses, so one on the dim is an
// outside press and never reaches the page. In its own cascade layer, so any
// author style wins.
function styleBackdrop(host: HTMLElement) {
  const slot = host.getAttribute("data-slot")
  if (!slot) {
    return
  }
  writeStyle(
    host.ownerDocument,
    `ui-sdk-sheet-${slot}`,
    `@layer ui-sdk { :where([data-slot="${slot}"])::backdrop { background: var(--sheet-backdrop, rgb(0 0 0 / 0.2)); pointer-events: auto } }`
  )
}

function isolate(container: Element, keep: (Element | undefined)[]) {
  const restores: (() => void)[] = []
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (keep.includes(child)) {
        continue
      }
      if (keep.some((el) => el && child.contains(el))) {
        walk(child)
      } else if (child instanceof HTMLElement) {
        restores.push(setStyle(child, "display", "none"))
      }
    }
  }
  walk(container)
  return () => restores.forEach((restore) => restore())
}

function drillIn(el: HTMLElement, popup: Popup, config: SheetConfig) {
  let restore: (() => void) | undefined
  const unbind = popup.bind(el, {
    ...config,
    position: undefined,
    inline: true,
    onShow() {
      const [parent, trigger] = config.drillIn!()
      if (parent) {
        restore = isolate(parent, [el, trigger])
      }
      return () => restore?.()
    },
    onClose() {
      restore?.()
      restore = setStyle(el, "display", "none")
    },
  })
  return () => {
    unbind()
    restore?.()
  }
}

// The sheet attaches as the popup shows and lets go once it has hidden, so a
// list kept in the page while closed, like a select's, is a plain hidden
// element in its viewport, never a screen-wide layer.
function presentSheet(el: HTMLElement, popup: Popup, config: SheetConfig) {
  if (config.drillIn) {
    return drillIn(el, popup, config)
  }
  const host = el.parentElement
  if (!host) {
    return
  }
  styleBackdrop(host)
  let sheet: Sheet | undefined
  return popup.bind(el, {
    ...config,
    position: undefined,
    host: () => host,
    onShow(layer) {
      const shown = showSheet(el, host, popup, config, layer)
      sheet = shown.sheet
      return () => {
        shown.hide()
        sheet = undefined
      }
    },
    onClose: () => sheet?.close(),
  })
}

function showSheet(
  el: HTMLElement,
  host: HTMLElement,
  popup: Popup,
  config: SheetConfig,
  layer: Layer
) {
  let rest: SnapPoint | null = null
  const stackedOn = parentSheet(layer)
  const dimsHost = !config.backdrop?.()
  const sheet = attachSheet(el, {
    host,
    snapPoints: () => config.snapPoints ?? ["content"],
    snapPoint: () => rest,
    backdrop: config.backdrop,
    hostBackdrop: dimsHost,
    dismissible: config.dismissible,
    onDismissAttempt: config.onDismissAttempt,
    parent: () => stackedOn?.(),
    onSnap: (point) => (rest = point),
    onDismiss(event) {
      popup.requestClose("swipe", event)
      requestAnimationFrame(() => {
        const point = rest ?? sheet.snapPoints()[0]?.value
        if (layer.active() && point !== undefined) {
          sheet.snapTo(point, "imperative")
        }
      })
    },
  })
  sheetLayers.set(layer, () => sheet)
  config.onSheet?.(sheet)
  const offGrow = on(el, "focusin", (event) => {
    const largest = sheet.snapPoints().at(-1)
    if (
      largest &&
      sheet.snapPoints().length > 1 &&
      (event.target as Element).matches("input, textarea")
    ) {
      sheet.snapTo(largest.value, "imperative")
    }
  })
  const color = dimsHost
    ? getComputedStyle(el).getPropertyValue("--sheet-backdrop")
    : "transparent"
  if (color) {
    host.style.setProperty("--sheet-backdrop", color)
  }
  if (layer.active()) {
    sheet.open(popup.opener() !== "initial")
  }
  return {
    sheet,
    hide() {
      offGrow()
      sheetLayers.delete(layer)
      sheet.destroy()
      config.onSheet?.(undefined)
      host.style.removeProperty("--sheet-backdrop")
    },
  }
}

export { prepareVariables, presentSheet }
