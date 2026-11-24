<script lang="ts">
  import { Picker, PickerItem, PickerLabel } from "./picker-parts"

  let { value }: { value?: string } = $props()
</script>

<!-- Passed without bind:, so it's a starting value the root may change. -->
<Picker {value}>
  {#snippet children(state)}
    <output>{state.value}</output>
    <PickerItem value="pear"
      ><PickerLabel type="button">pear</PickerLabel></PickerItem
    >
  {/snippet}
</Picker>
