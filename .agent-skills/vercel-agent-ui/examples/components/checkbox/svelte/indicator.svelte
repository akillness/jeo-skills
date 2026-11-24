<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"

  const tasks = [
    { label: "Write the release notes", done: false },
    { label: "Update the changelog", done: true },
    { label: "Tag the release", done: false },
  ]
</script>

<div data-slot="stack">
  {#each tasks as task (task.label)}
    <label data-slot="label">
      <Checkbox defaultChecked={task.done}>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      {task.label}
    </label>
  {/each}
</div>
