import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
} from "@ui-sdk/solid/combobox"
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

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
]

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
]
const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]
type Side = "top" | "right" | "bottom" | "left"
type Align = "start" | "center" | "end"

function Example() {
  const [side, setSide] = createSignal<Side>("bottom")
  const [align, setAlign] = createSignal<Align>("start")
  const [box, setBox] = createSignal<HTMLDivElement | null>(null)
  const [anchored, setAnchored] = createSignal(false)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={sides}
          value={side()}
          onValueChange={(next) => next && setSide(next as Side)}
        >
          <SelectLabel>Side</SelectLabel>
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
            <For each={sides}>
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
        <Select
          items={aligns}
          value={align()}
          onValueChange={(next) => next && setAlign(next as Align)}
        >
          <SelectLabel>Align</SelectLabel>
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
            <For each={aligns}>
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
            checked={anchored()}
            onCheckedChange={(next) => setAnchored(next === true)}
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
          Anchor to the box
        </label>
      </div>
      <div ref={setBox} data-slot="card">
        <Combobox>
          <ComboboxInput aria-label="Framework" placeholder="Framework" />
          <ComboboxContent
            side={side()}
            align={align()}
            sideOffset={10}
            alignOffset={0}
            collisionPadding={16}
            anchor={anchored() ? box() : null}
          >
            <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
            <ComboboxList>
              <For each={frameworks}>
                {(framework) => (
                  <ComboboxItem value={framework.value} label={framework.label}>
                    {framework.label}
                    <ComboboxItemIndicator>
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
                    </ComboboxItemIndicator>
                  </ComboboxItem>
                )}
              </For>
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </div>
  )
}

export { Example }
