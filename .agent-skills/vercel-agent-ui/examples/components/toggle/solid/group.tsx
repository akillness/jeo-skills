import { Toggle, ToggleGroup, ToggleIcon } from "@ui-sdk/solid/toggle"

function Example() {
  return (
    <ToggleGroup multiple aria-label="Text formatting">
      <Toggle value="bold" aria-label="Bold">
        <ToggleIcon>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
          </svg>
        </ToggleIcon>
      </Toggle>
      <Toggle value="italic" aria-label="Italic">
        <ToggleIcon>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="19" x2="10" y1="4" y2="4" />
            <line x1="14" x2="5" y1="20" y2="20" />
            <line x1="15" x2="9" y1="4" y2="20" />
          </svg>
        </ToggleIcon>
      </Toggle>
      <Toggle value="underline" aria-label="Underline">
        <ToggleIcon>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M6 4v6a6 6 0 0 0 12 0V4" />
            <line x1="4" x2="20" y1="20" y2="20" />
          </svg>
        </ToggleIcon>
      </Toggle>
    </ToggleGroup>
  )
}

export { Example }
