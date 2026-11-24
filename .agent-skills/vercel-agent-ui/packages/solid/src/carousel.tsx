import {
  carousel as carouselPrimitive,
  type CarouselControlProps,
  type CarouselIndicatorGroupState,
  type CarouselIndicatorProps,
  type CarouselIndicatorState,
  type CarouselOptions,
  type CarouselPlayToggleState,
  type CarouselState,
  type CarouselStepState,
} from "@ui-sdk/core/carousel"
import {
  createContext,
  createUniqueId,
  merge,
  omit,
  Show,
  untrack,
  useContext,
} from "solid-js"
import { useControllerEntry, useControllerTarget } from "./controller-target"
import {
  createParts,
  renderStatic,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type CarouselContextValue = PrimitiveHandle<typeof carouselPrimitive>

// The carousel, for parts that may also connect from outside it through a controller.
const CarouselContext = createContext<CarouselContextValue | null>(null)

const parts = createParts(carouselPrimitive, {
  viewport: "div",
  content: "div",
  item: "div",
})

// The carousel a part belongs to: the one its `controller` drives, from
// anywhere on the page, or else the one it's inside. Reading it tracks the
// controller's carousel, which registers once it mounts.
function useConnectedCarousel(
  controller: () => CarouselControlProps["controller"]
) {
  return useControllerTarget(controller, useContext(CarouselContext))
}

/**
 * A region of slides that scroll a page at a time. Name it with `aria-label`.
 * @stable
 */
const Carousel = /* @__PURE__ */ rootScope(function Carousel(
  props: CarouselOptions & PartProps<"div", CarouselState>
) {
  const carousel = usePrimitive(carouselPrimitive, () => ({
    page: props.page,
    defaultPage: props.defaultPage,
    onPageChange: props.onPageChange,
    onPageChangeComplete: props.onPageChangeComplete,
    playing: props.playing,
    defaultPlaying: props.defaultPlaying,
    onPlayingChange: props.onPlayingChange,
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
  }))
  const rest = omit(
    props,
    "page",
    "defaultPage",
    "onPageChange",
    "onPageChangeComplete",
    "playing",
    "defaultPlaying",
    "onPlayingChange",
    "interval",
    "orientation",
    "align",
    "slidesPerPage",
    "loop",
    "skipSnaps",
    "dragFree",
    "drag",
    "controller",
    "debug"
  )
  useControllerEntry(() => props.controller, carousel)
  return (
    <CarouselContext value={carousel}>
      {usePart(carousel, "root", undefined, rest, "div")}
    </CarouselContext>
  )
})

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

type StepProps = Omit<
  PartProps<"button", CarouselStepState>,
  "value" | "defaultValue" | "onChange"
> &
  CarouselControlProps

// What a part outside its carousel renders with until that mounts.
const unconnected: CarouselStepState = { disabled: true }

// A plain button, for a part outside its carousel until that mounts.
function plainButton(props: Record<string, any>, state: object) {
  return renderStatic(
    "button",
    () => ({ attrs: {}, state }),
    merge(props, { type: "button" })
  )
}

function stepPart(name: "previous" | "next", props: StepProps) {
  const carousel = useConnectedCarousel(() => props.controller)
  const rest = omit(props, "controller")
  return (
    <Show when={carousel()} keyed fallback={plainButton(rest, unconnected)}>
      {(carousel) => usePart(carousel, name, undefined, rest, "button")}
    </Show>
  )
}

/**
 * Goes to the previous page. `aria-disabled` on the first page without `loop`, where it stays focusable.
 * @stable
 */
function CarouselPrevious(props: StepProps) {
  return stepPart("previous", props)
}

/**
 * Goes to the next page. `aria-disabled` on the last page without `loop`, where it stays focusable.
 * @stable
 */
function CarouselNext(props: StepProps) {
  return stepPart("next", props)
}

/**
 * The indicators, as a tablist with one tab stop. Its children can be a function of the state.
 * @stable
 */
function CarouselIndicatorGroup(
  props: PartProps<"div", CarouselIndicatorGroupState> & CarouselControlProps
) {
  const carousel = useConnectedCarousel(() => props.controller)
  const rest = omit(props, "controller")
  return (
    <Show
      when={carousel()}
      keyed
      fallback={renderStatic(
        "div",
        () => ({ attrs: {}, state: { page: 1, pageCount: null } }),
        rest
      )}
    >
      {(carousel) => (
        <CarouselContext value={carousel}>
          {usePart(carousel, "indicator-group", undefined, rest, "div")}
        </CarouselContext>
      )}
    </Show>
  )
}

type IndicatorProps = Omit<
  PartProps<"button", CarouselIndicatorState>,
  "value" | "defaultValue" | "onChange"
> &
  CarouselIndicatorProps

/**
 * Shows a page and goes to it. Indicators past the page count hide themselves.
 * @stable
 */
function CarouselIndicator(props: IndicatorProps) {
  const carousel = useContext(CarouselContext)
  const rest = omit(props, "page")
  // In a group outside its carousel, before that mounts, it's a plain button.
  if (!carousel) {
    return plainButton(rest, {
      page: untrack(() => props.page) ?? 0,
      selected: false,
    })
  }
  const id = createUniqueId()
  return usePart(
    carousel,
    "indicator",
    () => ({ id, page: props.page }),
    rest,
    "button"
  )
}

/**
 * Starts and stops rotation. Label it from `playing` in its state, as the carousel pattern asks.
 * @stable
 */
function CarouselPlayToggle(
  props: Omit<
    PartProps<"button", CarouselPlayToggleState>,
    "value" | "defaultValue" | "onChange"
  > &
    CarouselControlProps
) {
  const carousel = useConnectedCarousel(() => props.controller)
  const rest = omit(props, "controller")
  return (
    <Show
      when={carousel()}
      keyed
      fallback={plainButton(rest, { playing: false, paused: false })}
    >
      {(carousel) =>
        usePart(carousel, "play-toggle", undefined, rest, "button")
      }
    </Show>
  )
}

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
