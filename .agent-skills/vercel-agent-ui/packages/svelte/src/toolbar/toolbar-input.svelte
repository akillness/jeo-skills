<!--
@component
A text field. Arrows move its caret, and leave it only from the end they point at.
@stable
-->
<script lang="ts">
  import type {
    ToolbarInputProps,
    ToolbarInputState,
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
  }: PartProps<"input", ToolbarInputState> & ToolbarInputProps = $props()

  const id = $props.id()
  const groupDisabled =
    getContext<(() => boolean) | undefined>(ToolbarGroupKey) ?? (() => false)
  const input = useHandlePart(useToolbar(), "input", () => ({
    id,
    disabled,
    focusableWhenDisabled,
    groupDisabled: groupDisabled(),
  }))
</script>

<Part tag="input" part={input} props={rest} />
