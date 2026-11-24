<!--
@component
Renders a data menu's items as bare parts. Used by `<Menu items>` when you place no `MenuContent` of your own, and available for custom layouts.
@stable
-->
<script lang="ts">
  import type { MenuData, MenuDataItem } from "@ui-sdk/core/menu"
  import MenuCheckboxItem from "./menu-checkbox-item.svelte"
  import MenuContent from "./menu-content.svelte"
  import MenuGroupLabel from "./menu-group-label.svelte"
  import MenuGroup from "./menu-group.svelte"
  import MenuItem from "./menu-item.svelte"
  import Self from "./menu-items.svelte"
  import MenuRadioGroup from "./menu-radio-group.svelte"
  import MenuRadioItem from "./menu-radio-item.svelte"
  import MenuSeparator from "./menu-separator.svelte"
  import MenuSub from "./menu-sub.svelte"
  import MenuSubTrigger from "./menu-sub-trigger.svelte"

  let { items }: { items: MenuData } = $props()
  const entries: MenuDataItem[] = $derived(
    items.map((entry) =>
      typeof entry === "string" ? { value: entry, label: entry } : entry
    )
  )

  function keyOf(item: MenuDataItem, index: number) {
    switch (item.type) {
      case undefined:
      case "item":
      case "checkbox":
        return item.value
      case "radio-group":
        return item.name
      default:
        return `${item.type}-${index}`
    }
  }
</script>

{#each entries as item, index (keyOf(item, index))}
  {#if item.type === undefined || item.type === "item"}
    <MenuItem
      value={item.value}
      disabled={item.disabled}
      shortcut={item.shortcut}
      closeOnSelect={item.closeOnSelect}
      destructive={item.destructive}
    >
      {item.label}
    </MenuItem>
  {:else if item.type === "separator"}
    <MenuSeparator />
  {:else if item.type === "group"}
    <MenuGroup>
      {#if item.label}<MenuGroupLabel>{item.label}</MenuGroupLabel>{/if}
      <Self items={item.items} />
    </MenuGroup>
  {:else if item.type === "checkbox"}
    <!-- The data decides a controlled item's state, so a toggle writes nothing back. -->
    <MenuCheckboxItem
      value={item.value}
      disabled={item.disabled}
      bind:checked={() => item.checked, () => {}}
      defaultChecked={item.defaultChecked}
      closeOnSelect={item.closeOnSelect}
    >
      {item.label}
    </MenuCheckboxItem>
  {:else if item.type === "radio-group"}
    <MenuRadioGroup
      name={item.name}
      bind:value={() => item.value, () => {}}
      defaultValue={item.defaultValue}
    >
      {#if item.label}<MenuGroupLabel>{item.label}</MenuGroupLabel>{/if}
      {#each item.items as radio (radio.value)}
        <MenuRadioItem value={radio.value} disabled={radio.disabled}>
          {radio.label}
        </MenuRadioItem>
      {/each}
    </MenuRadioGroup>
  {:else if item.type === "submenu"}
    <MenuSub>
      <MenuSubTrigger disabled={item.disabled}>
        {item.label}
      </MenuSubTrigger>
      <MenuContent><Self items={item.items} /></MenuContent>
    </MenuSub>
  {/if}
{/each}
