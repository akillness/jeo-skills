import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/solid/collapsible"

function Example() {
  return (
    <Collapsible data-variant="card">
      <CollapsibleTrigger>
        <span data-slot="stack">
          <span>Ingredients</span>
          <span data-slot="hint">Morning buns, makes 12</span>
        </span>
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
      </CollapsibleTrigger>
      <CollapsiblePanel hiddenUntilFound>
        <p>
          Flour, butter, brown sugar, eggs, a pinch of cardamom and sea salt.
        </p>
      </CollapsiblePanel>
    </Collapsible>
  )
}

export { Example }
