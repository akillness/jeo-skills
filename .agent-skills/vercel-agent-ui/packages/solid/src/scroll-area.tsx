import {
  scrollArea,
  type ScrollAreaScrollbarProps,
  type ScrollAreaScrollbarState,
  type ScrollAreaThumbState,
} from "@ui-sdk/core/scroll-area"
import { createContext, omit, useContext } from "solid-js"
import { createParts, usePart, type PartProps } from "./use-primitive"

const parts = createParts(scrollArea, {
  root: "div",
  viewport: "div",
  content: "div",
  corner: "div",
  "scroll-to-end": "button",
})

// The scrollbar a thumb sits in.
const OrientationContext = createContext<() => "vertical" | "horizontal">(
  () => "vertical"
)

/**
 * Groups the parts. The scrollbars are placed against it.
 * @stable
 */
const ScrollArea = parts.Root

/**
 * The native scroller. Keyboard, wheel, touch, find in page and screen readers scroll it.
 * @stable
 */
const ScrollAreaViewport = parts.Viewport

/**
 * Wraps the content inside the viewport.
 * @stable
 */
const ScrollAreaContent = parts.Content

// A scrollbar and its thumb are keyed by their orientation, so the two scrollbars stay apart.
const keyedBy = (orientation: () => "vertical" | "horizontal") => () => ({
  id: orientation(),
  orientation: orientation(),
})

/**
 * A scrollbar for one axis, over the viewport's edge.
 * @stable
 */
function ScrollAreaScrollbar(
  props: ScrollAreaScrollbarProps & PartProps<"div", ScrollAreaScrollbarState>
) {
  const orientation = () => props.orientation ?? "vertical"
  const rest = omit(props, "orientation")
  return (
    <OrientationContext value={orientation}>
      {usePart(scrollArea, "scrollbar", keyedBy(orientation), rest, "div")}
    </OrientationContext>
  )
}

/**
 * The part of the scrollbar that shows where the view is, and drags.
 * @stable
 */
function ScrollAreaThumb(props: PartProps<"div", ScrollAreaThumbState>) {
  return usePart(
    scrollArea,
    "thumb",
    keyedBy(useContext(OrientationContext)),
    props,
    "div"
  )
}

/**
 * Where the two scrollbars meet.
 * @stable
 */
const ScrollAreaCorner = parts.Corner

/**
 * A button that scrolls to the end, like "Jump to latest". Name it with its content.
 * @stable
 */
const ScrollAreaScrollToEnd = parts.ScrollToEnd

export { createScrollAreaController } from "@ui-sdk/core/scroll-area"
export type {
  ScrollAreaController,
  ScrollAreaOptions,
  ScrollAreaPrimitive,
  ScrollAreaScrollOptions,
  ScrollAreaScrollToEndState,
  ScrollAreaScrollbarProps,
  ScrollAreaScrollbarState,
  ScrollAreaState,
  ScrollAreaThumbState,
  ScrollAreaType,
} from "@ui-sdk/core/scroll-area"

export {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaCorner,
  ScrollAreaScrollbar,
  ScrollAreaScrollToEnd,
  ScrollAreaThumb,
  ScrollAreaViewport,
}
