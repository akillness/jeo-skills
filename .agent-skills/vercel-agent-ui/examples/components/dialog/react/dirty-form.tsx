"use client"

import * as React from "react"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"

function Example() {
  const [open, setOpen] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const [asking, setAsking] = React.useState(false)
  const post = React.useRef<HTMLTextAreaElement>(null)
  const close = () => {
    setOpen(false)
    setDirty(false)
    setAsking(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      dismissible={!dirty}
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
            render={<textarea ref={post} placeholder="What's new?" />}
            onChange={(event) => setDirty(event.currentTarget.value !== "")}
          />
        </Field>
        {asking ? (
          <div data-slot="row" role="alert">
            Discard your changes?
            <div data-slot="row">
              <button
                type="button"
                onClick={() => {
                  setAsking(false)
                  post.current?.focus()
                }}
              >
                Keep Editing
              </button>
              <button data-variant="solid" type="button" onClick={close}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div data-slot="row">
            <DialogClose data-variant="solid" value="post">
              Post
            </DialogClose>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { Example }
