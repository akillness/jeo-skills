import {
  scrollArea,
  type ScrollAreaScrollbarProps,
  type ScrollAreaScrollbarState,
  type ScrollAreaThumbState,
} from "@ui-sdk/core/scroll-area"
import * as React from "react"
import { createParts, usePart, type PartProps } from "./use-primitive"

const parts = createParts(scrollArea, {
  root: "div",
  viewport: "div",
  content: "div",
  corner: "div",
  "scroll-to-end": "button",
})

// The scrollbar a thumb sits in.
const OrientationContext = React.createContext<"vertical" | "horizontal">(
  "vertical"
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

// A scrollbar and its thumb are told apart by their orientation.

/**
 * A scrollbar for one axis, over the viewport's edge.
 * @stable
 */
function ScrollAreaScrollbar({
  orientation = "vertical",
  ...props
}: ScrollAreaScrollbarProps & PartProps<"div", ScrollAreaScrollbarState>) {
  return (
    <OrientationContext.Provider value={orientation}>
      {usePart(
        scrollArea,
        "scrollbar",
        { id: orientation, orientation },
        props
      )}
    </OrientationContext.Provider>
  )
}

/**
 * The part of the scrollbar that shows where the view is, and drags.
 * @stable
 */
function ScrollAreaThumb(props: PartProps<"div", ScrollAreaThumbState>) {
  const orientation = React.useContext(OrientationContext)
  return usePart(scrollArea, "thumb", { id: orientation, orientation }, props)
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
