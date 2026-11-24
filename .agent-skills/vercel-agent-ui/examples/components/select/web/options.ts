import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import type { ListData } from "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const sizeGroups = [
  { type: "group", label: "Common", items: ["Small", "Medium", "Large"] },
  { type: "group", label: "Extended", items: ["Extra small", "Extra large"] },
] satisfies ListData

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Size</ui-field-label>
      <ui-select name="size" default-value="Medium">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${sizeGroups
            .map(
              (group) => `
                <ui-select-group>
                  <ui-select-group-label>${group.label}</ui-select-group-label>
                  ${group.items
                    .map(
                      (size) => `
                        <ui-select-item value="${size}">
                          ${size}
                          <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                        </ui-select-item>
                      `
                    )
                    .join("")}
                </ui-select-group>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
  root.querySelector("ui-select")!.items = sizeGroups
}

export { mount }
