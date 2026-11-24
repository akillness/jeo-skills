import { attrs, portalTarget, present } from "@ui-sdk/core/renderer"
import {
  findContainer,
  inheritedPortal,
  instanceOf,
  passPortalOn,
} from "./define-element"
// Popups render into the element `container="#id"` names, on the content or
// its owner, as React and Vue take it on either. Without one, a popup inside a
// portaled popup renders into that popup's container, and any other renders
// in place. Submenus move with their root.
const popupPortal = {
  slots: ["content"],
  container: (el: HTMLElement, part?: { slot: string; el?: HTMLElement }) => {
    const own =
      part?.slot === "content"
        ? (part.el?.getAttribute("container") ?? null)
        : null
    const selector = own ?? el.getAttribute("container")
    return selector ? findContainer(el, selector) : inheritedPortal(el)
  },
}

const viewports = new WeakMap<HTMLElement, HTMLElement>()

// A popup presented as a sheet sits in a full-screen viewport, so its content
// moves into one as it opens, and back in place once it's closed. The
// viewport goes where the content would have: into its container, or in place
// inside the owner. Pass the viewport's tag, like "ui-popover-viewport", and
// the slots that portal, like a dialog's backdrop and content.
function sheetPortal(viewportTag: string, slots = popupPortal.slots) {
  return {
    slots,
    container(
      el: HTMLElement,
      part: { slot: string; el?: HTMLElement; props: Record<string, unknown> }
    ) {
      const target = popupPortal.container(el, part)
      const instance = instanceOf(el)
      if (
        !instance ||
        attrs(instance.part(part.slot, part.props))["data-presentation"] !==
          "sheet"
      ) {
        return target
      }
      let viewport = viewports.get(el)
      if (!viewport) {
        const created = el.ownerDocument.createElement(viewportTag)
        created.setAttribute(
          "data-slot",
          attrs(instance.part("viewport", {}))["data-slot"] ?? ""
        )
        // An owner taken off the page while open empties it without hiding it,
        // so it would stay in the top layer, dimming the page.
        new MutationObserver(
          () => created.hasChildNodes() || created.remove()
        ).observe(created, {
          childList: true,
        })
        viewports.set(el, created)
        viewport = created
      }
      const container = portalTarget(target)
      const parent = container ?? el
      if (viewport.parentNode !== parent) {
        parent.append(viewport)
      }
      // Popups inside the sheet render where it would have: inside it in place, else in its container.
      passPortalOn(viewport, container)
      return viewport
    },
  }
}

const headers = new WeakMap<HTMLElement, HTMLElement>()

// A list with an input, like a combobox's: presented as a sheet, its content
// moves into a viewport, and its input into a header at the top of the
// content, then back in place once the list has closed.
function sheetInputPortal(viewportTag: string) {
  const sheet = sheetPortal(viewportTag)
  return {
    slots: [...sheet.slots, "input"],
    container(
      el: HTMLElement,
      part: { slot: string; el?: HTMLElement; props: Record<string, unknown> }
    ) {
      if (part.slot !== "input") {
        return sheet.container(el, part)
      }
      const instance = instanceOf<{
        internal: { contentElement?: () => HTMLElement | undefined }
      }>(el)
      const header = headers.get(el)
      const parent = part.el?.parentElement ?? null
      const content =
        instance &&
        present(instance.part("header", {})) &&
        instance.api.internal.contentElement?.()
      if (!instance || !content) {
        // Back in place, and the header goes with the sheet.
        header?.remove()
        return parent === header ? null : parent
      }
      const target = header ?? el.ownerDocument.createElement("div")
      if (!header) {
        target.setAttribute(
          "data-slot",
          attrs(instance.part("header", {}))["data-slot"] ?? ""
        )
        headers.set(el, target)
      }
      if (target.parentElement !== content) {
        content.prepend(target)
      }
      return target
    },
  }
}

// A popup and its content name their container with a selector,
// `container="#id"`, since an attribute can't hold an element. `portal`
// reads it, so the core never needs it.
const popupKinds = { container: "string" } as const

// The controller every popup element exposes as its `api` property.
const popupApi: (
  "isOpen" | "setOpen" | "open" | "close" | "toggle" | "getPayload" | "focus"
)[] = ["isOpen", "setOpen", "open", "close", "toggle", "getPayload", "focus"]

// The live `open` property, and the `open` attribute.
const popupState = {
  open: {
    get: (api: { isOpen: () => boolean }) => api.isOpen(),
    set: (api: { setOpen: (open: boolean) => void }, open: boolean) =>
      api.setOpen(!!open),
  },
}

// Where `closeOnOutsidePress` starts, as the core decides it: on while the popup is modal.
const closesOnOutsidePress = (el: HTMLElement) =>
  el.getAttribute("modal") !== "false"

// A popup's title is the heading, like the h2 other frameworks render, unless
// it wraps a heading of its own, which would be a heading in a heading.
function renderPopupTitle(el: HTMLElement) {
  if (el.hasAttribute("as-child") || el.hasAttribute("role")) {
    return
  }
  if (el.querySelector("h1, h2, h3, h4, h5, h6, [role=heading]")) {
    return
  }
  el.setAttribute("role", "heading")
  el.setAttribute("aria-level", "2")
}

export {
  closesOnOutsidePress,
  popupApi,
  popupKinds,
  popupPortal,
  popupState,
  renderPopupTitle,
  sheetInputPortal,
  sheetPortal,
}
