import "@ui-sdk/web/listbox"
import { Archive, ArrowRight, createElement, Mail, Pencil, Star } from "lucide"

const views = [
  { value: "inbox", label: "Inbox", icon: Mail },
  { value: "starred", label: "Starred", icon: Star },
  { value: "drafts", label: "Drafts", icon: Pencil },
  { value: "archive", label: "Archive", icon: Archive },
  { value: "next", label: "Next page", icon: ArrowRight },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-listbox default-value="inbox" aria-label="Mailbox">
      ${views
        .map(
          (view) => `
            <ui-listbox-item value="${view.value}">
              <ui-listbox-item-icon${view.icon === ArrowRight ? " mirror" : ""}>${createElement(view.icon, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-icon>
              ${view.label}
            </ui-listbox-item>`
        )
        .join("")}
    </ui-listbox>
  `
}

export { mount }
