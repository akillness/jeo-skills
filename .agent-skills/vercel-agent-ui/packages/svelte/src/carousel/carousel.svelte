<!--
@component
A region of slides that scroll a page at a time. Name it with `aria-label`.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    carousel as carouselPrimitive,
    type CarouselAlign,
    type CarouselController,
    type CarouselOrientation,
    type CarouselPageChangeReason,
    type CarouselPlayingChangeReason,
    type CarouselSlidesPerPage,
    type CarouselState,
  } from "@ui-sdk/core/carousel"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import { useControllerEntry } from "../popup.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  type PageDetails = ChangeDetails<CarouselPageChangeReason>
  type PlayingDetails = ChangeDetails<CarouselPlayingChangeReason>

  let {
    page = $bindable(),
    defaultPage,
    playing = $bindable(),
    defaultPlaying,
    interval,
    orientation,
    align,
    slidesPerPage,
    loop,
    skipSnaps,
    dragFree,
    drag,
    controller,
    debug,
    onPageChange,
    onPageChangeComplete,
    onPlayingChange,
    ...rest
  }: PartProps<"div", CarouselState> & {
    /** The current page, from 1. Bind it with `bind:page` to control the carousel. */
    page?: number
    /** The page it starts on, from 1, when uncontrolled. */
    defaultPage?: number
    /** Whether it rotates through the pages on its own. Bind it with `bind:playing` to control rotation. */
    playing?: boolean
    /** Whether it starts rotating, when uncontrolled. It doesn't when the user prefers reduced motion. */
    defaultPlaying?: boolean
    /** How long each page shows while rotating, in ms. */
    interval?: number
    /** Which way the slides scroll, and which arrow keys page. */
    orientation?: CarouselOrientation
    /** Where a page lines up in the viewport. */
    align?: CarouselAlign
    /** How many slides one page holds. `"auto"` fits as many as the viewport shows. */
    slidesPerPage?: CarouselSlidesPerPage
    /** Whether the slides go round: Next on the last page goes to the first. */
    loop?: boolean
    /** Whether a fast swipe can pass over pages. */
    skipSnaps?: boolean
    /** Whether swipes and drags coast to wherever they stop instead of a page. */
    dragFree?: boolean
    /** Whether swiping, dragging and scrolling move the slides. */
    drag?: boolean
    /** Pages the carousel from anywhere, and connects parts outside it. Create one with `createCarouselController()`. */
    controller?: CarouselController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when the page wants to change. `details.reason` says why, and `details.cancel()` stays on the page. */
    onPageChange?: (page: number, details: PageDetails) => void
    /** Runs once the slides come to rest on a page, after a spring, a drag or a scroll. */
    onPageChangeComplete?: (page: number) => void
    /** Runs when rotation wants to start or stop. */
    onPlayingChange?: (playing: boolean, details: PlayingDetails) => void
  } = $props()

  const id = $props.id()
  const carousel = usePrimitive(carouselPrimitive, () => ({
    id,
    get page() {
      return page
    },
    defaultPage,
    get playing() {
      return playing
    },
    defaultPlaying,
    interval,
    orientation,
    align,
    slidesPerPage,
    loop,
    skipSnaps,
    dragFree,
    drag,
    controller,
    debug,
    // The callbacks run first, so canceling there also keeps a bound value as it was.
    onPageChange: (next: number, details: PageDetails) => {
      onPageChange?.(next, details)
      if (!details.canceled) {
        page = next
      }
    },
    onPageChangeComplete,
    onPlayingChange: (next: boolean, details: PlayingDetails) => {
      onPlayingChange?.(next, details)
      if (!details.canceled) {
        playing = next
      }
    },
  }))
  useControllerEntry(() => controller, carousel)
  provideInstance(carouselPrimitive, carousel)
  const root = useHandlePart(carousel, "root")
</script>

<Part tag="div" part={root} props={rest} />
