<script lang="ts">
  import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
  } from "../../src/combobox"
  import {
    DatePicker,
    DatePickerContent,
    DatePickerInput,
    CalendarGrid,
  } from "../../src/date-picker"
  import { Field, FieldLabel } from "../../src/field"
  import {
    TriggerMenu,
    TriggerMenuContent,
    TriggerMenuInput,
    TriggerMenuItem,
  } from "../../src/trigger-menu"

  let { kind }: { kind: string } = $props()

  let show = $state(true)
  let open = $state(true)
  const triggers = [{ char: "@", items: [{ value: "ben", label: "Ben" }] }]
  export const hide = () => (show = false)
</script>

{#if show}
  <Field>
    <FieldLabel>Field</FieldLabel>
    {#if kind === "combobox"}
      <Combobox bind:open>
        <ComboboxInput />
        <ComboboxContent
          ><ComboboxItem value="apple">Apple</ComboboxItem></ComboboxContent
        >
      </Combobox>
    {:else if kind === "date-picker"}
      <DatePicker bind:open>
        <DatePickerInput />
        <DatePickerContent><CalendarGrid /></DatePickerContent>
      </DatePicker>
    {:else}
      <TriggerMenu {triggers} bind:open>
        <TriggerMenuInput />
        <TriggerMenuContent
          ><TriggerMenuItem value="ben">Ben</TriggerMenuItem
          ></TriggerMenuContent
        >
      </TriggerMenu>
    {/if}
  </Field>
{/if}
