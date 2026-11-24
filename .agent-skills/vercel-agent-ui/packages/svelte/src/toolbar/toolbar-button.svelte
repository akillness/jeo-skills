<!--
@component
A button in the toolbar. Arrow keys move between it and the toolbar's other items.
@stable
-->
<script lang="ts">
  import type {
    ToolbarButtonProps,
    ToolbarButtonState,
  } from "@ui-sdk/core/toolbar"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { ToolbarGroupKey } from "../toolbar-context"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useToolbar } from "./context"

  let {
    disabled,
    focusableWhenDisabled,
    ...rest
  }: PartProps<"button", ToolbarButtonState> & ToolbarButtonProps = $props()

  const id = $props.id()
  const groupDisabled =
    getContext<(() => boolean) | undefined>(ToolbarGroupKey) ?? (() => false)
  const button = useHandlePart(useToolbar(), "button", () => ({
    id,
    disabled,
    focusableWhenDisabled,
    groupDisabled: groupDisabled(),
  }))
</script>

<Part tag="button" part={button} props={rest} />
