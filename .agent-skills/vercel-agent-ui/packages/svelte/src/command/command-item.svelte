<!--
@component
A command. Pressing it, or Enter while it's highlighted, runs it, with its `value` passed to the command's
`onAction`.
@stable
-->
<script lang="ts">
  import {
    command as commandPrimitive,
    type CommandItemProps,
    type CommandItemState,
  } from "@ui-sdk/core/command"
  import { getContext, setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import {
    DataKey,
    GroupKey,
    ItemKey,
    ItemShortcutKey,
    PageKey,
    type ItemContext,
    type ItemShortcutContext,
    type PageContext,
  } from "./context"

  let {
    value,
    label,
    keywords,
    disabled,
    shortcut,
    page,
    index,
    onSelect,
    ...rest
  }: PartProps<"div", CommandItemState> & CommandItemProps = $props()

  const command = useHandle(commandPrimitive)
  const generated = $props.id()
  const group = getContext<string | undefined>(GroupKey)
  // The page the command is on, `null` on the first page, and undefined outside any page.
  const inPage = getContext<PageContext | undefined>(PageKey)
  const data = getContext<boolean | undefined>(DataKey) ?? false
  setContext<ItemShortcutContext>(ItemShortcutKey, () => shortcut)
  setContext<ItemContext>(ItemKey, () => ({
    key: value ?? generated,
    label: label ?? value,
  }))
  const item = useHandlePart(command, "item", () => {
    const key = value ?? generated
    return {
      id: key,
      value: key,
      label,
      keywords,
      disabled,
      shortcut,
      page,
      index,
      onSelect,
      group,
      inPage: inPage?.(),
      data,
    }
  })
</script>

{#if item.present}
  <Part tag="div" part={item} props={rest} />
{/if}
