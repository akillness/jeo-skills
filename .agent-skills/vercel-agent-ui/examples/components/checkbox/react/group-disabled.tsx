import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

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
          {backups.map((item) => (
            <label data-slot="label" key={item.value}>
              <Checkbox value={item.value}>
                <CheckboxIndicator>
                  <CheckIcon aria-hidden="true" />
                </CheckboxIndicator>
              </Checkbox>
              {item.label}
            </label>
          ))}
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
                <CheckIcon aria-hidden="true" />
                <MinusIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
            Select all
          </label>
          <div data-slot="stack">
            {folders.map((item) => (
              <label data-slot="label" key={item.value}>
                <Checkbox value={item.value} disabled={item.disabled}>
                  <CheckboxIndicator>
                    <CheckIcon aria-hidden="true" />
                  </CheckboxIndicator>
                </Checkbox>
                {item.label}
              </label>
            ))}
          </div>
        </CheckboxGroup>
      </div>
    </div>
  )
}

export { Example }
