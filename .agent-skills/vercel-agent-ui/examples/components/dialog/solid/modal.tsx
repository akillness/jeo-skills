import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/solid/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { createSignal, For, Show } from "solid-js"

const modes = [
  { value: "true", label: "Modal" },
  { value: "trap-focus", label: "Trap focus" },
  { value: "false", label: "Non-modal" },
]

type Mode = "true" | "trap-focus" | "false"

const notes = {
  true: "The rest of the page is inert and doesn't scroll.",
  "trap-focus":
    "Tab stays inside, and the page still scrolls and takes clicks.",
  false:
    "The page stays usable. Tab leaves the notes, and Escape closes them while focus is inside.",
}

function Example() {
  const [mode, setMode] = createSignal<Mode>("false")
  const [outside, setOutside] = createSignal(false)
  const modal = () =>
    mode() === "true" ? true : mode() === "false" ? false : "trap-focus"
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={modes}
          value={mode()}
          onValueChange={(next) => next && setMode(next as Mode)}
        >
          <SelectLabel>Modal</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </SelectTrigger>
          <SelectContent>
            <For each={modes}>
              {(option) => (
                <SelectItem value={option.value}>
                  {option.label}
                  <SelectItemIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </SelectItemIndicator>
                </SelectItem>
              )}
            </For>
          </SelectContent>
        </Select>
        <label data-slot="label">
          <Checkbox
            checked={outside()}
            onCheckedChange={(next) => setOutside(next === true)}
          >
            <CheckboxIndicator>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </CheckboxIndicator>
          </Checkbox>
          Close on outside press
        </label>
      </div>
      <Dialog modal={modal()} closeOnOutsidePress={outside()}>
        <DialogTrigger>Open Notes</DialogTrigger>
        <Show when={modal() === true}>
          <DialogBackdrop />
        </Show>
        <DialogContent>
          <div data-slot="stack">
            <DialogTitle>Notes</DialogTitle>
            <DialogDescription>{notes[mode()]}</DialogDescription>
          </div>
          <textarea
            aria-label="Notes"
            value="Call the printer about the proofs."
          />
          <div data-slot="row">
            <DialogClose data-variant="solid">Done</DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export { Example }
