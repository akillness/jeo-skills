<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup } from "@ui-sdk/svelte/radio"

  const options = [
    {
      value: "all",
      label: "Everything",
      description: "Every message and update.",
    },
    {
      value: "mentions",
      label: "Mentions",
      description: "Only when someone mentions you.",
    },
    { value: "none", label: "Nothing", description: "Turn notifications off." },
  ]

  const id = $props.id()
</script>

<Field>
  <FieldLabel>Notify me about</FieldLabel>
  <RadioGroup defaultValue="mentions">
    {#each options as option (option.value)}
      <Radio
        value={option.value}
        aria-labelledby={`${id}-${option.value}-label`}
        aria-describedby={`${id}-${option.value}-description`}
      >
        {#snippet render({ props, state })}
          <button {...props}>
            <span data-slot="stack">
              <span id={`${id}-${option.value}-label`}>{option.label}</span>
              <span data-slot="hint" id={`${id}-${option.value}-description`}
                >{option.description}</span
              >
            </span>
            <CheckIcon
              aria-hidden="true"
              data-checked={state.checked ? "" : undefined}
            />
          </button>
        {/snippet}
      </Radio>
    {/each}
  </RadioGroup>
</Field>
