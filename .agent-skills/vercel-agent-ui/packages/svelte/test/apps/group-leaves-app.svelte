<script lang="ts">
  import { Checkbox, CheckboxGroup } from "../../src/checkbox"

  let shown = $state(true)
  let value = $state<string[]>([])

  export function leave() {
    value = ["a"]
    shown = false
  }
</script>

{#if shown}
  <CheckboxGroup {value} aria-label="Letters">
    <Checkbox value="a" aria-label="A" />
    <Checkbox value="b" aria-label="B" />
  </CheckboxGroup>
{/if}
