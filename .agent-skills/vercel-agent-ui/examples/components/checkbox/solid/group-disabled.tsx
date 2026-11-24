import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/solid/checkbox"
import { For } from "solid-js"

const backups = [
  { value: "photos", label: "Photos" },
  { value: "documents", label: "Documents" },
  { value: "messages", label: "Messages" },
]

const folders = [
  { value: "desktop", label: "Desktop", disabled: true },
  { value: "projects", label: "Projects", disabled: false },
  { value: "downloads", label: "Downloads", disabled: false },
]

function Example() {
  return (
    <div data-slot="stack">
      <div data-slot="stack">
        <h3 id="disabled-backups">Backups</h3>
        <p data-slot="hint">Managed by your organization.</p>
        <CheckboxGroup
          aria-labelledby="disabled-backups"
          defaultValue={["photos", "documents"]}
          disabled
        >
          <For each={backups}>
            {(item) => (
              <label data-slot="label">
                <Checkbox value={item.value}>
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
                {item.label}
              </label>
            )}
          </For>
        </CheckboxGroup>
      </div>
      <div data-slot="stack">
        <h3 id="disabled-folders">Sync folders</h3>
        <CheckboxGroup
          aria-labelledby="disabled-folders"
          defaultValue={["desktop"]}
          allValues={folders.map((item) => item.value)}
        >
          <label data-slot="label">
            <Checkbox parent>
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
                </svg>
              </CheckboxIndicator>
            </Checkbox>
            Select all
          </label>
          <div data-slot="stack">
            <For each={folders}>
              {(item) => (
                <label data-slot="label">
                  <Checkbox value={item.value} disabled={item.disabled}>
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
                  {item.label}
                </label>
              )}
            </For>
          </div>
        </CheckboxGroup>
      </div>
    </div>
  )
}

export { Example }
