import {
  Popover,
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

const choices = {
  sideOffset: { label: "Side offset", values: ["4", "8", "16", "24"] },
  alignOffset: { label: "Align offset", values: ["-16", "0", "16"] },
  collisionPadding: { label: "Collision padding", values: ["8", "24", "48"] },
}
type Name = keyof typeof choices

function Example() {
  const [offsets, setOffsets] = createSignal<Record<Name, string>>({
    sideOffset: "8",
    alignOffset: "0",
    collisionPadding: "8",
  })

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <For each={Object.keys(choices) as Name[]}>
          {(name) => (
            <Select
              items={choices[name].values}
              value={offsets()[name]}
              onValueChange={(next) =>
                next && setOffsets({ ...offsets(), [name]: next })
              }
            >
              <SelectLabel>{choices[name].label}</SelectLabel>
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
                <For each={choices[name].values}>
                  {(value) => (
                    <SelectItem value={value}>
                      {value}px
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
          )}
        </For>
      </div>
      <Popover>
        <PopoverTrigger>Delivery</PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={Number(offsets().sideOffset)}
          alignOffset={Number(offsets().alignOffset)}
          collisionPadding={Number(offsets().collisionPadding)}
        >
          <PopoverTitle>Delivery window</PopoverTitle>
          <PopoverDescription>
            Arrives Tuesday between 9 AM and noon.
          </PopoverDescription>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export { Example }
