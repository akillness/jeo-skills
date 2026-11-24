import { Toggle, ToggleIcon } from "@ui-sdk/solid/toggle"

function Example() {
  return (
    <Toggle
      aria-label="Favorite"
      render={(props, state) => (
        <button {...props}>
          <ToggleIcon>
            <svg
              viewBox="0 0 24 24"
              fill={state.pressed ? "currentColor" : "none"}
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
            </svg>
          </ToggleIcon>
        </button>
      )}
    />
  )
}

export { Example }
