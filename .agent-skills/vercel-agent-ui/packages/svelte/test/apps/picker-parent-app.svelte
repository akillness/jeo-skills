<script lang="ts">
  import { Picker, PickerItem, PickerLabel } from "./picker-parts"

  let value = $state("apple")

  export function set(next: string) {
    value = next
  }
</script>

<Picker {value}>
  {#snippet children(state)}
    <output>{state.value}</output>
    <PickerItem value="pear"
      ><PickerLabel type="button">pear</PickerLabel></PickerItem
    >
  {/snippet}
</Picker>
