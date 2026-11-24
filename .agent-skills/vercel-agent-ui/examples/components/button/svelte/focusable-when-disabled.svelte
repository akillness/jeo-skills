<script lang="ts">
  import { Button } from "@ui-sdk/svelte/button"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let title = $state("")
  const hint = $props.id()
  const ready = $derived(title.trim() !== "")
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>Title</FieldLabel>
    <Input bind:value={title} />
  </Field>
  <div data-slot="row">
    <Button
      disabled={!ready}
      focusableWhenDisabled
      aria-describedby={hint}
      onclick={() => log(`Published “${title}”`)}
    >
      Publish
    </Button>
    <p id={hint} data-slot="hint">
      {ready ? "Ready to publish." : "Add a title to publish."}
    </p>
  </div>
</div>
