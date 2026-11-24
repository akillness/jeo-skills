<script lang="ts">
  import { XIcon } from "@lucide/svelte"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input, InputClear, InputGroup } from "@ui-sdk/svelte/input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Field name="website">
  <FieldLabel>Website</FieldLabel>
  <InputGroup>
    <span>https://</span>
    <Input
      placeholder="example.com"
      defaultValue="hollisgrant.com"
      onValueChange={(value, details) =>
        log(`${value ? `“${value}”` : "Empty"} (${details.reason})`)}
    />
    <InputClear aria-label="Clear website">
      <XIcon aria-hidden="true" />
    </InputClear>
  </InputGroup>
  <FieldDescription>Shown on your public profile.</FieldDescription>
</Field>
