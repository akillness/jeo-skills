<script lang="ts">
  import {
    Dialog,
    DialogBackdrop,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import { Field, FieldControl, FieldLabel } from "@ui-sdk/svelte/field"

  let open = $state(false)
  let dirty = $state(false)
  let asking = $state(false)
  let post: HTMLTextAreaElement | undefined = $state()

  function close() {
    open = false
    dirty = false
    asking = false
  }

  function keepEditing() {
    asking = false
    post?.focus()
  }
</script>

<Dialog
  bind:open={() => open, (next) => (next ? (open = true) : close())}
  dismissible={!dirty}
  onDismissAttempt={() => (asking = true)}
>
  <DialogTrigger>Write a Post</DialogTrigger>
  <DialogBackdrop />
  <DialogContent>
    <div data-slot="stack">
      <DialogTitle>New post</DialogTitle>
      <DialogDescription>Share an update with your team.</DialogDescription>
    </div>
    <Field>
      <FieldLabel>Post</FieldLabel>
      <FieldControl
        oninput={(event) => (dirty = event.currentTarget.value !== "")}
      >
        {#snippet render({ props })}
          <textarea bind:this={post} {...props} placeholder="What's new?"
          ></textarea>
        {/snippet}
      </FieldControl>
    </Field>
    {#if asking}
      <div data-slot="row" role="alert">
        Discard your changes?
        <div data-slot="row">
          <button type="button" onclick={keepEditing}>Keep Editing</button>
          <button data-variant="solid" type="button" onclick={close}
            >Discard</button
          >
        </div>
      </div>
    {:else}
      <div data-slot="row">
        <DialogClose data-variant="solid" value="post">Post</DialogClose>
      </div>
    {/if}
  </DialogContent>
</Dialog>
