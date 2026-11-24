import "@ui-sdk/web/resizable"
import type { ResizableStorage } from "@ui-sdk/web"

const session: ResizableStorage = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
}

function mount(root: HTMLElement) {
  const group = document.createElement("ui-resizable")
  group.storage = session
  group.setAttribute("auto-save-id", "docs-storage")
  group.innerHTML = `
    <ui-resizable-panel id="session-chats" default-size="35" min-size="20">
      <h3>Messages</h3>
      <ul>
        <li>Inès Moreau</li>
        <li>Kofi Mensah</li>
        <li>Wren Takahashi</li>
      </ul>
    </ui-resizable-panel>
    <ui-resizable-handle aria-label="Resize messages"></ui-resizable-handle>
    <ui-resizable-panel id="session-thread" min-size="20">
      <h3>Inès Moreau</h3>
      <span data-slot="hint">Can we move the review to Friday?</span>
    </ui-resizable-panel>
  `
  root.replaceChildren(group)
}

export { mount }
