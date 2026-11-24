import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/solid/popover"
import { createSignal, For } from "solid-js"

const types = [
  { label: "Documents", checked: true },
  { label: "Images", checked: false },
  { label: "Shared with me", checked: true },
]

function Example() {
  const [anchor, setAnchor] = createSignal<HTMLInputElement>()

  return (
    <div data-slot="row">
      <input
        ref={setAnchor}
        type="search"
        placeholder="Search files…"
        aria-label="Search files"
      />
      <Popover>
        <PopoverTrigger aria-label="Search filters">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M10 5H3" />
            <path d="M12 19H3" />
            <path d="M14 3v4" />
            <path d="M16 17v4" />
            <path d="M21 12h-9" />
            <path d="M21 19h-5" />
            <path d="M21 5h-7" />
            <path d="M8 10v4" />
            <path d="M8 12H3" />
          </svg>
        </PopoverTrigger>
        <PopoverContent anchor={anchor()} align="start" sideOffset={8}>
          <PopoverTitle>Filters</PopoverTitle>
          <PopoverDescription>
            Show only these kinds of files.
          </PopoverDescription>
          <div data-slot="stack">
            <For each={types}>
              {(type) => (
                <label data-slot="label">
                  <Checkbox defaultChecked={type.checked}>
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
                  {type.label}
                </label>
              )}
            </For>
          </div>
          <div data-slot="row">
            <PopoverClose>Cancel</PopoverClose>
            <PopoverClose data-variant="solid">Apply</PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
