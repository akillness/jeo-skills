<!--
@component
A button that stays pressed. Inside a ToggleGroup, the group decides whether it's pressed.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    toggle as togglePrimitive,
    type ToggleController,
    type TogglePressedChangeReason,
    type ToggleState,
  } from "@ui-sdk/core/toggle"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import { useToolbarScope } from "../toolbar-context"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { useToggleGroup } from "./context"

  type Details = ChangeDetails<TogglePressedChangeReason>

  let {
    pressed = $bindable(),
    defaultPressed,
    value,
    disabled,
    focusableWhenDisabled,
    controller,
    debug,
    onPressedChange,
    ...rest
  }: PartProps<"button", ToggleState> & {
    /** Whether it's pressed. Bind it with `bind:pressed` to control the toggle. Inside a group, the group's value decides. */
    pressed?: boolean
    /** Whether it's pressed at first, when uncontrolled. */
    defaultPressed?: boolean
    /** Identifies the toggle inside a group, whose value lists the pressed toggles' values. Defaults to a generated id. */
    value?: string
    /** Stops presses. Alone, the toggle is natively disabled, unless `focusableWhenDisabled` is set. Inside a group or a toolbar, it stays focusable with `aria-disabled`, so arrow keys still reach it. */
    disabled?: boolean
    /** Keeps a disabled toggle in the tab order with `aria-disabled` instead of the native attribute. Toggles in a group or a toolbar always are. */
    focusableWhenDisabled?: boolean
    /** Presses it from anywhere. Create one with `createToggleController()`. */
    controller?: ToggleController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when a press wants to change it. `details.reason` says why, and `details.cancel()` stops it. Inside a group, it runs before the group's `onValueChange`, and canceling it cancels the group's change too. */
    onPressedChange?: (pressed: boolean, details: Details) => void
  } = $props()

  const id = $props.id()
  const group = useToggleGroup()
  const toolbar = useToolbarScope()
  const toggle = usePrimitive(togglePrimitive, () => ({
    id,
    get pressed() {
      return pressed
    },
    defaultPressed,
    value,
    disabled,
    focusableWhenDisabled,
    group: group ? () => group.api : undefined,
    toolbar: toolbar(),
    controller,
    debug,
    onPressedChange: (next: boolean, details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `pressed` as it was.
      onPressedChange?.(next, details)
      if (!details.canceled) {
        pressed = next
      }
    },
  }))
  provideInstance(togglePrimitive, toggle)
  const root = useHandlePart(toggle, "root")
</script>

<Part tag="button" part={root} props={rest} />
