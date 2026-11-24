import { scrollArea } from "@ui-sdk/core/scroll-area"
import {
  computed,
  defineComponent,
  inject,
  provide,
  type InjectionKey,
  type PropType,
} from "vue"
import { createParts, withElement } from "./create-parts"
import { usePart, type PartSlots } from "./use-primitive"

type Orientation = "vertical" | "horizontal"

// The scrollbar a thumb sits in.
const OrientationKey: InjectionKey<() => Orientation> = Symbol(
  "scroll-area-orientation"
)

const parts = createParts(scrollArea, {
  root: "div",
  viewport: "div",
  content: "div",
  corner: "div",
  "scroll-to-end": "button",
})

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

/**
 * A scrollbar for one axis, over the viewport's edge.
 * @stable
 */
const ScrollAreaScrollbar = withElement(
  "div",
  defineComponent({
    name: "ScrollAreaScrollbar",
    inheritAttrs: false,
    props: {
      orientation: {
        type: String as PropType<Orientation>,
        default: "vertical",
      },
    },
    slots: Object as PartSlots<typeof scrollArea, "scrollbar">,
    setup(props) {
      // Keyed by its orientation, so the two scrollbars are parts of their own.
      const scrollbar = computed(() => ({
        id: props.orientation,
        orientation: props.orientation,
      }))
      provide(OrientationKey, () => props.orientation)
      return usePart(scrollArea, "scrollbar", () => scrollbar.value)
    },
  })
)

/**
 * The part of the scrollbar that shows where the view is, and drags.
 * @stable
 */
const ScrollAreaThumb = withElement(
  "div",
  defineComponent({
    name: "ScrollAreaThumb",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof scrollArea, "thumb">,
    setup() {
      const orientation = inject(
        OrientationKey,
        () => "vertical" as Orientation
      )
      const thumb = computed(() => ({
        id: orientation(),
        orientation: orientation(),
      }))
      return usePart(scrollArea, "thumb", () => thumb.value)
    },
  })
)

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
