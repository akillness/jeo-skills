import "@ui-sdk/web/checkbox"
import { Check, createElement, Minus } from "lucide"

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

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="stack">
        <h3 id="disabled-backups">Backups</h3>
        <p data-slot="hint">Managed by your organization.</p>
        <ui-checkbox-group aria-labelledby="disabled-backups" default-value="photos,documents" disabled>
          ${backups
            .map(
              (item) => `
                <label data-slot="label">
                  <ui-checkbox value="${item.value}">
                    <ui-checkbox-indicator>
                      ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                    </ui-checkbox-indicator>
                  </ui-checkbox>
                  ${item.label}
                </label>
              `
            )
            .join("")}
        </ui-checkbox-group>
      </div>
      <div data-slot="stack">
        <h3 id="disabled-folders">Sync folders</h3>
        <ui-checkbox-group
          aria-labelledby="disabled-folders"
          default-value="desktop"
          all-values="${folders.map((item) => item.value).join(",")}"
        >
          <label data-slot="label">
            <ui-checkbox parent>
              <ui-checkbox-indicator>
                ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
              </ui-checkbox-indicator>
            </ui-checkbox>
            Select all
          </label>
          <div data-slot="stack">
            ${folders
              .map(
                (item) => `
                  <label data-slot="label">
                    <ui-checkbox value="${item.value}"${item.disabled ? " disabled" : ""}>
                      <ui-checkbox-indicator>
                        ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                      </ui-checkbox-indicator>
                    </ui-checkbox>
                    ${item.label}
                  </label>
                `
              )
              .join("")}
          </div>
        </ui-checkbox-group>
      </div>
    </div>
  `
}

export { mount }
