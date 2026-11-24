import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/solid/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { createSignal, For } from "solid-js"

const modes = [
  { value: "false", label: "Non-modal" },
  { value: "trap-focus", label: "Trap focus" },
  { value: "true", label: "Modal" },
]

type Mode = "false" | "trap-focus" | "true"

const notes = {
  false: "Tab can leave, and focus leaving closes it.",
  "trap-focus": "Tab stays inside. The page still scrolls and takes clicks.",
  true: "Tab stays inside. The page is inert and doesn't scroll.",
}

function Example() {
  const [mode, setMode] = createSignal<Mode>("false")
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
      </div>
      <Popover modal={modal()}>
        <PopoverTrigger>Add Comment</PopoverTrigger>
        <PopoverContent>
          <PopoverTitle>Add a comment</PopoverTitle>
          <PopoverDescription>{notes[mode()]}</PopoverDescription>
          <Field>
            <FieldLabel>Comment</FieldLabel>
            <Textarea defaultValue="Looks good to me." />
          </Field>
          <div data-slot="row">
            <PopoverClose>Cancel</PopoverClose>
            <PopoverClose data-variant="solid">Comment</PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
