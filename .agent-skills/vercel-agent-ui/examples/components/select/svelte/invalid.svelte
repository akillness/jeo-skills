<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"
  import { useLog } from "../../../shared/svelte/log"

  const methods = [
    { value: "standard", label: "Standard" },
    { value: "express", label: "Express" },
    { value: "overnight", label: "Overnight" },
  ]

  const log = useLog()

  function submit(event: SubmitEvent) {
    event.preventDefault()
    log(
      `Submitted shipping=${new FormData(event.currentTarget as HTMLFormElement).get("shipping")}`
    )
  }
</script>

<form data-slot="stack" onsubmit={submit}>
  <Field name="shipping">
    <FieldLabel>Shipping method</FieldLabel>
    <Select required placeholder="Select a shipping method">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each methods as method (method.value)}
          <SelectItem value={method.value}>
            {method.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <FieldDescription>Express arrives in two business days.</FieldDescription>
    <FieldError match="valueMissing">Choose a shipping method.</FieldError>
  </Field>
  <button type="submit" data-variant="solid">Continue</button>
</form>
