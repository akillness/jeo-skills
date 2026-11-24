<script lang="ts">
  import { CheckIcon, PlusIcon } from "@lucide/svelte"
  import { Checkbox } from "@ui-sdk/svelte/checkbox"

  const topics = [
    { value: "design", label: "Design", checked: true },
    { value: "engineering", label: "Engineering", checked: false },
    { value: "marketing", label: "Marketing", checked: false },
    { value: "sales", label: "Sales", checked: false },
  ]
</script>

<fieldset>
  <legend>Topics you follow</legend>
  <div data-slot="row">
    {#each topics as topic (topic.value)}
      <Checkbox
        name="topics"
        value={topic.value}
        defaultChecked={topic.checked}
      >
        {#snippet render({ props, state })}
          <button {...props}>
            {#if state.checked}
              <CheckIcon />
            {:else}
              <PlusIcon />
            {/if}
            {topic.label}
          </button>
        {/snippet}
      </Checkbox>
    {/each}
  </div>
</fieldset>
