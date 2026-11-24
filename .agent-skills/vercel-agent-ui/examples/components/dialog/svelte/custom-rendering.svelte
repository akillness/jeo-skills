<script lang="ts">
  import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogShortcut,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
</script>

<Dialog>
  <DialogTrigger shortcut="mod+i">
    {#snippet render({ props, state })}
      <button {...props}>
        {state.open ? "Viewing" : "View Details"}
        <DialogShortcut>
          {#snippet children(shortcut)}{shortcut.text}{/snippet}
        </DialogShortcut>
      </button>
    {/snippet}
  </DialogTrigger>
  <DialogBackdrop />
  <DialogContent>
    {#snippet children(state)}
      <div data-slot="stack">
        <DialogTitle>
          {#snippet render({ props })}
            <h3 {...props}>Details</h3>
          {/snippet}
        </DialogTitle>
        <DialogDescription>
          {state.nested
            ? "Opened from another dialog."
            : "Quarterly report, updated today."}
        </DialogDescription>
      </div>
      <div data-slot="row">
        <DialogClose>Close</DialogClose>
        <DialogClose data-variant="solid" href="https://example.com/details">
          {#snippet render({ props })}
            <a {...props}>Open the Full Page</a>
          {/snippet}
        </DialogClose>
      </div>
    {/snippet}
  </DialogContent>
</Dialog>
