import type { ChangeDetails } from "@ui-sdk/core"
import {
  carousel as carouselPrimitive,
  type CarouselAlign,
  type CarouselController,
  type CarouselOrientation,
  type CarouselPageChangeReason,
  type CarouselPlayingChangeReason,
  type CarouselSlidesPerPage,
} from "@ui-sdk/core/carousel"
import { defineComponent, h, useId, type PropType } from "vue"
import {
  renderUnbound,
  useControllerEntry,
  useControllerTarget,
} from "./controller-target"
import { createParts, withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  type PrimitiveHandle,
  provideHandle,
  usePart,
  usePrimitive,
  useScope,
  type PartSlots,
} from "./use-primitive"

type CarouselContext = PrimitiveHandle<typeof carouselPrimitive>

const parts = createParts(carouselPrimitive, {
  viewport: "div",
  content: "div",
  item: "div",
})

/**
 * A region of slides that scroll a page at a time. Name it with `aria-label`.
 * @stable
 */
const Carousel = withElement(
  "div",
  defineComponent({
    name: "Carousel",
    inheritAttrs: false,
    props: {
      page: { type: Number, default: undefined },
      modelValue: { type: Number, default: undefined },
      defaultPage: { type: Number, default: undefined },
      playing: optionalBoolean,
      defaultPlaying: optionalBoolean,
      interval: { type: Number, default: undefined },
      orientation: String as PropType<CarouselOrientation>,
      align: String as PropType<CarouselAlign>,
      slidesPerPage: [Number, String] as PropType<CarouselSlidesPerPage>,
      loop: optionalBoolean,
      skipSnaps: optionalBoolean,
      dragFree: optionalBoolean,
      drag: optionalBoolean,
      controller: Object as PropType<CarouselController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:page": (_page: number) => true,
      "update:modelValue": (_page: number) => true,
      pageChange: (
        _page: number,
        _details: ChangeDetails<CarouselPageChangeReason>
      ) => true,
      pageChangeComplete: (_page: number) => true,
      "update:playing": (_playing: boolean) => true,
      playingChange: (
        _playing: boolean,
        _details: ChangeDetails<CarouselPlayingChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof carouselPrimitive, "root">,
    setup(props, { emit }) {
      const carousel = usePrimitive(carouselPrimitive, () => ({
        page: orModel(props.page, props.modelValue),
        defaultPage: props.defaultPage,
        playing: props.playing,
        defaultPlaying: props.defaultPlaying,
        interval: props.interval,
        orientation: props.orientation,
        align: props.align,
        slidesPerPage: props.slidesPerPage,
        loop: props.loop,
        skipSnaps: props.skipSnaps,
        dragFree: props.dragFree,
        drag: props.drag,
        controller: props.controller,
        debug: props.debug,
        // The change events run first, so canceling one also keeps v-model as it was.
        onPageChange: (
          page: number,
          details: ChangeDetails<CarouselPageChangeReason>
        ) => {
          emit("pageChange", page, details)
          if (details.canceled) {
            return
          }
          emit("update:page", page)
          emit("update:modelValue", page)
        },
        onPageChangeComplete: (page: number) =>
          emit("pageChangeComplete", page),
        onPlayingChange: (
          playing: boolean,
          details: ChangeDetails<CarouselPlayingChangeReason>
        ) => {
          emit("playingChange", playing, details)
          if (!details.canceled) {
            emit("update:playing", playing)
          }
        },
      }))
      useControllerEntry(() => props.controller, carousel)
      return usePart(carousel, "root")
    },
  })
)

/**
 * The scrolling window onto the slides. Touch, wheels and keys scroll it natively.
 * @stable
 */
const CarouselViewport = parts.Viewport

/**
 * The row, or column, of slides inside the viewport.
 * @stable
 */
const CarouselContent = parts.Content

/**
 * One slide. It's labelled "1 of 5" unless it has an `aria-label`, and inert while out of view.
 * @stable
 */
const CarouselItem = parts.Item

type ConnectedSlot = "previous" | "next" | "indicator-group" | "play-toggle"

// A part that also works outside its carousel, through `controller`. Until
// the carousel it names mounts, it renders as a plain element.
function connectedPart<S extends ConnectedSlot, Tag extends string>(
  name: string,
  slot: S,
  tag: Tag,
  unconnected: Record<string, unknown>
) {
  const Part = defineComponent({
    name: `${name}Part`,
    inheritAttrs: false,
    props: {
      carousel: { type: Object as PropType<CarouselContext>, required: true },
    },
    setup(props) {
      provideHandle(props.carousel)
      return usePart(props.carousel, slot, undefined, undefined, tag)
    },
  })
  return withElement(
    tag,
    defineComponent({
      name,
      inheritAttrs: false,
      props: { controller: Object as PropType<CarouselController> },
      slots: Object as PartSlots<typeof carouselPrimitive, S>,
      setup(props, { slots, attrs }) {
        const connected = useControllerTarget(
          carouselPrimitive,
          () => props.controller
        )
        return () => {
          const carousel = connected()
          if (!carousel) {
            const plain =
              tag === "button" ? { type: "button", ...attrs } : attrs
            return renderUnbound(tag, plain, { slots, state: unconnected })
          }
          // A new carousel needs a new part, bound to its instance.
          return h(
            Part,
            { carousel, key: carousel.instance.id, ...attrs },
            slots
          )
        }
      },
    })
  )
}

/**
 * Goes to the previous page. `aria-disabled` on the first page without `loop`, where it stays focusable.
 * @stable
 */
const CarouselPrevious = connectedPart(
  "CarouselPrevious",
  "previous",
  "button",
  { disabled: true }
)

/**
 * Goes to the next page. `aria-disabled` on the last page without `loop`, where it stays focusable.
 * @stable
 */
const CarouselNext = connectedPart("CarouselNext", "next", "button", {
  disabled: true,
})

/**
 * The indicators, as a tablist with one tab stop. Its default slot gets `{ state }` with `pageCount`.
 * @stable
 */
const CarouselIndicatorGroup = connectedPart(
  "CarouselIndicatorGroup",
  "indicator-group",
  "div",
  {
    page: 1,
    pageCount: null,
  }
)

/**
 * Starts and stops rotation. Label it from `playing` in its slot state, as the carousel pattern asks.
 * @stable
 */
const CarouselPlayToggle = connectedPart(
  "CarouselPlayToggle",
  "play-toggle",
  "button",
  {
    playing: false,
    paused: false,
  }
)

/**
 * Shows a page and goes to it. Indicators past the page count hide themselves.
 * @stable
 */
const CarouselIndicator = withElement(
  "button",
  defineComponent({
    name: "CarouselIndicator",
    inheritAttrs: false,
    props: { page: { type: Number, default: undefined } },
    slots: Object as PartSlots<typeof carouselPrimitive, "indicator">,
    setup(props, { slots, attrs }) {
      const carousel = useScope(carouselPrimitive)?.handle
      // In a group outside its carousel, before that mounts, it's a plain button.
      if (!carousel) {
        const unconnected = { page: props.page ?? 0, selected: false }
        return () =>
          renderUnbound(
            "button",
            { type: "button", ...attrs },
            { slots, state: unconnected }
          )
      }
      const id = useId()
      return usePart(
        carousel,
        "indicator",
        () => ({ id, page: props.page }),
        undefined,
        "button"
      )
    },
  })
)

export { createCarouselController } from "@ui-sdk/core/carousel"
export type {
  CarouselAlign,
  CarouselApi,
  CarouselContentState,
  CarouselControlProps,
  CarouselController,
  CarouselIndicatorGroupState,
  CarouselIndicatorProps,
  CarouselIndicatorState,
  CarouselItemState,
  CarouselNextState,
  CarouselOptions,
  CarouselOrientation,
  CarouselPageChangeReason,
  CarouselPageOptions,
  CarouselPlayToggleState,
  CarouselPlayingChangeReason,
  CarouselPlayingOptions,
  CarouselPreviousState,
  CarouselPrimitive,
  CarouselSlidesPerPage,
  CarouselState,
  CarouselStepState,
  CarouselViewportState,
} from "@ui-sdk/core/carousel"

export {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPlayToggle,
  CarouselPrevious,
  CarouselViewport,
}
