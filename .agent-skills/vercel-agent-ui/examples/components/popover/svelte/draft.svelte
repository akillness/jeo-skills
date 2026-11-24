<script lang="ts">
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let open = $state(false)
  let note = $state("")
  let asking = $state(false)
  let field: HTMLTextAreaElement | undefined = $state()

  function close() {
    open = false
    note = ""
    asking = false
  }
</script>

<Popover
  bind:open={() => open, (next) => (next ? (open = true) : close())}
  dismissible={note === ""}
  onDismissAttempt={(details) => {
    log(`Kept open (${details.reason})`)
    asking = true
  }}
>
  <PopoverTrigger>Add Note</PopoverTrigger>
  <PopoverContent>
    <PopoverTitle>Add a note</PopoverTitle>
    <PopoverDescription>Only your team can see it.</PopoverDescription>
    <Field>
      <FieldLabel>Note</FieldLabel>
      <FieldControl
        value={note}
        oninput={(event) => (note = event.currentTarget.value)}
      >
        {#snippet render({ props })}
          <textarea
            bind:this={field}
            {...props}
            placeholder="Call the printer about the proofs."></textarea>
        {/snippet}
      </FieldControl>
    </Field>
    {#if asking}
      <div data-slot="row" role="alert">
        Discard your note?
        <div data-slot="row">
          <button
            type="button"
            data-size="sm"
            onclick={() => {
              asking = false
              field?.focus()
            }}
          >
            Keep Editing
          </button>
          <button
            type="button"
            data-size="sm"
            data-variant="solid"
            onclick={() => {
              log("Discarded the note")
              close()
            }}
          >
            Discard
          </button>
        </div>
      </div>
    {:else}
      <div data-slot="row">
        <PopoverClose>Cancel</PopoverClose>
        <button
          type="button"
          data-variant="solid"
          onclick={() => {
            log(note ? "Saved the note" : "Nothing to save")
            close()
          }}
        >
          Save
        </button>
      </div>
    {/if}
  </PopoverContent>
</Popover>
