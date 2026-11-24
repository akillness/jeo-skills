import type { Primitive, PropsOf, SlotName } from "@ui-sdk/core"
import { portalTarget } from "@ui-sdk/core/renderer"
import { Portal, type JSX } from "@solidjs/web"
import { createContext, createMemo, Show, useContext } from "solid-js"
import { usePart, type PrimitiveHandle } from "./use-primitive"

// Where a popup renders: an element or fragment, or nothing to render in place.
type PopupContainer = Element | DocumentFragment | null | undefined

// The container the nearest popup above renders into. Popups inside it render
// there too, like a menu inside a portaled popover, unless they name their own.
const InheritedContainer = createContext<() => PopupContainer>(() => undefined)

// A getter for a popup's container: its own, else the one the popup around it renders into.
function usePopupContainer(own: () => PopupContainer) {
  const inherited = useContext(InheritedContainer)
  return () => own() ?? inherited()
}

// Renders a popup in place, in the top layer, or into its container. Without
// top layer support, it goes to the body. Popups inside inherit the container.
function renderPopup(
  element: () => JSX.Element,
  container: () => PopupContainer,
  inline?: () => boolean | undefined
) {
  const target = createMemo(() =>
    inline?.() ? null : portalTarget(container())
  )
  const content = () => (
    <InheritedContainer value={container}>{element()}</InheritedContainer>
  )
  return (
    <Show when={target()} fallback={content()}>
      {(mount) => <Portal mount={mount() as Element}>{content()}</Portal>}
    </Show>
  )
}

/**
 * A popup's part, like its content or backdrop, rendered into its container
 * while its slot is present, inside `viewport` when given. Presence is checked
 * before the popup renders, so a closed popup mounts no portal.
 */
function popupPart<P extends Primitive, S extends SlotName<P>>(
  popup: PrimitiveHandle<P>,
  slot: S,
  part: () => PropsOf<P, S>,
  props: Record<string, any>,
  container: () => PopupContainer,
  viewport?: typeof sheetViewport,
  inline?: () => boolean | undefined
) {
  const element = () => usePart(popup, slot, part, props, "div")
  return (
    <Show when={popup.present(slot, part)}>
      {renderPopup(
        viewport ? () => viewport(popup, element) : element,
        container,
        inline
      )}
    </Show>
  )
}

/**
 * Wraps a popup's content in the full-screen viewport a sheet sits in, while
 * its `viewport` slot is present: always for a drawer, and for a popup while
 * it presents as a sheet. The viewport is what goes into the top layer. Its
 * attributes are a subset of the content's, so the content's render keeps it current.
 */
function sheetViewport(
  popup: PrimitiveHandle<Primitive>,
  element: () => JSX.Element
) {
  const viewport = popup.slot("viewport")
  return (
    <Show when={popup.present("viewport")} fallback={element()}>
      <div {...viewport}>{element()}</div>
    </Show>
  )
}

export { useControllerEntry, useControllerTarget } from "./controller-target"

export {
  type PopupContainer,
  popupPart,
  renderPopup,
  sheetViewport,
  usePopupContainer,
}
