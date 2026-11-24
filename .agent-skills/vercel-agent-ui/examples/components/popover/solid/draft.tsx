import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/solid/popover"
import { createSignal, Show } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [open, setOpen] = createSignal(false)
  const [note, setNote] = createSignal("")
  const [asking, setAsking] = createSignal(false)
  let field: HTMLTextAreaElement | undefined
  const close = () => {
    setOpen(false)
    setNote("")
    setAsking(false)
  }

  return (
    <Popover
      open={open()}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      dismissible={note() === ""}
      onDismissAttempt={(details) => {
        log(`Kept open (${details.reason})`)
        setAsking(true)
      }}
    >
      <PopoverTrigger>Add Note</PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Add a note</PopoverTitle>
        <PopoverDescription>Only your team can see it.</PopoverDescription>
        <Field>
          <FieldLabel>Note</FieldLabel>
          <FieldControl
            render={(props) => (
              <textarea
                {...props}
                ref={(element) => (field = element)}
                placeholder="Call the printer about the proofs."
              />
            )}
            value={note()}
            onInput={(event) => setNote(event.currentTarget.value)}
          />
        </Field>
        <Show
          when={asking()}
          fallback={
            <div data-slot="row">
              <PopoverClose>Cancel</PopoverClose>
              <button
                type="button"
                data-variant="solid"
                onClick={() => {
                  log(note() ? "Saved the note" : "Nothing to save")
                  close()
                }}
              >
                Save
              </button>
            </div>
          }
        >
          <div data-slot="row" role="alert">
            Discard your note?
            <div data-slot="row">
              <button
                type="button"
                data-size="sm"
                onClick={() => {
                  setAsking(false)
                  field?.focus()
                }}
              >
                Keep Editing
              </button>
              <button
                type="button"
                data-size="sm"
                data-variant="solid"
                onClick={() => {
                  log("Discarded the note")
                  close()
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </Show>
      </PopoverContent>
    </Popover>
  )
}

export { Example }
