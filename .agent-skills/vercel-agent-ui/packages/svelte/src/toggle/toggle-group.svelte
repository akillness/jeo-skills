<!--
@component
Toggles that share one value, with one tab stop and arrow keys between them.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    toggleGroup as toggleGroupPrimitive,
    type ToggleGroupController,
    type ToggleGroupOrientation,
    type ToggleGroupState,
    type ToggleGroupValueChangeReason,
  } from "@ui-sdk/core/toggle"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useToolbarScope } from "../toolbar-context"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"
  import { ToggleGroupKey } from "./context"

  type Details = ChangeDetails<ToggleGroupValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    multiple,
    deselectable,
    disabled,
    orientation,
    loop,
    controller,
    debug,
    onValueChange,
    ...rest
  }: PartProps<"div", ToggleGroupState> & {
    /** The pressed toggles' values. Bind it with `bind:value` to control the group. */
    value?: string[]
    /** The toggles pressed at first, when uncontrolled. */
    defaultValue?: string[]
    /** Whether several toggles can be pressed at once. Otherwise pressing one unpresses the others. */
    multiple?: boolean
    /** Whether the pressed toggle can be unpressed when only one may be pressed. With `false`, one toggle stays pressed once any is. Ignored with `multiple`. */
    deselectable?: boolean
    /** Stops every toggle from being pressed. They stay focusable with `aria-disabled`, so the group keeps its tab stop and stays discoverable. */
    disabled?: boolean
    /** Which arrow keys move between toggles: left and right, or up and down. */
    orientation?: ToggleGroupOrientation
    /** Whether arrow keys wrap from the last toggle to the first. */
    loop?: boolean
    /** Presses toggles from anywhere. Create one with `createToggleGroupController()`. */
    controller?: ToggleGroupController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when a toggle wants to be pressed or unpressed. `details.reason` says why, and `details.cancel()` stops it. */
    onValueChange?: (value: string[], details: Details) => void
  } = $props()

  const id = $props.id()
  const toolbar = useToolbarScope()
  const group = usePrimitive(toggleGroupPrimitive, () => ({
    id,
    toolbar: toolbar(),
    get value() {
      return value
    },
    defaultValue,
    multiple,
    deselectable,
    disabled,
    orientation,
    loop,
    controller,
    debug,
    onValueChange: (next: string[], details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  setContext(ToggleGroupKey, group)
  const root = useHandlePart(group, "group")
</script>

<Part tag="div" part={root} props={rest} />
