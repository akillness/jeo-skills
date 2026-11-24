<script lang="ts">
  import { Picker, PickerItem, PickerLabel } from "./picker-parts"

  let {
    value = $bindable(),
    defaultValue,
  }: { value?: string; defaultValue?: string } = $props()
</script>

<Picker bind:value {defaultValue} class="picker" aria-label="Fruit">
  {#snippet children(state)}
    <output>{state.value}</output>
    {#each ["apple", "pear"] as fruit (fruit)}
      <PickerItem value={fruit} class="item">
        {#snippet children(item)}
          <PickerLabel type="button"
            >{fruit}{item.picked ? " (picked)" : ""}</PickerLabel
          >
        {/snippet}
      </PickerItem>
    {/each}
  {/snippet}
</Picker>
