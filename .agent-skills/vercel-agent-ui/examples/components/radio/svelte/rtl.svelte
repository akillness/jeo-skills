<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"

  const speeds = [
    { value: "standard", label: "عادي" },
    { value: "express", label: "سريع" },
    { value: "overnight", label: "خلال ليلة" },
  ]
</script>

<div dir="rtl">
  <Field>
    <FieldLabel>سرعة الشحن</FieldLabel>
    <RadioGroup defaultValue="express">
      {#each speeds as speed (speed.value)}
        <label data-slot="label">
          <Radio value={speed.value}>
            <RadioIndicator />
          </Radio>
          {speed.label}
        </label>
      {/each}
    </RadioGroup>
  </Field>
</div>
