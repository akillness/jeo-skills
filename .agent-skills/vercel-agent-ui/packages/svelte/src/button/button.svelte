<!--
@component
A button, or a link or any element that acts as one through `render`.
@stable
-->
<script lang="ts">
  import {
    button as buttonPrimitive,
    type ButtonActionDetails,
    type ButtonOptions,
    type ButtonState,
  } from "@ui-sdk/core/button"
  import Part from "../part.svelte"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  let {
    disabled,
    focusableWhenDisabled,
    type,
    pendingAnnouncement,
    debug,
    onclick,
    ...rest
  }: PartProps<"button", ButtonState, "type" | "onclick"> &
    ButtonOptions & {
      /**
       * Runs when the button is pressed. Return a Promise to make the button
       * pending until it settles: it gets `aria-busy`, `aria-disabled` and
       * `data-pending`, keeps focus, ignores presses meanwhile, so a form can't
       * submit twice, and says `pendingAnnouncement` after a second.
       * The event's element is whatever `render` renders, like a link.
       * `details.source` says how it was pressed, for changes made after an `await`.
       */
      onclick?: (event: MouseEvent, details: ButtonActionDetails) => unknown
    } = $props()

  const id = $props.id()
  const button = usePrimitive(buttonPrimitive, () => ({
    id,
    disabled,
    focusableWhenDisabled,
    type,
    pendingAnnouncement,
    debug,
    // The press runs the handler itself, so the button gets its Promise.
    action: (event, details) => onclick?.(event as MouseEvent, details),
  }))
  const root = useHandlePart(button, "root")
</script>

<Part tag="button" part={root} props={rest} />
