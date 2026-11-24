<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    createRadioGroupController,
    Radio,
    RadioGroup,
    RadioIndicator,
  } from "@ui-sdk/svelte/radio"
  import { useLog } from "../../../shared/svelte/log"

  const plans = [
    { value: "starter", label: "Starter" },
    { value: "pro", label: "Pro" },
    { value: "team", label: "Team" },
  ]

  const log = useLog()
  const planGroup = createRadioGroupController()
  let value = $state<string | null>("pro")
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => planGroup.setValue("team")}
      >Choose Team</button
    >
  </div>
  <Field>
    <FieldLabel>Plan</FieldLabel>
    <RadioGroup
      bind:value
      onValueChange={(next, details) =>
        log(
          `${plans.find((plan) => plan.value === next)?.label ?? "None"} (${details.reason})`
        )}
      controller={planGroup}
    >
      {#each plans as plan (plan.value)}
        <label data-slot="label">
          <Radio value={plan.value}>
            <RadioIndicator />
          </Radio>
          {plan.label}
        </label>
      {/each}
    </RadioGroup>
  </Field>
</div>
