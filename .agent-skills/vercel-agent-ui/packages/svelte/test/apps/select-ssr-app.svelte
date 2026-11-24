<script lang="ts">
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectItemText,
    SelectLabel,
    SelectTrigger,
  } from "../../src/select"

  let {
    data = false,
    itemToLabel,
  }: { data?: boolean; itemToLabel?: (value: string) => string } = $props()

  const plans = [
    { value: "basic", label: "Basic" },
    { value: "pro", label: "Pro" },
  ]
</script>

{#if data}
  <Select items={plans} name="plan" defaultValue="pro">
    <SelectLabel>Plan</SelectLabel>
    <SelectTrigger />
  </Select>
{:else}
  <Select name="plan" defaultValue="pro" {itemToLabel}>
    <SelectTrigger />
    <SelectContent>
      {#each plans as plan (plan.value)}
        <SelectItem value={plan.value}>
          <SelectItemText>{plan.label}</SelectItemText>
          <SelectItemIndicator>✓</SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
{/if}
