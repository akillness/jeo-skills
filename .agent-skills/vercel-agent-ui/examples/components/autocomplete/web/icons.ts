import "@ui-sdk/web/autocomplete"
import {
  Archive,
  Clock,
  createElement,
  File,
  Pencil,
  Reply,
  Star,
} from "lucide"

const mailSearches = [
  { value: "Starred", icon: Star },
  { value: "Drafts", icon: Pencil },
  { value: "Replies", icon: Reply, mirror: true },
  { value: "Attachments", icon: File },
  { value: "Archived", icon: Archive },
  { value: "Scheduled", icon: Clock },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-autocomplete>
      <ui-autocomplete-input>
        <input type="search" aria-label="Search mail" placeholder="Search mail…" />
      </ui-autocomplete-input>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-empty>No searches found.</ui-autocomplete-empty>
        <ui-autocomplete-list>
          ${mailSearches
            .map(
              (search) => `
                <ui-autocomplete-item value="${search.value}"><ui-autocomplete-item-icon ${search.mirror ? "mirror" : ""}>${createElement(search.icon, { "aria-hidden": "true" }).outerHTML}</ui-autocomplete-item-icon>${search.value}</ui-autocomplete-item>
              `
            )
            .join("")}
        </ui-autocomplete-list>
      </ui-autocomplete-content>
    </ui-autocomplete>
  `
}

export { mount }
