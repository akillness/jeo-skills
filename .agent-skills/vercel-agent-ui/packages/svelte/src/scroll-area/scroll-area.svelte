<!--
@component
Groups the parts. The scrollbars are placed against it.
@stable
-->
<script lang="ts">
  import {
    scrollArea as scrollAreaPrimitive,
    type ScrollAreaController,
    type ScrollAreaState,
    type ScrollAreaType,
  } from "@ui-sdk/core/scroll-area"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    type,
    scrollHideDelay,
    stickToEnd,
    controller,
    debug,
    ...rest
  }: PartProps<"div", ScrollAreaState> & {
    /** When the scrollbars show: "auto" whenever the content overflows, "always", "scroll" while scrolling, and "hover" while scrolling or hovered. */
    type?: ScrollAreaType
    /** How long scrollbars stay after they stop being needed, in ms, with "scroll" and "hover". */
    scrollHideDelay?: number
    /** Keeps the end in view while the content grows, like a chat or streamed output. */
    stickToEnd?: boolean
    /** Drives it from anywhere. Create one with `createScrollAreaController()`. */
    controller?: ScrollAreaController
    /** Logs state changes. */
    debug?: boolean
  } = $props()

  const id = $props.id()
  const scrollArea = usePrimitive(scrollAreaPrimitive, () => ({
    id,
    type,
    scrollHideDelay,
    stickToEnd,
    controller,
    debug,
  }))
  provideInstance(scrollAreaPrimitive, scrollArea)
  const root = useHandlePart(scrollArea, "root")
</script>

<Part tag="div" part={root} props={rest} />
