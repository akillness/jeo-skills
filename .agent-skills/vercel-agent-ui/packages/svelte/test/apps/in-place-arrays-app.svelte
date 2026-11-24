<script lang="ts">
  import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    AccordionTrigger,
  } from "../../src/accordion"
  import { Checkbox, CheckboxGroup } from "../../src/checkbox"
  import { Combobox, ComboboxInput, ComboboxValue } from "../../src/combobox"
  import { Listbox } from "../../src/listbox"
  import { Select, SelectTrigger } from "../../src/select"
  import { Toggle, ToggleGroup } from "../../src/toggle"
  import { Tree } from "../../src/tree"

  // One component given the test's `$state` list through `bind:value` or a
  // plain `value`.
  let {
    component,
    bound,
    selected = $bindable(),
  }: {
    component:
      | "Listbox"
      | "Select"
      | "Combobox"
      | "ToggleGroup"
      | "CheckboxGroup"
      | "Accordion"
      | "Tree"
    bound: boolean
    selected?: string[]
  } = $props()

  const fruits = [
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
    { value: "cherry", label: "Cherry" },
  ]
  const branches = fruits.map((fruit) => ({
    ...fruit,
    children: [{ value: `${fruit.value}-seed`, label: "Seed" }],
  }))
</script>

<form>
  {#if component === "Listbox"}
    {#if bound}
      <Listbox multiple name="fruit" items={fruits} bind:value={selected} />
    {:else}
      <Listbox multiple name="fruit" items={fruits} value={selected} />
    {/if}
  {:else if component === "Select"}
    {#if bound}
      <Select multiple name="fruit" items={fruits} bind:value={selected}
        ><SelectTrigger /></Select
      >
    {:else}
      <Select multiple name="fruit" items={fruits} value={selected}
        ><SelectTrigger /></Select
      >
    {/if}
  {:else if component === "Combobox"}
    {#snippet field()}<output><ComboboxValue /></output><ComboboxInput
      />{/snippet}
    {#if bound}
      <Combobox multiple name="fruit" items={fruits} bind:value={selected}
        >{@render field()}</Combobox
      >
    {:else}
      <Combobox multiple name="fruit" items={fruits} value={selected}
        >{@render field()}</Combobox
      >
    {/if}
  {:else if component === "ToggleGroup"}
    {#snippet toggles()}
      {#each fruits as fruit (fruit.value)}<Toggle value={fruit.value}
          >{fruit.label}</Toggle
        >{/each}
    {/snippet}
    {#if bound}
      <ToggleGroup multiple bind:value={selected}
        >{@render toggles()}</ToggleGroup
      >
    {:else}
      <ToggleGroup multiple value={selected}>{@render toggles()}</ToggleGroup>
    {/if}
  {:else if component === "Accordion"}
    {#snippet sections()}
      {#each fruits as fruit (fruit.value)}
        <AccordionItem value={fruit.value}>
          <AccordionHeader
            ><AccordionTrigger>{fruit.label}</AccordionTrigger></AccordionHeader
          >
          <AccordionPanel>{fruit.label} panel</AccordionPanel>
        </AccordionItem>
      {/each}
    {/snippet}
    {#if bound}
      <Accordion multiple bind:value={selected}>{@render sections()}</Accordion>
    {:else}
      <Accordion multiple value={selected}>{@render sections()}</Accordion>
    {/if}
  {:else if component === "Tree"}
    {#if bound}
      <Tree aria-label="Fruit" items={branches} bind:expanded={selected} />
    {:else}
      <Tree aria-label="Fruit" items={branches} expanded={selected} />
    {/if}
  {:else}
    {#snippet checkboxes()}
      {#each fruits as fruit (fruit.value)}<Checkbox
          value={fruit.value}
          aria-label={fruit.label}
        />{/each}
    {/snippet}
    {#if bound}
      <CheckboxGroup name="fruit" bind:value={selected}
        >{@render checkboxes()}</CheckboxGroup
      >
    {:else}
      <CheckboxGroup name="fruit" value={selected}
        >{@render checkboxes()}</CheckboxGroup
      >
    {/if}
  {/if}
</form>
