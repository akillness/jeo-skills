import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxCreate,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxValue,
} from "@ui-sdk/solid/combobox"
import { createSignal, For } from "solid-js"

const initialLabels = [
  "Bug",
  "Feature",
  "Documentation",
  "Design",
  "Performance",
  "Security",
  "Testing",
]

function saveLabel(name: string) {
  return new Promise<void>((resolve, reject) =>
    setTimeout(
      () =>
        name.length > 20
          ? reject(new Error("Labels are 20 characters at most."))
          : resolve(),
      800
    )
  )
}

function Example() {
  const [labels, setLabels] = createSignal(initialLabels)
  const [value, setValue] = createSignal<string[]>(["Bug"])

  return (
    <Combobox multiple value={value()} onValueChange={setValue}>
      <div data-slot="stack">
        <ComboboxLabel>Labels</ComboboxLabel>
        <ComboboxChips>
          <ComboboxValue>
            {(state) => (
              <For each={state.value as string[]}>
                {(label) => (
                  <ComboboxChip value={label}>
                    {label}
                    <ComboboxChipRemove aria-label={`Remove ${label}`}>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </ComboboxChipRemove>
                  </ComboboxChip>
                )}
              </For>
            )}
          </ComboboxValue>
          <ComboboxInput placeholder="Add or create a label…" />
        </ComboboxChips>
      </div>
      <ComboboxContent>
        <ComboboxList>
          <For each={labels()}>
            {(label) => (
              <ComboboxItem value={label}>
                {label}
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
          <ComboboxCreate
            minLength={2}
            onCreate={async (query) => {
              await saveLabel(query)
              setLabels((list) => [...list, query])
              setValue((list) => [...list, query])
            }}
          >
            {(state) =>
              state.pending ? (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                    data-slot="spinner"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Creating “{state.query}”…
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                  <span data-slot="stack">
                    Create “{state.query}”
                    {state.error ? (
                      <span data-slot="hint">
                        {(state.error as Error).message}
                      </span>
                    ) : null}
                  </span>
                </>
              )
            }
          </ComboboxCreate>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
