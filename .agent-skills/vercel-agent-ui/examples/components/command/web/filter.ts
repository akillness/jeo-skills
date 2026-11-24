import "@ui-sdk/web/command"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const commands = [
  { label: "Home" },
  { label: "Inbox", keywords: ["mail", "messages"] },
  { label: "Documents" },
  { label: "Downloads" },
  { label: "New file" },
  { label: "New folder" },
  { label: "Copy" },
  { label: "Paste" },
  { label: "Delete", keywords: ["remove", "trash"] },
  { label: "Zoom in" },
  { label: "Zoom out" },
  { label: "Search emoji", keywords: ["smiley", "face"] },
  { label: "Keyboard shortcuts", keywords: ["hotkeys"] },
  { label: "Settings", keywords: ["preferences"] },
]

const modes = [
  { value: "fuzzy", label: "Fuzzy" },
  { value: "contains", label: "Contains" },
  { value: "startsWith", label: "Starts with" },
  { value: "words", label: "Words" },
]
type Mode = "fuzzy" | "contains" | "startsWith" | "words"

function words(item: { label: string }, query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) =>
      item.label
        .toLowerCase()
        .split(" ")
        .some((part) => part.startsWith(word))
    )
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <ui-select default-value="fuzzy">
          <ui-select-label>Filter</ui-select-label>
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content hidden>
            ${modes
              .map(
                (option) => `
                  <ui-select-item value="${option.value}">
                    ${option.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </div>
      <ui-command>
        <ui-command-input>
          <input aria-label="Search commands" placeholder="Try “nf”, “zo in” or “smiley”" />
        </ui-command-input>
        <ui-command-empty>No results found.</ui-command-empty>
        <ui-command-list>
          ${commands
            .map(
              (command) =>
                `<ui-command-item value="${command.label}"${command.keywords ? ` keywords="${command.keywords.join(",")}"` : ""}>${command.label}</ui-command-item>`
            )
            .join("")}
        </ui-command-list>
      </ui-command>
    </div>
  `
  const command = root.querySelector("ui-command")!
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    const mode = event.detail.value as Mode | null
    if (mode) {
      command.filter = mode === "words" ? words : mode
    }
  })
}

export { mount }
