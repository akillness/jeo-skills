import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/solid/dialog"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import { createSignal, Show } from "solid-js"

function Example() {
  const [open, setOpen] = createSignal(false)
  const [dirty, setDirty] = createSignal(false)
  const [asking, setAsking] = createSignal(false)
  let post: HTMLTextAreaElement | undefined
  const close = () => {
    setOpen(false)
    setDirty(false)
    setAsking(false)
  }
  return (
    <Dialog
      open={open()}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      dismissible={!dirty()}
      onDismissAttempt={() => setAsking(true)}
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
            render={(props) => (
              <textarea
                {...props}
                ref={(element) => (post = element)}
                placeholder="What's new?"
              />
            )}
            onInput={(event) => setDirty(event.currentTarget.value !== "")}
          />
        </Field>
        <Show
          when={asking()}
          fallback={
            <div data-slot="row">
              <DialogClose data-variant="solid" value="post">
                Post
              </DialogClose>
            </div>
          }
        >
          <div data-slot="row" role="alert">
            Discard your changes?
            <div data-slot="row">
              <button
                type="button"
                onClick={() => {
                  setAsking(false)
                  post?.focus()
                }}
              >
                Keep Editing
              </button>
              <button data-variant="solid" type="button" onClick={close}>
                Discard
              </button>
            </div>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  )
}

export { Example }
