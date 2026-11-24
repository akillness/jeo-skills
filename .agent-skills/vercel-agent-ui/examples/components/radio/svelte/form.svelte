<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"
  import { useLog } from "../../../shared/svelte/log"

  const speeds = [
    { value: "standard", label: "Standard", detail: "Free, 5 to 7 days" },
    { value: "express", label: "Express", detail: "$9, 2 days" },
    { value: "overnight", label: "Overnight", detail: "$24, next day" },
  ]

  const log = useLog()
  const id = $props.id()

  function onSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    log(
      `Submitted shipping=${new FormData(event.currentTarget).get("shipping")}`
    )
  }
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>Shipping speed</FieldLabel>
    <RadioGroup
      name="shipping"
      form={`${id}-checkout`}
      required
      defaultValue="standard"
    >
      {#each speeds as speed (speed.value)}
        <label data-slot="label">
          <Radio value={speed.value}>
            <RadioIndicator />
          </Radio>
          {speed.label}
          <span data-slot="hint">({speed.detail})</span>
        </label>
      {/each}
    </RadioGroup>
  </Field>
  <form data-slot="row" id={`${id}-checkout`} onsubmit={onSubmit}>
    <button type="submit" data-variant="solid">Continue</button>
    <button type="reset">Reset</button>
  </form>
</div>
