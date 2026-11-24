<script lang="ts">
  import {
    Dialog,
    DialogBackdrop,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
  } from "@ui-sdk/svelte/dialog"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Dialog
  onOpenChange={(open, details) => {
    if (!open) {
      log(
        details.returnValue
          ? `Saved as ${details.returnValue}`
          : `Closed (${details.reason})`
      )
    }
  }}
>
  <DialogTrigger>New Article</DialogTrigger>
  <DialogBackdrop />
  <DialogContent>
    <div data-slot="stack">
      <DialogTitle>New article</DialogTitle>
      <DialogDescription
        >Save it as a draft or publish it now.</DialogDescription
      >
    </div>
    <form data-slot="stack" method="dialog">
      <Field>
        <FieldLabel>Title</FieldLabel>
        <Input required defaultValue="Shipping updates for spring" />
      </Field>
      <div data-slot="row">
        <button type="submit" value="draft">Save Draft</button>
        <button data-variant="solid" type="submit" value="published"
          >Publish</button
        >
      </div>
    </form>
  </DialogContent>
</Dialog>
