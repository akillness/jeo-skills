import "@ui-sdk/web/tabs"
import { Archive, createElement, Mail, Reply } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tabs default-value="inbox">
      <ui-tabs-list aria-label="Mail">
        <ui-tabs-tab value="inbox">
          <button type="button">
            <ui-tabs-tab-icon>${createElement(Mail, { "aria-hidden": "true" }).outerHTML}</ui-tabs-tab-icon>
            Inbox
          </button>
        </ui-tabs-tab>
        <ui-tabs-tab value="replies">
          <button type="button">
            <ui-tabs-tab-icon mirror>${createElement(Reply, { "aria-hidden": "true" }).outerHTML}</ui-tabs-tab-icon>
            Replies
          </button>
        </ui-tabs-tab>
        <ui-tabs-tab value="archive">
          <button type="button">
            <ui-tabs-tab-icon>${createElement(Archive, { "aria-hidden": "true" }).outerHTML}</ui-tabs-tab-icon>
            Archive
          </button>
        </ui-tabs-tab>
      </ui-tabs-list>
      <ui-tabs-panel value="inbox">3 new messages from Inès Moreau and Kofi Mensah.</ui-tabs-panel>
      <ui-tabs-panel value="replies">Wren Takahashi replied to your message about the launch.</ui-tabs-panel>
      <ui-tabs-panel value="archive">Messages you archived stay here and in search.</ui-tabs-panel>
    </ui-tabs>
  `
}

export { mount }
