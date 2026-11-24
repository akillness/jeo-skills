<script lang="ts">
  import type { ValidityKey } from "@ui-sdk/core/field"
  import { Field, FieldError, FieldLabel } from "../../src/field"
  import { Input } from "../../src/input"

  let { matches }: { matches: (boolean | ValidityKey | undefined)[] } = $props()
</script>

<Field invalid>
  <FieldLabel>Name</FieldLabel>
  <Input />
  {#each matches as match, index (index)}
    <FieldError {match}>Error {index}</FieldError>
  {/each}
</Field>
