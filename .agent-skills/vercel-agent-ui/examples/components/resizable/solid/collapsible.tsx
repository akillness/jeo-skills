import {
  Resizable,
  ResizableHandle,
  ResizablePanel,
} from "@ui-sdk/solid/resizable"

function Example() {
  return (
    <Resizable>
      <ResizablePanel
        defaultSize={30}
        minSize={25}
        collapsible
        collapsedSize="48px"
      >
        <ul>
          <li data-slot="row">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
            <span>Files</span>
          </li>
          <li data-slot="row">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m21 21-4.34-4.34" />
              <circle cx="11" cy="11" r="8" />
            </svg>
            <span>Search</span>
          </li>
          <li data-slot="row">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Settings</span>
          </li>
        </ul>
      </ResizablePanel>
      <ResizableHandle aria-label="Resize sidebar">
        <div />
      </ResizableHandle>
      <ResizablePanel minSize={40}>
        <h3>README.md</h3>
        <span data-slot="hint">Edited by Inès Moreau</span>
      </ResizablePanel>
    </Resizable>
  )
}

export { Example }
