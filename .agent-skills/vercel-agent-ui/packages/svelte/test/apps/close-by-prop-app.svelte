<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteInput,
    AutocompleteItem,
  } from "../../src/autocomplete"
  import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
  } from "../../src/combobox"
  import { Menu, MenuContent, MenuItem, MenuTrigger } from "../../src/menu"
  import { Popover, PopoverContent, PopoverTrigger } from "../../src/popover"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
  } from "../../src/select"

  let {
    kind,
    bound,
    onOpenChangeComplete,
  }: {
    kind: string
    bound: boolean
    onOpenChangeComplete: (open: boolean) => void
  } = $props()

  let open = $state(false)
  export const setOpen = (next: boolean) => (open = next)
</script>

{#if bound}
  {#if kind === "select"}
    <Select bind:open {onOpenChangeComplete}>
      <SelectTrigger>Fruit</SelectTrigger>
      <SelectContent><SelectItem value="apple">Apple</SelectItem></SelectContent
      >
    </Select>
  {:else if kind === "combobox"}
    <Combobox bind:open {onOpenChangeComplete}>
      <ComboboxInput aria-label="Fruit" />
      <ComboboxContent
        ><ComboboxItem value="apple">Apple</ComboboxItem></ComboboxContent
      >
    </Combobox>
  {:else if kind === "autocomplete"}
    <Autocomplete bind:open {onOpenChangeComplete}>
      <AutocompleteInput aria-label="Fruit" />
      <AutocompleteContent
        ><AutocompleteItem value="apple">Apple</AutocompleteItem
        ></AutocompleteContent
      >
    </Autocomplete>
  {:else if kind === "menu"}
    <Menu bind:open {onOpenChangeComplete}>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuContent><MenuItem value="copy">Copy</MenuItem></MenuContent>
    </Menu>
  {:else}
    <Popover bind:open {onOpenChangeComplete}>
      <PopoverTrigger>Details</PopoverTrigger>
      <PopoverContent aria-label="Details">Text</PopoverContent>
    </Popover>
  {/if}
{:else if kind === "select"}
  <Select {open} {onOpenChangeComplete}>
    <SelectTrigger>Fruit</SelectTrigger>
    <SelectContent><SelectItem value="apple">Apple</SelectItem></SelectContent>
  </Select>
{:else if kind === "combobox"}
  <Combobox {open} {onOpenChangeComplete}>
    <ComboboxInput aria-label="Fruit" />
    <ComboboxContent
      ><ComboboxItem value="apple">Apple</ComboboxItem></ComboboxContent
    >
  </Combobox>
{:else if kind === "autocomplete"}
  <Autocomplete {open} {onOpenChangeComplete}>
    <AutocompleteInput aria-label="Fruit" />
    <AutocompleteContent
      ><AutocompleteItem value="apple">Apple</AutocompleteItem
      ></AutocompleteContent
    >
  </Autocomplete>
{:else if kind === "menu"}
  <Menu {open} {onOpenChangeComplete}>
    <MenuTrigger>Actions</MenuTrigger>
    <MenuContent><MenuItem value="copy">Copy</MenuItem></MenuContent>
  </Menu>
{:else}
  <Popover {open} {onOpenChangeComplete}>
    <PopoverTrigger>Details</PopoverTrigger>
    <PopoverContent aria-label="Details">Text</PopoverContent>
  </Popover>
{/if}
