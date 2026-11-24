<!--
@component
An icon inside a command. Screen readers, typeahead and filtering skip
it, and `mirror` flips it in right-to-left text.
@stable
-->
<script lang="ts">
  import {
    command as commandPrimitive,
    type CommandItemIconProps,
    type CommandItemIconState,
  } from "@ui-sdk/core/command"
  import { useHandle } from "../instance"
  import ItemIcon from "../item-icon.svelte"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    ...rest
  }: PartProps<"span", CommandItemIconState> & CommandItemIconProps = $props()

  const command = useHandle(commandPrimitive)
</script>

<ItemIcon owner={command} partName="item-icon" {...rest} />
