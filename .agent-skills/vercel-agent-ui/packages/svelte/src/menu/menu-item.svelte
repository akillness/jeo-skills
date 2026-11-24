<!--
@component
An action. Pressing it runs its `onSelect` and closes the menu, unless `closeOnSelect` is false.
@stable
-->
<script lang="ts">
  import { formatShortcut } from "@ui-sdk/core"
  import {
    menu as menuPrimitive,
    type MenuItemProps,
    type MenuItemState,
  } from "@ui-sdk/core/menu"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import MenuShortcut from "./menu-shortcut.svelte"

  let {
    value,
    label,
    disabled,
    shortcut,
    closeOnSelect,
    destructive,
    onSelect,
    children,
    ...rest
  }: PartProps<"div", MenuItemState> & MenuItemProps = $props()

  const menu = useHandle(menuPrimitive)
  const id = $props.id()
  const item = useHandlePart(menu, "item", () => ({
    id,
    value,
    label,
    disabled,
    shortcut,
    closeOnSelect,
    destructive,
    onSelect,
  }))
  // The platform shows in `aria-keyshortcuts`, so the attributes change with
  // it, and reading them keeps the hint current once the client knows it.
  const apple = $derived((item.attrs, menu.state.apple))
</script>

{#snippet content(state: MenuItemState)}
  {@render children?.(state)}
  {#if shortcut}<MenuShortcut>{formatShortcut(shortcut, apple)}</MenuShortcut
    >{/if}
{/snippet}

<Part tag="div" part={item} props={{ ...rest, children: content }} />
