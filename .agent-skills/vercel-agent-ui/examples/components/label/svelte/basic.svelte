<script lang="ts">
  import { Label } from "@ui-sdk/svelte/label"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

  const speeds = [
    { value: "standard", label: "Standard" },
    { value: "express", label: "Express" },
    { value: "overnight", label: "Overnight" },
  ]
</script>

<div data-slot="stack">
  <Label for="shipping-speed">Shipping speed</Label>
  <RadioGroup id="shipping-speed" defaultValue="standard">
    {#each speeds as speed (speed.value)}
      <Label>
        <Radio value={speed.value}>
          <RadioIndicator />
        </Radio>
        {speed.label}
      </Label>
    {/each}
  </RadioGroup>
</div>
